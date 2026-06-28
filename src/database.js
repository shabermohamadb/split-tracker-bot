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
      
      // Create user_links table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_links (
          discord_id TEXT PRIMARY KEY,
          ign TEXT UNIQUE,
          linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Migration: Add sheet_owner and composite primary key if they don't exist
      try {
        // Add sheet_owner column
        await pool.query(`
          ALTER TABLE balances ADD COLUMN IF NOT EXISTS sheet_owner TEXT DEFAULT 'JosephSteel';
        `);

        // Query the database to find the actual primary key constraint name on the balances table
        const pkeyRes = await pool.query(`
          SELECT conname 
          FROM pg_constraint 
          WHERE conrelid = 'balances'::regclass AND contype = 'p';
        `);

        if (pkeyRes.rows.length > 0) {
          const conName = pkeyRes.rows[0].conname;
          
          // Verify if the current primary key column set contains sheet_owner
          const checkKeyRes = await pool.query(`
            SELECT a.attname
            FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = 'balances'::regclass AND i.indisprimary = true;
          `);
          
          const keyCols = checkKeyRes.rows.map(r => r.attname);
          if (!keyCols.includes('sheet_owner')) {
            console.log(`[Database] Migrating primary key constraint "${conName}" to composite key (ign, sheet_owner)...`);
            await pool.query(`
              ALTER TABLE balances DROP CONSTRAINT ${conName};
              ALTER TABLE balances ADD PRIMARY KEY (ign, sheet_owner);
            `);
          }
        } else {
          // Add primary key if none exists
          await pool.query(`
            ALTER TABLE balances ADD PRIMARY KEY (ign, sheet_owner);
          `);
        }
      } catch (migrationErr) {
        // Table might not exist yet; will be created in the next step
      }

      // Create balances table if not exists
      await pool.query(`
        CREATE TABLE IF NOT EXISTS balances (
          ign TEXT,
          sheet_owner TEXT DEFAULT 'JosephSteel',
          balance DOUBLE PRECISION,
          total DOUBLE PRECISION,
          fine DOUBLE PRECISION,
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (ign, sheet_owner)
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

      // Migrate old schema (balances keyed purely by ign)
      let migrated = false;
      for (const key of Object.keys(dbData.balances)) {
        if (!key.includes('_')) {
          const oldRecord = dbData.balances[key];
          const newKey = `${key}_josephsteel`;
          dbData.balances[newKey] = {
            ign: oldRecord.ign,
            sheet_owner: 'JosephSteel',
            balance: oldRecord.balance,
            total: oldRecord.total,
            fine: oldRecord.fine,
            last_updated: oldRecord.last_updated || new Date().toISOString()
          };
          delete dbData.balances[key];
          migrated = true;
        }
      }
      if (migrated) {
        saveDbJson();
        console.log('[Database] Migrated local JSON cache to multi-sheet schema.');
      }
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

// Balance Cache Operations (Scoped by sheet_owner)
async function getCachedBalance(ign, sheetOwner = 'JosephSteel') {
  const owner = sheetOwner || 'JosephSteel';
  if (pool) {
    const res = await pool.query(
      'SELECT ign, sheet_owner, balance, total, fine, last_updated FROM balances WHERE LOWER(ign) = LOWER($1) AND LOWER(sheet_owner) = LOWER($2)', 
      [ign, owner]
    );
    return res.rows[0] || null;
  } else {
    const key = `${ign.toLowerCase()}_${owner.toLowerCase()}`;
    const record = dbData.balances[key];
    return record ? { ...record } : null;
  }
}

async function updateCachedBalance(ign, sheetOwner, balance, total, fine) {
  const owner = sheetOwner || 'JosephSteel';
  const balNum = parseFloat(balance);
  const totNum = parseFloat(total);
  const fineNum = parseFloat(fine);

  if (pool) {
    const query = `
      INSERT INTO balances (ign, sheet_owner, balance, total, fine, last_updated)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      ON CONFLICT (ign, sheet_owner) 
      DO UPDATE SET 
        balance = EXCLUDED.balance,
        total = EXCLUDED.total,
        fine = EXCLUDED.fine,
        last_updated = CURRENT_TIMESTAMP
    `;
    await pool.query(query, [ign, owner, balNum, totNum, fineNum]);
  } else {
    const key = `${ign.toLowerCase()}_${owner.toLowerCase()}`;
    dbData.balances[key] = {
      ign,
      sheet_owner: owner,
      balance: balNum,
      total: totNum,
      fine: fineNum,
      last_updated: new Date().toISOString()
    };
    saveDbJson();
  }
  return { changes: 1 };
}

async function getAllCachedBalances(sheetOwner) {
  const cacheMap = new Map();
  const ownerFilter = sheetOwner ? sheetOwner.toLowerCase() : null;

  if (pool) {
    let query = 'SELECT ign, sheet_owner, balance, total, fine FROM balances';
    let params = [];
    if (ownerFilter) {
      query += ' WHERE LOWER(sheet_owner) = $1';
      params.push(ownerFilter);
    }
    const res = await pool.query(query, params);
    for (const row of res.rows) {
      const mapKey = `${row.ign.toLowerCase()}_${row.sheet_owner.toLowerCase()}`;
      cacheMap.set(mapKey, row);
    }
  } else {
    for (const key of Object.keys(dbData.balances)) {
      const record = dbData.balances[key];
      if (!ownerFilter || record.sheet_owner.toLowerCase() === ownerFilter) {
        cacheMap.set(key, { ...record });
      }
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
