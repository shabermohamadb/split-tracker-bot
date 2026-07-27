const axios = require('axios');
const aiConfig = require('./config');

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function convertMessagesToGemini(messages) {
  let systemText = '';
  const contents = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemText += (systemText ? '\n' : '') + msg.content;
    } else {
      const geminiRole = msg.role === 'assistant' ? 'model' : 'user';
      contents.push({
        role: geminiRole,
        parts: [{ text: msg.content }]
      });
    }
  }

  const payload = { contents };
  if (systemText) {
    payload.systemInstruction = {
      parts: [{ text: systemText }]
    };
  }
  return payload;
}

async function callGeminiDirect(messages, options, onChunk) {
  const modelName = 'gemini-flash-latest';
  const payload = convertMessagesToGemini(messages);
  payload.generationConfig = {
    temperature: options.temperature !== undefined ? options.temperature : aiConfig.temperature,
    maxOutputTokens: options.maxTokens || aiConfig.maxTokens
  };

  const key = aiConfig.geminiApiKey;

  if (onChunk) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?key=${key}`;
    const response = await axios.post(url, payload, { responseType: 'stream', timeout: 30000 });

    return new Promise((resolve, reject) => {
      let fullText = '';
      let buffer = '';

      response.data.on('data', chunk => {
        buffer += chunk.toString();
        let startIdx;
        while ((startIdx = buffer.indexOf('"text": "')) !== -1) {
          const textStart = startIdx + 9;
          let endIdx = textStart;
          while (endIdx < buffer.length) {
            if (buffer[endIdx] === '"' && buffer[endIdx - 1] !== '\\') {
              break;
            }
            endIdx++;
          }
          if (endIdx >= buffer.length) break;

          const escapedValue = buffer.substring(textStart, endIdx);
          try {
            const unescaped = JSON.parse('"' + escapedValue + '"');
            if (unescaped) {
              fullText += unescaped;
              onChunk(unescaped);
            }
          } catch (err) {}
          buffer = buffer.substring(endIdx + 1);
        }
      });

      response.data.on('end', () => {
        const inputTokens = estimateTokens(JSON.stringify(messages));
        const outputTokens = estimateTokens(fullText);
        resolve({
          content: fullText,
          model: modelName,
          usage: {
            prompt_tokens: inputTokens,
            completion_tokens: outputTokens,
            total_tokens: inputTokens + outputTokens
          }
        });
      });

      response.data.on('error', err => reject(err));
    });
  } else {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`;
    const response = await axios.post(url, payload, { timeout: 30000 });
    const content = response.data.candidates[0].content.parts[0].text;
    return {
      content,
      model: modelName,
      usage: {
        prompt_tokens: estimateTokens(JSON.stringify(messages)),
        completion_tokens: estimateTokens(content),
        total_tokens: estimateTokens(JSON.stringify(messages)) + estimateTokens(content)
      }
    };
  }
}

async function callAINonStream(messages, options = {}) {
  const url = `${aiConfig.baseUrl}/chat/completions`;
  const modelName = options.model || aiConfig.model;
  const temp = options.temperature !== undefined ? options.temperature : aiConfig.temperature;
  const maxT = options.maxTokens || aiConfig.maxTokens;

  const response = await axios.post(
    url,
    {
      model: modelName,
      messages: messages,
      temperature: temp,
      max_tokens: maxT,
      stream: false
    },
    {
      headers: {
        'Authorization': `Bearer ${aiConfig.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: options.timeout || 45000
    }
  );

  const usage = response.data.usage || {
    prompt_tokens: estimateTokens(JSON.stringify(messages)),
    completion_tokens: estimateTokens(response.data.choices[0].message.content)
  };

  return {
    content: response.data.choices[0].message.content,
    model: response.data.model || modelName,
    usage
  };
}

async function callAIStream(messages, options = {}, onChunk) {
  const url = `${aiConfig.baseUrl}/chat/completions`;
  const modelName = options.model || aiConfig.model;
  const temp = options.temperature !== undefined ? options.temperature : aiConfig.temperature;
  const maxT = options.maxTokens || aiConfig.maxTokens;

  const response = await axios.post(
    url,
    {
      model: modelName,
      messages: messages,
      temperature: temp,
      max_tokens: maxT,
      stream: true
    },
    {
      headers: {
        'Authorization': `Bearer ${aiConfig.apiKey}`,
        'Content-Type': 'application/json'
      },
      responseType: 'stream',
      timeout: options.timeout || 30000
    }
  );

  return new Promise((resolve, reject) => {
    let fullText = '';
    let buffer = '';

    response.data.on('data', chunk => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const cleanLine = line.trim();
        if (!cleanLine) continue;
        if (cleanLine === 'data: [DONE]') continue;
        if (cleanLine.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(cleanLine.substring(6));
            const token = parsed.choices?.[0]?.delta?.content || '';
            if (token) {
              fullText += token;
              onChunk(token);
            }
          } catch (err) {
          }
        }
      }
    });

    response.data.on('end', () => {
      if (buffer.trim().startsWith('data: ') && !buffer.trim().endsWith('[DONE]')) {
        try {
          const parsed = JSON.parse(buffer.trim().substring(6));
          const token = parsed.choices?.[0]?.delta?.content || '';
          if (token) {
            fullText += token;
            onChunk(token);
          }
        } catch (err) {
        }
      }

      const inputTokens = estimateTokens(JSON.stringify(messages));
      const outputTokens = estimateTokens(fullText);

      resolve({
        content: fullText,
        model: modelName,
        usage: {
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens
        }
      });
    });

    response.data.on('error', err => {
      reject(err);
    });
  });
}

async function getCompletion(messages, options = {}, onChunk = null) {
  const isGemini = options.model?.includes('gemini') || options.model === 'google/gemini-2.5-flash' || options.model === 'google/gemini-flash-latest';
  
  if (isGemini && aiConfig.geminiApiKey) {
    return await callGeminiDirect(messages, options, onChunk);
  }

  if (!aiConfig.apiKey) {
    throw new Error('AI_API_KEY is not configured.');
  }

  let attempt = 0;
  const maxRetries = 3;
  let delay = 1000;

  while (attempt < maxRetries) {
    try {
      if (onChunk) {
        return await callAIStream(messages, options, onChunk);
      } else {
        return await callAINonStream(messages, options);
      }
    } catch (err) {
      attempt++;
      const isRateLimit = err.response?.status === 429;
      const isServerError = err.response?.status >= 500;

      if (attempt >= maxRetries || (!isRateLimit && !isServerError)) {
        throw new Error(`AI API completed with error: ${err.message}`);
      }

      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

module.exports = {
  getCompletion,
  estimateTokens
};
