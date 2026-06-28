const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const dbDir = path.join(__dirname, '../data');
const dbPath = path.join(dbDir, 'db.json');

// Memory cache of database state (used in JSON fallback mode)
let dbData = {
  user_links: {},
  balances: {}
};

// PostgreSQL connection pool
let pool = null;

if (process.env.DATABASE_URL) {
  console.log('[Database] Connecting to PostgreSQL database...');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Required for hosted databases like Render PostgreSQL
    }
  });
}

/**
 * Saves memory state to db.json file atomically (JSON mode only).
 */
function saveDbJson() {
  try {
    const tempPath = `${dbPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(dbData, null, 2), 'utf8');
    fs.renameSync(tempPath, dbPath);
  } catch (err) {
    console.error('[Database] Failed to write JSON database file:', err.message);
  }
}

/**
 * Initializes database tables or directory structure.
 */
async function initDb() {
  if (pool) {
    try {
      // Connect to pool to check connection
      await pool.query('SELECT NOW()');
      
      // Create PostgreSQL tables
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_links (
          discord_id TEXT PRIMARY KEY,
          ign TEXT UNIQUE,
          linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS balances (
          ign TEXT PRIMARY KEY,
          balance DOUBLE PRECISION,
          total DOUBLE PRECISION,
          fine DOUBLE PRECISION,
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('[Database] PostgreSQL tables initialized successfully.');
    } catch (err) {
      console.error('[Database] PostgreSQL connection failed. Falling back to local JSON file db.', err.message);
      pool = null; // Disable Postgres and fallback to JSON
      initJsonDb();
    }
  } else {
    initJsonDb();
  }
}

function initJsonDb() {
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
      console.error('[Database] File corrupt. Resetting to empty database:', err.message);
      dbData = { user_links: {}, balances: {} };
      saveDbJson();
    }
  } else {
    saveDbJson();
  }
  console.log('[Database] Local JSON-file database initialized successfully.');
}

// --- Database Operations ---

// User Links Operations
async function linkUser(discordId, ign) {
  if (pool) {
    const query = `
      INSERT INTO user_links (discord_id, ign, linked_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (discord_id) 
      DO UPDATE SET ign = EXCLUDED.ign, linked_at = CURRENT_TIMESTAMP
    `;
    await pool.query(query, [discordId, ign]);
  } else {
    dbData.user_links[discordId] = ign;
    saveDbJson();
  }
  return { changes: 1 };
}

async function unlinkUser(discordId) {
  if (pool) {
    const res = await pool.query('DELETE FROM user_links WHERE discord_id = $1', [discordId]);
    return { changes: res.rowCount };
  } else {
    if (dbData.user_links[discordId]) {
      delete dbData.user_links[discordId];
      saveDbJson();
      return { changes: 1 };
    }
    return { changes: 0 };
  }
}

async function getLinkByDiscordId(discordId) {
  if (pool) {
    const res = await pool.query('SELECT discord_id, ign, linked_at FROM user_links WHERE discord_id = $1', [discordId]);
    return res.rows[0] || null;
  } else {
    const ign = dbData.user_links[discordId];
    if (ign) {
      return { discord_id: discordId, ign };
    }
    return null;
  }
}

async function getLinkByIgn(ign) {
  const targetLower = ign.toLowerCase();
  if (pool) {
    const res = await pool.query('SELECT discord_id, ign, linked_at FROM user_links WHERE LOWER(ign) = LOWER($1)', [ign]);
    return res.rows[0] || null;
  } else {
    const discordId = Object.keys(dbData.user_links).find(
      id => dbData.user_links[id].toLowerCase() === targetLower
    );
    if (discordId) {
      return { discord_id: discordId, ign: dbData.user_links[discordId] };
    }
    return null;
  }
}

async function getAllLinks() {
  if (pool) {
    const res = await pool.query('SELECT discord_id, ign FROM user_links');
    return res.rows;
  } else {
    return Object.keys(dbData.user_links).map(id => ({
      discord_id: id,
      ign: dbData.user_links[id]
    }));
  }
}

// Balance Cache Operations
async function getCachedBalance(ign) {
  if (pool) {
    const res = await pool.query('SELECT ign, balance, total, fine, last_updated FROM balances WHERE LOWER(ign) = LOWER($1)', [ign]);
    return res.rows[0] || null;
  } else {
    const record = dbData.balances[ign.toLowerCase()];
    return record ? { ...record } : null;
  }
}

async function updateCachedBalance(ign, balance, total, fine) {
  const balNum = parseFloat(balance);
  const totNum = parseFloat(total);
  const fineNum = parseFloat(fine);

  if (pool) {
    const query = `
      INSERT INTO balances (ign, balance, total, fine, last_updated)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (ign) 
      DO UPDATE SET 
        balance = EXCLUDED.balance,
        total = EXCLUDED.total,
        fine = EXCLUDED.fine,
        last_updated = CURRENT_TIMESTAMP
    `;
    await pool.query(query, [ign, balNum, totNum, fineNum]);
  } else {
    dbData.balances[ign.toLowerCase()] = {
      ign,
      balance: balNum,
      total: totNum,
      fine: fineNum,
      last_updated: new Date().toISOString()
    };
    saveDbJson();
  }
  return { changes: 1 };
}

async function getAllCachedBalances() {
  const cacheMap = new Map();
  if (pool) {
    const res = await pool.query('SELECT ign, balance, total, fine FROM balances');
    for (const row of res.rows) {
      cacheMap.set(row.ign.toLowerCase(), row);
    }
  } else {
    for (const key of Object.keys(dbData.balances)) {
      cacheMap.set(key, { ...dbData.balances[key] });
    }
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
