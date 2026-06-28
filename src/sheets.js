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
 * Fetches sheet data and parses player balances.
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
    const players = [];

    for (const row of parsedRows) {
      if (row.length === 0) continue;

      const name = row[0];
      if (!name) continue; // Skip empty rows or rows with empty names (like metadata rows 1-3)

      // Normalize name to check for headers or total sums
      const normalizedName = name.toUpperCase();
      if (normalizedName === 'NAMES' || normalizedName === 'TOTAL') {
        continue; // Skip headers and totals row
      }

      // Check if this row is metadata (sometimes names column could contain notes)
      if (normalizedName.includes('TILL') || normalizedName.includes('WITHDRAWABLE')) {
        continue;
      }

      // Columns layout (0-indexed):
      // 0: NAMES
      // 1: FINE/ WITHDRAWS
      // 2: TOTAL
      // 3: BALANCE
      const fineVal = row[1] ? parseFloat(row[1].replace(/,/g, '')) : 0;
      const totalVal = row[2] ? parseFloat(row[2].replace(/,/g, '')) : 0;
      const balanceVal = row[3] ? parseFloat(row[3].replace(/,/g, '')) : 0;

      players.push({
        name: name, // Preserve original casing for display
        fine: isNaN(fineVal) ? 0 : fineVal,
        total: isNaN(totalVal) ? 0 : totalVal,
        balance: isNaN(balanceVal) ? 0 : balanceVal,
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
