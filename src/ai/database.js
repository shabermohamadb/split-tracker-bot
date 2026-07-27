const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const dbDir = path.join(__dirname, '../../data');
const dbPath = path.join(dbDir, 'ai_db.json');

let dbData = {
  conversations: {},
  preferences: {},
  statistics: {}
};

let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
}

function saveDbJson() {
  try {
    const tempPath = `${dbPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(dbData, null, 2), 'utf8');
    fs.renameSync(tempPath, dbPath);
  } catch (err) {
    console.error(err.message);
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
      dbData.conversations = dbData.conversations || {};
      dbData.preferences = dbData.preferences || {};
      dbData.statistics = dbData.statistics || {};
    } catch (err) {
      dbData = { conversations: {}, preferences: {}, statistics: {} };
      saveDbJson();
    }
  } else {
    saveDbJson();
  }
}

async function initDb() {
  if (pool) {
    try {
      await pool.query('SELECT NOW()');

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ai_conversations (
          channel_id TEXT PRIMARY KEY,
          user_id TEXT,
          messages JSONB,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ai_preferences (
          user_id TEXT PRIMARY KEY,
          model TEXT,
          system_prompt TEXT,
          temperature REAL,
          max_tokens INTEGER
        );
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ai_statistics (
          user_id TEXT,
          day DATE DEFAULT CURRENT_DATE,
          token_count INTEGER DEFAULT 0,
          message_count INTEGER DEFAULT 0,
          PRIMARY KEY (user_id, day)
        );
      `);
    } catch (err) {
      pool = null;
      initJsonDb();
    }
  } else {
    initJsonDb();
  }
}

async function getConversation(channelId) {
  if (pool) {
    const res = await pool.query('SELECT messages FROM ai_conversations WHERE channel_id = $1', [channelId]);
    return res.rows[0]?.messages || [];
  } else {
    return dbData.conversations[channelId]?.messages || [];
  }
}

async function saveConversation(channelId, userId, messages) {
  if (pool) {
    await pool.query(`
      INSERT INTO ai_conversations (channel_id, user_id, messages, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (channel_id)
      DO UPDATE SET messages = EXCLUDED.messages, updated_at = CURRENT_TIMESTAMP
    `, [channelId, userId, JSON.stringify(messages)]);
  } else {
    dbData.conversations[channelId] = {
      user_id: userId,
      messages,
      updated_at: new Date().toISOString()
    };
    saveDbJson();
  }
}

async function clearConversation(channelId) {
  if (pool) {
    await pool.query('DELETE FROM ai_conversations WHERE channel_id = $1', [channelId]);
  } else {
    delete dbData.conversations[channelId];
    saveDbJson();
  }
}

async function getUserPreference(userId) {
  if (pool) {
    const res = await pool.query('SELECT model, system_prompt, temperature, max_tokens FROM ai_preferences WHERE user_id = $1', [userId]);
    return res.rows[0] || null;
  } else {
    return dbData.preferences[userId] || null;
  }
}

async function setUserPreference(userId, prefs) {
  if (pool) {
    const current = await getUserPreference(userId) || {};
    const model = prefs.model !== undefined ? prefs.model : current.model;
    const systemPrompt = prefs.system_prompt !== undefined ? prefs.system_prompt : current.system_prompt;
    const temp = prefs.temperature !== undefined ? prefs.temperature : current.temperature;
    const maxTokens = prefs.max_tokens !== undefined ? prefs.max_tokens : current.max_tokens;

    await pool.query(`
      INSERT INTO ai_preferences (user_id, model, system_prompt, temperature, max_tokens)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id)
      DO UPDATE SET model = EXCLUDED.model, system_prompt = EXCLUDED.system_prompt, temperature = EXCLUDED.temperature, max_tokens = EXCLUDED.max_tokens
    `, [userId, model, systemPrompt, temp, maxTokens]);
  } else {
    const current = dbData.preferences[userId] || {};
    dbData.preferences[userId] = {
      model: prefs.model !== undefined ? prefs.model : current.model,
      system_prompt: prefs.system_prompt !== undefined ? prefs.system_prompt : current.system_prompt,
      temperature: prefs.temperature !== undefined ? prefs.temperature : current.temperature,
      max_tokens: prefs.max_tokens !== undefined ? prefs.max_tokens : current.max_tokens
    };
    saveDbJson();
  }
}

async function logUsage(userId, tokens) {
  const todayStr = new Date().toISOString().split('T')[0];
  if (pool) {
    await pool.query(`
      INSERT INTO ai_statistics (user_id, day, token_count, message_count)
      VALUES ($1, CURRENT_DATE, $2, 1)
      ON CONFLICT (user_id, day)
      DO UPDATE SET token_count = ai_statistics.token_count + EXCLUDED.token_count, message_count = ai_statistics.message_count + 1
    `, [userId, tokens]);
  } else {
    const key = `${userId}_${todayStr}`;
    const current = dbData.statistics[key] || { token_count: 0, message_count: 0 };
    dbData.statistics[key] = {
      user_id: userId,
      day: todayStr,
      token_count: current.token_count + tokens,
      message_count: current.message_count + 1
    };
    saveDbJson();
  }
}

async function getUsage(userId) {
  const todayStr = new Date().toISOString().split('T')[0];
  if (pool) {
    const res = await pool.query('SELECT token_count, message_count FROM ai_statistics WHERE user_id = $1 AND day = CURRENT_DATE', [userId]);
    return res.rows[0] || { token_count: 0, message_count: 0 };
  } else {
    const key = `${userId}_${todayStr}`;
    return dbData.statistics[key] || { token_count: 0, message_count: 0 };
  }
}

module.exports = {
  initDb,
  getConversation,
  saveConversation,
  clearConversation,
  getUserPreference,
  setUserPreference,
  logUsage,
  getUsage
};
