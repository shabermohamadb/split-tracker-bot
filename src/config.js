const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const SPREADSHEET_URL = process.env.SPREADSHEET_URL || '';

// Extract spreadsheet ID from URL
function extractSpreadsheetId(url) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

const spreadsheetId = extractSpreadsheetId(SPREADSHEET_URL);

// Validate critical configurations
if (!SPREADSHEET_URL) {
  console.error('WARNING: SPREADSHEET_URL is not set in the .env file.');
} else if (!spreadsheetId) {
  console.error('ERROR: Could not parse spreadsheet ID from SPREADSHEET_URL. Please check its format.');
}

module.exports = {
  discordToken: process.env.DISCORD_TOKEN || '',
  clientId: process.env.DISCORD_CLIENT_ID || '',
  guildId: process.env.DISCORD_GUILD_ID || '',
  spreadsheetUrl: SPREADSHEET_URL,
  spreadsheetId: spreadsheetId,
  pollIntervalMs: (parseInt(process.env.POLL_INTERVAL_MINUTES, 10) || 10) * 60 * 1000,
  notificationChannelId: process.env.NOTIFICATION_CHANNEL_ID || null,
  adminRoleId: process.env.ADMIN_ROLE_ID || null,
};
