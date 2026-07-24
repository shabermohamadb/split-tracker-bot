const axios = require('axios');
const aiConfig = require('./config');

/**
 * Heuristic token estimation (1 token ≈ 4 characters in English).
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Standard non-streaming chat completion request.
 */
async function callAINonStream(messages, options = {}) {
  const url = `${aiConfig.baseUrl}/chat/completions`;
  const modelName = options.model || aiConfig.model;
  const temp = options.temperature !== undefined ? options.temperature : aiConfig.temperature;
  const maxT = options.maxTokens || aiConfig.maxTokens;

  if (aiConfig.debugMode) {
    console.log(`[AI Client] Sending non-stream request to ${url} (Model: ${modelName})`);
  }

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

/**
 * Server-Sent Events (SSE) streaming completion request.
 */
async function callAIStream(messages, options = {}, onChunk) {
  const url = `${aiConfig.baseUrl}/chat/completions`;
  const modelName = options.model || aiConfig.model;
  const temp = options.temperature !== undefined ? options.temperature : aiConfig.temperature;
  const maxT = options.maxTokens || aiConfig.maxTokens;

  if (aiConfig.debugMode) {
    console.log(`[AI Client] Sending stream request to ${url} (Model: ${modelName})`);
  }

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
      buffer = lines.pop(); // Keep partial line in buffer

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
            // Wait for rest of the SSE line
          }
        }
      }
    });

    response.data.on('end', () => {
      // Process remaining buffer
      if (buffer.trim().startsWith('data: ') && !buffer.trim().endsWith('[DONE]')) {
        try {
          const parsed = JSON.parse(buffer.trim().substring(6));
          const token = parsed.choices?.[0]?.delta?.content || '';
          if (token) {
            fullText += token;
            onChunk(token);
          }
        } catch (err) {
          // Ignore partial final lines
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

/**
 * Main completion call entry point with automatic exponential retries.
 */
async function getCompletion(messages, options = {}, onChunk = null) {
  if (!aiConfig.apiKey) {
    throw new Error('AI_API_KEY is not configured in environment variables.');
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
      
      console.error(`[AI Client] API Error (Attempt ${attempt}/${maxRetries}):`, err.message);

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
