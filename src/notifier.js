const { fetchSheetData } = require('./sheets');
const db = require('./database');
const config = require('./config');
const { EmbedBuilder } = require('discord.js');
const { detectIGN } = require('./utils');

let isPolling = false;

/**
 * Main function to poll the sheet and broadcast balance updates.
 */
async function checkForUpdates(client) {
  if (isPolling) return;
  isPolling = true;

  console.log(`[Notifier] Running spreadsheet update check at ${new Date().toISOString()}...`);

  try {
    const players = await fetchSheetData();
    const cachedBalances = await db.getAllCachedBalances();

    // Get notification channel if configured
    let notificationChannel = null;
    if (config.notificationChannelId) {
      try {
        notificationChannel = await client.channels.fetch(config.notificationChannelId);
      } catch (err) {
        console.error(`[Notifier] Could not fetch notification channel (${config.notificationChannelId}):`, err.message);
      }
    }

    for (const player of players) {
      const key = player.name.toLowerCase();
      const cached = cachedBalances.get(key);

      if (cached) {
        // Check if balance, total, or fine changed
        const balanceChanged = cached.balance !== player.balance;
        const totalChanged = cached.total !== player.total;
        const fineChanged = cached.fine !== player.fine;

        if (balanceChanged || totalChanged || fineChanged) {
          const diff = player.total - cached.total;
          const diffStr = diff >= 0 ? `+${diff.toFixed(3)}M` : `${diff.toFixed(3)}M`;

          console.log(`[Notifier] Detected change for player "${player.name}": Balance ${cached.total}M -> ${player.total}M (${diffStr})`);

          // Check if user is linked to a Discord ID
          let link = await db.getLinkByIgn(player.name);

          // Proactively auto-detect and link player by their Discord nickname if not linked
          if (!link) {
            const guilds = client.guilds.cache.values();
            for (const guild of guilds) {
              try {
                const members = await guild.members.fetch();
                const matchedMember = members.find(member => {
                  const displayName = member.displayName || member.user.username;
                  return detectIGN(displayName, [player]) !== null;
                });

                if (matchedMember) {
                  console.log(`[Notifier] Auto-detected and linked player "${player.name}" to Discord user ${matchedMember.user.tag} (${matchedMember.id})`);
                  await db.linkUser(matchedMember.id, player.name);
                  link = { discord_id: matchedMember.id, ign: player.name };
                  break;
                }
              } catch (err) {
                console.error(`[Notifier] Failed to fetch members for auto-linking in guild ${guild.id}:`, err.message);
              }
            }
          }

          // Update Cache
          await db.updateCachedBalance(player.name, player.balance, player.total, player.fine);

          // 1. Send DM to the linked user if they exist
          if (link) {
            try {
              const user = await client.users.fetch(link.discord_id);
              
              const dmEmbed = new EmbedBuilder()
                .setTitle('💰 Loot Split Balance Updated')
                .setDescription(`Your loot split balance for Albion IGN **${player.name}** has been updated in the spreadsheet.`)
                .setColor('#d4af37') // Gold color
                .addFields(
                  { name: 'Current Balance (Withdrawable)', value: `\`${player.total.toFixed(3)}M\` Silver`, inline: false },
                  { name: 'Previous Balance', value: `\`${cached.total.toFixed(3)}M\` Silver`, inline: true },
                  { name: 'Difference', value: `\`${diffStr}\` Silver`, inline: true },
                  { name: 'Starting Balance (Till 14/06)', value: `\`${player.balance.toFixed(3)}M\` Silver`, inline: true },
                  { name: 'Fines / Withdraws', value: `\`${player.fine.toFixed(3)}M\` Silver`, inline: true }
                );

              if (player.sessions && player.sessions.length > 0) {
                const sessionList = player.sessions.map(s => {
                  const commentDetails = s.comments.length > 0 ? `\n   *Split details: ${s.comments.join(' | ')}*` : '';
                  return `• **${s.sessionName}**: \`+${s.amount.toFixed(3)}M\` Silver${commentDetails}`;
                }).join('\n');
                dmEmbed.addFields({ name: '📊 Recent Session Splits & Details', value: sessionList, inline: false });
              }

              dmEmbed.setTimestamp().setFooter({ text: 'Split Tracker • Use /mysplit to check anytime' });

              await user.send({ embeds: [dmEmbed] });
              console.log(`[Notifier] Successfully sent balance update DM to ${user.tag} (${link.discord_id})`);
            } catch (err) {
              console.error(`[Notifier] Failed to send DM to linked user ${link.discord_id}:`, err.message);
            }
          }

          // 2. Post announcement in the configured channel
          if (notificationChannel) {
            try {
              const channelEmbed = new EmbedBuilder()
                .setTitle('📢 Balance Update')
                .setColor(diff >= 0 ? '#4caf50' : '#f44336') // Green for gain, Red for withdrawal/fine
                .setTimestamp();

              if (link) {
                channelEmbed.setDescription(
                  `💰 **Balance Update** for <@${link.discord_id}> (**${player.name}**)\n` +
                  `• **Previous**: \`${cached.total.toFixed(3)}M\`\n` +
                  `• **New**: \`${player.total.toFixed(3)}M\`\n` +
                  `• **Change**: \`${diffStr}\``
                );
              } else {
                // If not linked, alert the channel and prompt them to link
                channelEmbed.setDescription(
                  `💰 **Balance Update** for **${player.name}**\n` +
                  `• **Previous**: \`${cached.total.toFixed(3)}M\`\n` +
                  `• **New**: \`${player.total.toFixed(3)}M\`\n` +
                  `• **Change**: \`${diffStr}\`\n\n` +
                  `⚠️ *This player has not linked their Discord account. Use \`/linkign ${player.name}\` to link and receive direct balance notifications.*`
                );
              }

              if (player.sessions && player.sessions.length > 0) {
                const sessionList = player.sessions.map(s => {
                  const commentDetails = s.comments.length > 0 ? ` *(${s.comments.join(' | ')})*` : '';
                  return `• **${s.sessionName}**: \`+${s.amount.toFixed(3)}M\`${commentDetails}`;
                }).join('\n');
                channelEmbed.addFields({ name: 'Session Breakdown', value: sessionList, inline: false });
              }

              await notificationChannel.send({ embeds: [channelEmbed] });
            } catch (err) {
              console.error(`[Notifier] Failed to post update to notification channel:`, err.message);
            }
          }
        }
      } else {
        // First time seeing this player, just cache their info quietly (no notification to avoid spamming the server on bot load)
        await db.updateCachedBalance(player.name, player.balance, player.total, player.fine);
        console.log(`[Notifier] Cached new player "${player.name}" with balance ${player.balance}M`);
      }
    }

    console.log('[Notifier] Spreadsheet update check completed.');
  } catch (err) {
    console.error('[Notifier] Error checking for spreadsheet updates:', err);
  } finally {
    isPolling = false;
  }
}

/**
 * Initializes and starts the background poll interval.
 */
function startNotifier(client) {
  if (config.pollIntervalMs <= 0) {
    console.log('[Notifier] Polling interval is disabled.');
    return;
  }

  console.log(`[Notifier] Starting background polling. Interval: ${config.pollIntervalMs / 1000 / 60} minutes.`);
  
  // Initial check on startup
  setTimeout(() => {
    checkForUpdates(client);
  }, 5000); // 5 seconds after startup

  // Setup interval
  setInterval(() => {
    checkForUpdates(client);
  }, config.pollIntervalMs);
}

module.exports = {
  checkForUpdates,
  startNotifier,
};
