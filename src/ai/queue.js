const db = require('./database');
const config = require('./config');

// In-memory maps
const cooldowns = new Map();
const activeQueues = new Map();

/**
 * Checks if a user is currently inside their cooldown window.
 * Returns remaining seconds if on cooldown, 0 otherwise.
 */
function getRemainingCooldown(userId) {
  const lastUsed = cooldowns.get(userId);
  if (!lastUsed) return 0;

  const diffSec = (Date.now() - lastUsed) / 1000;
  if (diffSec < config.cooldownSec) {
    return Math.ceil(config.cooldownSec - diffSec);
  }
  return 0;
}

/**
 * Sets a user's cooldown start timestamp.
 */
function triggerCooldown(userId) {
  cooldowns.set(userId, Date.now());
}

/**
 * Validates if the user has reached their daily limit.
 */
async function checkDailyLimits(userId) {
  try {
    const usage = await db.getUsage(userId);
    if (usage.token_count >= config.dailyTokenLimit) {
      return { limited: true, limit: config.dailyTokenLimit, current: usage.token_count };
    }
    return { limited: false };
  } catch (err) {
    console.error('[AI Queue] Error checking daily limits:', err.message);
    return { limited: false }; // Fail-safe
  }
}

/**
 * Enqueues a task (function returning a Promise) for a user,
 * executing them sequentially to prevent concurrency errors.
 */
function enqueue(userId, taskFn) {
  let chain = activeQueues.get(userId) || Promise.resolve();

  const currentTask = chain.then(async () => {
    return await taskFn();
  });

  // Maintain queue chain
  activeQueues.set(
    userId,
    currentTask
      .catch(() => {}) // Suppress queue propagation crashes
      .then(() => {
        // Clean up queue key if this was the last task in the chain
        if (activeQueues.get(userId) === currentTask) {
          activeQueues.delete(userId);
        }
      })
  );

  return currentTask;
}

module.exports = {
  getRemainingCooldown,
  triggerCooldown,
  checkDailyLimits,
  enqueue
};
