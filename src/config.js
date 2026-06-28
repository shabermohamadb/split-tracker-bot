const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const SPREADSHEET_URL = process.env.SPREADSHEET_URL || '';
const SPREADSHEET_URL_2 = process.env.SPREADSHEET_URL_2 || '';

// Extract spreadsheet ID from URL
function extractSpreadsheetId(url) {
  if (!url) return null;
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

const spreadsheetId = extractSpreadsheetId(SPREADSHEET_URL);
const spreadsheetId2 = extractSpreadsheetId(SPREADSHEET_URL_2);

// Validate critical configurations
if (!SPREADSHEET_URL) {
  console.error('WARNING: SPREADSHEET_URL is not set in the .env file.');
} else if (!spreadsheetId) {
  console.error('ERROR: Could not parse spreadsheet ID from SPREADSHEET_URL. Please check its format.');
}

if (SPREADSHEET_URL_2 && !spreadsheetId2) {
  console.error('ERROR: Could not parse spreadsheet ID from SPREADSHEET_URL_2. Please check its format.');
}

module.exports = {
  discordToken: process.env.DISCORD_TOKEN || '',
  clientId: process.env.DISCORD_CLIENT_ID || '',
  guildId: process.env.DISCORD_GUILD_ID || '',
  spreadsheetUrl: SPREADSHEET_URL,
  spreadsheetId: spreadsheetId,
  spreadsheetUrl2: SPREADSHEET_URL_2,
  spreadsheetId2: spreadsheetId2,
  owner1: process.env.SPREADSHEET_OWNER_1 || 'JosephSteel',
  owner2: process.env.SPREADSHEET_OWNER_2 || 'King',
  pollIntervalMs: (parseInt(process.env.POLL_INTERVAL_MINUTES, 10) || 1) * 60 * 1000,
  notificationChannelId: process.env.NOTIFICATION_CHANNEL_ID || null,
  adminRoleId: process.env.ADMIN_ROLE_ID || null,
};
