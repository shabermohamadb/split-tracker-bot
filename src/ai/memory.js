const client = require('./client');

function splitMessage(text, limit = 1900) {
  if (!text) return [];
  if (text.length <= limit) return [text];

  const chunks = [];
  let currentChunk = '';
  let insideCodeBlock = false;
  let codeBlockLanguage = '';

  const lines = text.split('\n');

  for (let line of lines) {
    if (line.trim().startsWith('```')) {
      if (insideCodeBlock) {
        insideCodeBlock = false;
        codeBlockLanguage = '';
      } else {
        insideCodeBlock = true;
        codeBlockLanguage = line.trim().substring(3).trim();
      }
    }

    if (line.length > limit) {
      if (currentChunk.trim().length > 0) {
        if (insideCodeBlock) {
          currentChunk += '\n```';
        }
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      let remaining = line;
      while (remaining.length > limit) {
        let piece = remaining.substring(0, limit);
        
        if (insideCodeBlock && !piece.endsWith('```')) {
          piece += '\n```';
        }
        chunks.push(piece.trim());
        
        remaining = remaining.substring(limit);
        if (insideCodeBlock) {
          remaining = '```' + codeBlockLanguage + '\n' + remaining;
        }
      }
      currentChunk = remaining;
      continue;
    }

    if (currentChunk.length + line.length + 1 > limit) {
      if (currentChunk.trim().length > 0) {
        if (insideCodeBlock) {
          currentChunk += '\n```';
        }
        chunks.push(currentChunk.trim());
      }

      if (insideCodeBlock) {
        currentChunk = '```' + codeBlockLanguage + '\n' + line;
      } else {
        currentChunk = line;
      }
    } else {
      if (currentChunk.length > 0) {
        currentChunk += '\n' + line;
      } else {
        currentChunk = line;
      }
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

function pruneContext(messages, contextLimit) {
  if (messages.length <= 1) return messages;

  const totalTokens = client.estimateTokens(JSON.stringify(messages));
  if (totalTokens <= contextLimit) {
    return messages;
  }

  const systemMsg = messages[0];
  let startIndex = 1;

  let attachmentMsg = null;
  if (messages[1] && messages[1].role === 'system' && messages[1].content.includes('Attached Document:')) {
    attachmentMsg = messages[1];
    startIndex = 2;
  }

  const chatHistory = messages.slice(startIndex);

  while (chatHistory.length > 2) {
    chatHistory.shift();
    chatHistory.shift();

    const candidate = [systemMsg];
    if (attachmentMsg) candidate.push(attachmentMsg);
    const finalMsg = candidate.concat(chatHistory);

    if (client.estimateTokens(JSON.stringify(finalMsg)) <= contextLimit) {
      return finalMsg;
    }
  }

  const fallback = [systemMsg];
  if (attachmentMsg) fallback.push(attachmentMsg);
  if (chatHistory.length > 0) {
    fallback.push(chatHistory[chatHistory.length - 1]);
  }
  return fallback;
}

module.exports = {
  splitMessage,
  pruneContext
};
