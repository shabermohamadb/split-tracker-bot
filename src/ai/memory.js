const client = require('./client');

/**
 * Splits a long text response into chunk strings that fit within Discord's 2000-char limit.
 * Strategic handling of markdown code blocks is implemented so formatting is preserved across splits.
 */
function splitMessage(text, limit = 1900) {
  if (!text) return [];
  if (text.length <= limit) return [text];

  const chunks = [];
  let currentChunk = '';
  let insideCodeBlock = false;
  let codeBlockLanguage = '';

  const lines = text.split('\n');

  for (let line of lines) {
    // Check if this line toggles a code block
    if (line.trim().startsWith('```')) {
      if (insideCodeBlock) {
        insideCodeBlock = false;
        codeBlockLanguage = '';
      } else {
        insideCodeBlock = true;
        // Extract language tag if present (e.g. ```javascript -> javascript)
        codeBlockLanguage = line.trim().substring(3).trim();
      }
    }

    // If the line itself is longer than the limit, we must split it
    if (line.length > limit) {
      // Flush current chunk first if it has content
      if (currentChunk.trim().length > 0) {
        if (insideCodeBlock) {
          currentChunk += '\n```';
        }
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      // Slice the long line into limit-sized pieces
      let remaining = line;
      while (remaining.length > limit) {
        let piece = remaining.substring(0, limit);
        
        // Ensure code blocks are matched
        if (insideCodeBlock && !piece.endsWith('```')) {
          piece += '\n```';
        }
        chunks.push(piece.trim());
        
        // Prepare next piece, reopening code block if needed
        remaining = remaining.substring(limit);
        if (insideCodeBlock) {
          remaining = '```' + codeBlockLanguage + '\n' + remaining;
        }
      }
      currentChunk = remaining;
      continue;
    }

    // Normal line accumulation
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

/**
 * Checks message array sizes and prunes older chat turns (user/assistant message pairs)
 * to keep the total conversation size within the model's context budget.
 */
function pruneContext(messages, contextLimit) {
  if (messages.length <= 1) return messages;

  const totalTokens = client.estimateTokens(JSON.stringify(messages));
  if (totalTokens <= contextLimit) {
    return messages;
  }

  const systemMsg = messages[0];
  let startIndex = 1;

  // Preserve attached document context if it's the second message
  let attachmentMsg = null;
  if (messages[1] && messages[1].role === 'system' && messages[1].content.includes('Attached Document:')) {
    attachmentMsg = messages[1];
    startIndex = 2;
  }

  const chatHistory = messages.slice(startIndex);

  // Prune turns (1 turn = user + assistant pair)
  while (chatHistory.length > 2) {
    chatHistory.shift(); // Remove oldest user message
    chatHistory.shift(); // Remove oldest assistant reply

    const candidate = [systemMsg];
    if (attachmentMsg) candidate.push(attachmentMsg);
    const finalMsg = candidate.concat(chatHistory);

    if (client.estimateTokens(JSON.stringify(finalMsg)) <= contextLimit) {
      return finalMsg;
    }
  }

  // Fallback: keep only system, attachment, and the very last prompt
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
