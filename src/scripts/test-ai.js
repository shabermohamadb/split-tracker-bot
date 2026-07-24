const assert = require('assert');
const memory = require('../ai/memory');
const client = require('../ai/client');
const aiConfig = require('../ai/config');

console.log('🧪 Starting AI Writing Assistant Unit Tests...');

// 1. Test Token Estimator
console.log('\nTesting Token Estimator...');
const testText = 'Hello world, this is a test story block.';
const estimate = client.estimateTokens(testText);
console.log(`Estimated Tokens for "${testText}": ${estimate}`);
assert(estimate > 0, 'Estimated tokens should be greater than 0');

// 2. Test Message Splitter (Plain Text)
console.log('\nTesting Message Splitter (Plain Text)...');
const longText = 'Paragraph 1\n\n' + 'a'.repeat(2500) + '\n\nParagraph 3';
const plainChunks = memory.splitMessage(longText, 1900);
console.log(`Split long text into ${plainChunks.length} chunks`);
assert(plainChunks.length === 3, 'Should split into 3 chunks');
assert(plainChunks[0].includes('Paragraph 1'), 'Chunk 1 should contain Paragraph 1');
assert(plainChunks[2].includes('Paragraph 3'), 'Chunk 3 should contain Paragraph 3');

// 3. Test Message Splitter (Markdown Code Blocks)
console.log('\nTesting Message Splitter (Markdown Code Blocks)...');
const codeBlockText = 'Here is code:\n```javascript\n' + 'console.log("hello");\n'.repeat(100) + '```\nEnd of response.';
const codeChunks = memory.splitMessage(codeBlockText, 1000);
console.log(`Split code block text into ${codeChunks.length} chunks`);
assert(codeChunks.length > 1, 'Should split code block across multiple chunks');
for (let i = 0; i < codeChunks.length; i++) {
  const chunk = codeChunks[i];
  if (i < codeChunks.length - 1) {
    assert(chunk.endsWith('```'), `Chunk ${i} should end with closed code block ticks`);
  }
  if (i > 0) {
    assert(chunk.startsWith('```javascript'), `Chunk ${i} should begin with reopened code block language tag`);
  }
}
console.log('✅ Code block formatting splits validated successfully.');

// 4. Test Context Pruner
console.log('\nTesting Context Pruning...');
const systemMsg = { role: 'system', content: 'You are an editor.' };
const attachmentMsg = { role: 'system', content: 'Attached Document:\nThis is a story draft.' };
const turn1_user = { role: 'user', content: 'Prompt 1' };
const turn1_bot = { role: 'assistant', content: 'Reply 1' };
const turn2_user = { role: 'user', content: 'Prompt 2' };
const turn2_bot = { role: 'assistant', content: 'Reply 2' };

const fullContext = [systemMsg, attachmentMsg, turn1_user, turn1_bot, turn2_user, turn2_bot];
const pruned = memory.pruneContext(fullContext, 20); // Set very small token budget to force pruning

console.log(`Original history length: ${fullContext.length}`);
console.log(`Pruned history length: ${pruned.length}`);

// Verifications
assert(pruned[0].role === 'system' && pruned[0].content === 'You are an editor.', 'Should preserve first system message');
assert(pruned[1].role === 'system' && pruned[1].content.includes('Attached Document:'), 'Should preserve attached document context');
assert(pruned[pruned.length - 1].role === 'assistant' && pruned[pruned.length - 1].content === 'Reply 2', 'Should preserve the latest turn');
console.log('✅ Context pruning turns preservation validated successfully.');

console.log('\n🎉 All AI Assistant Unit Tests Passed Successfully!');
