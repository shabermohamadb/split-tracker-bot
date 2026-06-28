const { detectIGN } = require('../utils');

const mockPlayers = [
  { name: 'JOSEPHSTEALS' },
  { name: 'BLACK HEART' },
  { name: 'KING' },
  { name: 'ONIH' },
  { name: 'PURGE' },
  { name: 'CURSEOFGRINDING' },
  { name: 'JOE' }
];

const testCases = [
  // Exact & casing
  { input: 'PURGE', expected: 'PURGE' },
  { input: 'purge', expected: 'PURGE' },
  // Nickname delimiters
  { input: 'BLACK HEART | Officer', expected: 'BLACK HEART' },
  { input: '[GM] BLACK HEART', expected: 'BLACK HEART' },
  // Trailing / leading numbers
  { input: 'purge606', expected: 'PURGE' },
  { input: 'purge123', expected: 'PURGE' },
  { input: 'King123', expected: 'KING' },
  { input: '123KING', expected: 'KING' },
  // Combined number/delimiter
  { input: 'blackheart99', expected: 'BLACK HEART' },
  { input: 'curseofgrinding_606', expected: 'CURSEOFGRINDING' },
  // Negative checks (should NOT match)
  { input: 'Joel', expected: null }, // Should not match JOE
  { input: 'Kingsley', expected: null } // Should not match KING
];

console.log('Testing Auto-Detection Name Matching Engine...\n');
let passed = 0;

testCases.forEach((tc, idx) => {
  const result = detectIGN(tc.input, mockPlayers);
  const isMatch = result === tc.expected;
  
  if (isMatch) {
    passed++;
    console.log(`✅ TEST ${idx + 1} PASSED: "${tc.input}" matched to "${result}"`);
  } else {
    console.error(`❌ TEST ${idx + 1} FAILED: "${tc.input}" matched to "${result}", expected "${tc.expected}"`);
  }
});

console.log(`\nResults: Passed ${passed}/${testCases.length} tests.`);
process.exit(passed === testCases.length ? 0 : 1);
