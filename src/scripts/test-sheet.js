const { fetchSheetData } = require('../sheets');
const config = require('../config');

async function test() {
  console.log('Testing Google Sheets parser...');
  
  // Sheet 1
  console.log(`\nSpreadsheet 1 (${config.owner1}) URL: ${config.spreadsheetUrl}`);
  console.log(`Spreadsheet 1 ID: ${config.spreadsheetId}`);
  if (!config.spreadsheetId) {
    console.error('Error: Spreadsheet ID is null. Check SPREADSHEET_URL in .env');
    process.exit(1);
  }

  try {
    const players1 = await fetchSheetData(config.spreadsheetId);
    console.log(`Successfully fetched and parsed ${players1.length} players from Sheet 1.`);
  } catch (error) {
    console.error('Sheet 1 test failed:', error);
  }

  // Sheet 2
  if (config.spreadsheetId2) {
    console.log(`\nSpreadsheet 2 (${config.owner2}) URL: ${config.spreadsheetUrl2}`);
    console.log(`Spreadsheet 2 ID: ${config.spreadsheetId2}`);
    try {
      const players2 = await fetchSheetData(config.spreadsheetId2);
      console.log(`Successfully fetched and parsed ${players2.length} players from Sheet 2.`);
      
      console.log('--- Sample Player Records (Sheet 2) ---');
      console.log(players2.slice(0, 5)); // print first 5 players
    } catch (error) {
      console.error('Sheet 2 test failed:', error);
    }
  }
}

test();
