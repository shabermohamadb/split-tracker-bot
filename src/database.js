const fs = require('fs');
const path = require('path');

const dbDir = path.join(__dirname, '../data');
const dbPath = path.join(dbDir, 'db.json');

// Memory cache of database state
let dbData = {
  user_links: {},
  balances: {}
};

/**
 * Saves memory state to db.json file atomically.
 */
function saveDb() {
  try {
    // Write to a temporary file first, then rename, to prevent file corruption on crash
    const tempPath = `${dbPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(dbData, null, 2), 'utf8');
    fs.renameSync(tempPath, dbPath);
  } catch (err) {
    console.error('[Database] Failed to write database file:', err.message);
  }
}

/**
 * Initializes database directory and file. Loads into memory.
 */
function initDb() {
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (fs.existsSync(dbPath)) {
    try {
      const content = fs.readFileSync(dbPath, 'utf8');
      dbData = JSON.parse(content);
      dbData.user_links = dbData.user_links || {};
      dbData.balances = dbData.balances || {};
    } catch (err) {
      console.error('[Database] File corrupt or unreadable. Resetting to empty database:', err.message);
      dbData = { user_links: {}, balances: {} };
      saveDb();
    }
  } else {
    saveDb();
  }
  console.log('Database (JSON-file) initialized successfully.');
}

// User Links Operations
function linkUser(discordId, ign) {
  dbData.user_links[discordId] = ign;
  saveDb();
  return { changes: 1 };
}

function unlinkUser(discordId) {
  if (dbData.user_links[discordId]) {
    delete dbData.user_links[discordId];
    saveDb();
    return { changes: 1 };
  }
  return { changes: 0 };
}

function getLinkByDiscordId(discordId) {
  const ign = dbData.user_links[discordId];
  if (ign) {
    return { discord_id: discordId, ign };
  }
  return null;
}

function getLinkByIgn(ign) {
  const targetLower = ign.toLowerCase();
  const discordId = Object.keys(dbData.user_links).find(
    id => dbData.user_links[id].toLowerCase() === targetLower
  );
  if (discordId) {
    return { discord_id: discordId, ign: dbData.user_links[discordId] };
  }
  return null;
}

function getAllLinks() {
  return Object.keys(dbData.user_links).map(id => ({
    discord_id: id,
    ign: dbData.user_links[id]
  }));
}

// Balance Cache Operations
function getCachedBalance(ign) {
  const record = dbData.balances[ign.toLowerCase()];
  return record ? { ...record } : null;
}

function updateCachedBalance(ign, balance, total, fine) {
  dbData.balances[ign.toLowerCase()] = {
    ign,
    balance: parseFloat(balance),
    total: parseFloat(total),
    fine: parseFloat(fine),
    last_updated: new Date().toISOString()
  };
  saveDb();
  return { changes: 1 };
}

function getAllCachedBalances() {
  const cacheMap = new Map();
  for (const key of Object.keys(dbData.balances)) {
    cacheMap.set(key, { ...dbData.balances[key] });
  }
  return cacheMap;
}

module.exports = {
  initDb,
  linkUser,
  unlinkUser,
  getLinkByDiscordId,
  getLinkByIgn,
  getAllLinks,
  getCachedBalance,
  updateCachedBalance,
  getAllCachedBalances,
};
