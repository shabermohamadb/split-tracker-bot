const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const key = process.env.GEMINI_API_KEY;

if (!key) {
  console.error('❌ GEMINI_API_KEY is not set in .env');
  process.exit(1);
}

console.log('Testing direct Gemini API call...');
console.log('Using Key prefix:', key.substring(0, 15) + '...');

const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`;

axios.post(url, {
  contents: [
    {
      role: 'user',
      parts: [{ text: 'Hello, respond with one word: Success!' }]
    }
  ]
})
.then(res => {
  console.log('✅ Success!');
  console.log('Response:', res.data.candidates[0].content.parts[0].text);
})
.catch(err => {
  console.error('❌ Error calling Gemini API:');
  if (err.response) {
    console.error(`Status: ${err.response.status}`);
    console.error('Response Data:', JSON.stringify(err.response.data, null, 2));
  } else {
    console.error(err.message);
  }
});
