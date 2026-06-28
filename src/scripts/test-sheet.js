const { fetchSheetData } = require('../sheets');
const config = require('../config');

async function test() {
  console.log('Testing Google Sheets parser...');
  console.log(`Spreadsheet URL: ${config.spreadsheetUrl}`);
  console.log(`Spreadsheet ID: ${config.spreadsheetId}`);
  
  if (!config.spreadsheetId) {
    console.error('Error: Spreadsheet ID is null. Check SPREADSHEET_URL in .env');
    process.exit(1);
  }

  try {
    const players = await fetchSheetData();
    console.log(`\nSuccessfully fetched and parsed ${players.length} players.\n`);
    
    console.log('--- Sample Player Records ---');
    console.log(players.slice(0, 10)); // print first 10 players
    
    console.log('\n--- Checking specific players ---');
    const blackHeart = players.find(p => p.name.toUpperCase() === 'BLACK HEART');
    console.log('BLACK HEART:', blackHeart);

    const king = players.find(p => p.name.toUpperCase() === 'KING');
    console.log('KING:', king);

    const curse = players.find(p => p.name.toUpperCase() === 'CURSEOFGRINDING');
    console.log('CURSEOFGRINDING:', curse);
  } catch (error) {
    console.error('Test failed:', error);
  }
}

test();
