const fs = require('fs');
const path = require('path');

const statePath = path.join(__dirname, '../../data/reminder_state.json');

function getState() {
  if (fs.existsSync(statePath)) {
    try {
      return JSON.parse(fs.readFileSync(statePath, 'utf8'));
    } catch (err) {
      return {};
    }
  }
  return {};
}

function saveState(state) {
  try {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
  }
}

async function sendDM(client, userId, text) {
  try {
    const user = await client.users.fetch(userId);
    if (user) {
      await user.send(text);
    }
  } catch (err) {
    console.error(err.message);
  }
}

async function sendChannelPing(client, userId, text) {
  try {
    const channel = await client.channels.fetch('1530212496059666594');
    if (channel) {
      await channel.send(`<@${userId}> ${text}`);
    }
  } catch (err) {
    console.error(err.message);
  }
}

function startDailyReminder(client, userId) {
  setInterval(async () => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const state = getState();
    let changed = false;

    if (now.getHours() >= 17 && state[userId + '_dm'] !== todayStr) {
      state[userId + '_dm'] = todayStr;
      changed = true;
      const text = "Hey bro! 📓 Time to prepare for your journal writing session tonight.";
      await sendDM(client, userId, text);
      await sendChannelPing(client, userId, text);
    }

    if (now.getHours() >= 20 && state[userId + '_channel'] !== todayStr) {
      state[userId + '_channel'] = todayStr;
      changed = true;
      const text = "Hey bro! 📓 Time for your daily journal writing session. Don't forget to get those thoughts down!";
      await sendDM(client, userId, text);
      await sendChannelPing(client, userId, text);
    }

    if (changed) {
      saveState(state);
    }
  }, 60000);
}

module.exports = {
  startDailyReminder
};
