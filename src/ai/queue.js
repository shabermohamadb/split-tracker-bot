const db = require('./database');
const config = require('./config');

const cooldowns = new Map();
const activeQueues = new Map();

function getRemainingCooldown(userId) {
  const lastUsed = cooldowns.get(userId);
  if (!lastUsed) return 0;

  const diffSec = (Date.now() - lastUsed) / 1000;
  if (diffSec < config.cooldownSec) {
    return Math.ceil(config.cooldownSec - diffSec);
  }
  return 0;
}

function triggerCooldown(userId) {
  cooldowns.set(userId, Date.now());
}

async function checkDailyLimits(userId) {
  try {
    const usage = await db.getUsage(userId);
    if (usage.token_count >= config.dailyTokenLimit) {
      return { limited: true, limit: config.dailyTokenLimit, current: usage.token_count };
    }
    return { limited: false };
  } catch (err) {
    console.error(err.message);
    return { limited: false };
  }
}

function enqueue(userId, taskFn) {
  let chain = activeQueues.get(userId) || Promise.resolve();

  const currentTask = chain.then(async () => {
    return await taskFn();
  });

  activeQueues.set(
    userId,
    currentTask
      .catch(() => {})
      .then(() => {
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
