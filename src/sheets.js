const axios = require('axios');
const config = require('./config');

/**
 * Standard CSV parser that handles double quotes and commas within cells.
 */
function parseCSV(csvText) {
  const lines = csvText.split(/\r?\n/);
  const result = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    const row = [];
    let insideQuote = false;
    let entry = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        insideQuote = !insideQuote;
      } else if (char === ',' && !insideQuote) {
        row.push(entry);
        entry = '';
      } else {
        entry += char;
      }
    }
    row.push(entry);
    result.push(row.map(cell => cell.trim().replace(/^"|"$/g, '').trim()));
  }
  return result;
}

/**
 * Fetches sheet data and parses player balances, including session-specific splits and comments.
 */
async function fetchSheetData() {
  if (!config.spreadsheetId) {
    throw new Error('Spreadsheet ID is not configured.');
  }

  const exportUrl = `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/export?format=csv`;
  
  try {
    const response = await axios.get(exportUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AntigravitySplitTrackerBot/1.0',
      }
    });

    const csvData = response.data;
    if (!csvData || typeof csvData !== 'string') {
      throw new Error('Received invalid or empty data from spreadsheet export.');
    }

    const parsedRows = parseCSV(csvData);
    
    // Find header row starting with "NAMES"
    const headers = parsedRows.find(row => row[0] && row[0].toUpperCase() === 'NAMES');
    if (!headers) {
      throw new Error('Could not find header row starting with "NAMES" in spreadsheet.');
    }
    const headerIndex = parsedRows.indexOf(headers);

    // Find first player row (first row after headers where name is not empty and not metadata)
    const firstPlayerIndex = parsedRows.findIndex((row, idx) => {
      if (idx <= headerIndex) return false;
      const name = row[0];
      if (!name) return false;
      const norm = name.toUpperCase();
      if (norm === 'TOTAL' || norm.includes('TILL') || norm.includes('WITHDRAWABLE')) return false;
      return true;
    });

    if (firstPlayerIndex === -1) {
      throw new Error('Could not find player data rows in spreadsheet.');
    }

    // Extract comments/formulas for session columns (index 4 and onwards)
    // We look at all metadata rows between headerIndex + 1 and firstPlayerIndex - 1
    const sessionMeta = {};
    for (let j = 4; j < headers.length; j++) {
      const colHeader = headers[j];
      const comments = [];
      for (let r = headerIndex + 1; r < firstPlayerIndex; r++) {
        const val = parsedRows[r][j]?.trim();
        if (val) {
          comments.push(val);
        }
      }
      sessionMeta[colHeader] = comments;
    }

    const players = [];

    // Parse player rows
    for (let idx = firstPlayerIndex; idx < parsedRows.length; idx++) {
      const row = parsedRows[idx];
      if (row.length === 0) continue;

      const name = row[0];
      if (!name) continue;

      const normalizedName = name.toUpperCase();
      if (normalizedName === 'TOTAL') continue; // Skip totals row at the bottom

      // Columns layout (0-indexed):
      // 0: NAMES
      // 1: FINE/ WITHDRAWS
      // 2: TOTAL (Current Active Balance)
      // 3: BALANCE (Starting Balance)
      const fineVal = row[1] ? parseFloat(row[1].replace(/,/g, '')) : 0;
      const totalVal = row[2] ? parseFloat(row[2].replace(/,/g, '')) : 0;
      const balanceVal = row[3] ? parseFloat(row[3].replace(/,/g, '')) : 0;

      // Extract session splits
      const playerSessions = [];
      for (let j = 4; j < row.length; j++) {
        const valStr = row[j]?.trim();
        if (valStr) {
          const val = parseFloat(valStr.replace(/,/g, ''));
          // Keep splits (even if 0, but usually if blank they didn't participate)
          if (!isNaN(val) && val !== 0) {
            playerSessions.push({
              sessionName: headers[j],
              amount: val,
              comments: sessionMeta[headers[j]] || []
            });
          }
        }
      }

      players.push({
        name: name, // Preserve original casing
        fine: isNaN(fineVal) ? 0 : fineVal,
        total: isNaN(totalVal) ? 0 : totalVal,
        balance: isNaN(balanceVal) ? 0 : balanceVal,
        sessions: playerSessions
      });
    }

    return players;
  } catch (error) {
    console.error('Failed to fetch spreadsheet data:', error.message);
    throw error;
  }
}

module.exports = {
  fetchSheetData,
};
