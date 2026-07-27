const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const apiKey = process.env.AI_API_KEY || '';
const baseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
const model = process.env.AI_MODEL || 'gpt-4o';
const geminiApiKey = process.env.GEMINI_API_KEY || '';
const temperature = parseFloat(process.env.AI_TEMPERATURE) || 0.7;
const maxTokens = parseInt(process.env.AI_MAX_TOKENS, 10) || 2048;
const contextLimit = parseInt(process.env.AI_CONTEXT_LIMIT, 10) || 16384;

const allowedRoles = process.env.AI_ALLOWED_ROLES 
  ? process.env.AI_ALLOWED_ROLES.split(',').map(id => id.trim()).filter(id => id.length > 0)
  : [];

const allowedChannels = process.env.AI_ALLOWED_CHANNELS
  ? process.env.AI_ALLOWED_CHANNELS.split(',').map(id => id.trim()).filter(id => id.length > 0)
  : [];

const dailyTokenLimit = parseInt(process.env.AI_DAILY_TOKEN_LIMIT, 10) || 500000;
const cooldownSec = parseInt(process.env.AI_COOLDOWN_SEC, 10) || 5;
const debugMode = process.env.AI_DEBUG === 'true';

module.exports = {
  enabled: process.env.AI_MODULE_ENABLED === 'true',
  apiKey,
  baseUrl,
  model,
  geminiApiKey,
  temperature,
  maxTokens,
  contextLimit,
  allowedRoles,
  allowedChannels,
  dailyTokenLimit,
  cooldownSec,
  debugMode
};
