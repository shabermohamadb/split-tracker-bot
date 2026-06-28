const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database');
const { fetchSheetData } = require('../sheets');
const { detectIGN } = require('../utils');
const config = require('../config');

// Helper to construct the split embed
function createSplitEmbed(ign, player1, player2) {
  const embed = new EmbedBuilder()
    .setTitle(`💰 Loot Split Balance`)
    .setDescription(`Loot split details for Albion IGN: **${ign}**`)
    .setColor('#00bcd4') // Default Cyan theme
    .setTimestamp()
    .setFooter({ text: 'Split Tracker • Updates automatically' });

  if (player1 || player2) {
    const total1 = player1 ? player1.total : 0;
    const total2 = player2 ? player2.total : 0;
    const combinedTotal = total1 + total2;

    embed.addFields({
      name: 'Combined Withdrawable Balance',
      value: `\`${combinedTotal.toFixed(3)}M\` Silver`,
      inline: false
    });

    // 1. JosephSteel Splits Field
    if (player1) {
      let details = `• **Current Balance**: \`${player1.total.toFixed(3)}M\` Silver\n` +
                    `• Starting Balance: \`${player1.balance.toFixed(3)}M\`\n` +
                    `• Fines / Withdraws: \`${player1.fine.toFixed(3)}M\``;
      
      if (player1.sessions && player1.sessions.length > 0) {
        const list = player1.sessions.slice(0, 3).map(s => {
          const comment = s.comments.length > 0 ? ` (*${s.comments.join(' | ')}*)` : '';
          return `  - *${s.sessionName}*: \`+${s.amount.toFixed(3)}M\`${comment}`;
        }).join('\n');
        details += `\n**Recent Splits:**\n${list}`;
      }
      embed.addFields({ name: `⚔️ ${config.owner1}'s Splits`, value: details, inline: false });
    } else {
      embed.addFields({ name: `⚔️ ${config.owner1}'s Splits`, value: '*Not listed on this sheet.*', inline: false });
    }

    // 2. King Splits Field
    if (player2) {
      let details = `• **Current Balance**: \`${player2.total.toFixed(3)}M\` Silver\n` +
                    `• Starting Balance: \`${player2.balance.toFixed(3)}M\`\n` +
                    `• Fines / Withdraws: \`${player2.fine.toFixed(3)}M\``;
      
      if (player2.sessions && player2.sessions.length > 0) {
        const list = player2.sessions.slice(0, 3).map(s => {
          const comment = s.comments.length > 0 ? ` (*${s.comments.join(' | ')}*)` : '';
          return `  - *${s.sessionName}*: \`+${s.amount.toFixed(3)}M\`${comment}`;
        }).join('\n');
        details += `\n**Recent Splits:**\n${list}`;
      }
      embed.addFields({ name: `👑 ${config.owner2}'s Splits`, value: details, inline: false });
    } else if (config.spreadsheetId2) {
      embed.addFields({ name: `👑 ${config.owner2}'s Splits`, value: '*Not listed on this sheet.*', inline: false });
    }

    // Visual Color indicator
    if (combinedTotal > 0.0001) {
      embed.setDescription(`Loot split details for Albion IGN: **${ign}**\n🟢 You have withdrawable silver! Request payouts from sheet admins.`);
      embed.setColor('#4caf50'); // Green
    } else if (combinedTotal < -0.0001) {
      embed.setDescription(`Loot split details for Albion IGN: **${ign}**\n🔴 You owe silver (outstanding fine/debt). Please pay sheet admins.`);
      embed.setColor('#f44336'); // Red
    } else {
      embed.setDescription(`Loot split details for Albion IGN: **${ign}**\n⚪ Your balances are settled.`);
    }
  } else {
    embed.setTitle('⚠️ IGN Not Found in Sheets')
      .setDescription(
        `Your Discord account is linked to **${ign}**, but this name was not found in either the **${config.owner1}** or **${config.owner2}** spreadsheets.\n\n` +
        `• Please check your spelling.\n` +
        `• If you are new, wait for admins to add your IGN to one of the sheets.\n` +
        `• You can run \`/linkign <correct_ign>\` to relink.`
      )
      .setColor('#ff9800');
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mysplit')
    .setDescription('View your current loot split balance'),
  
  createSplitEmbed, // Export for refresh interactions and notifier

  async execute(interaction) {
    await interaction.deferReply();

    const discordId = interaction.user.id;
    let link = await db.getLinkByDiscordId(discordId);
    let autoSyncMessage = null;

    try {
      // Fetch both spreadsheets
      const players1 = await fetchSheetData(config.spreadsheetId);
      let players2 = [];
      if (config.spreadsheetId2) {
        try {
          players2 = await fetchSheetData(config.spreadsheetId2);
        } catch (err) {
          console.error('[mysplit] Failed to fetch sheet 2:', err.message);
        }
      }

      // Auto-detect IGN from Discord nickname across both sheets if not linked
      if (!link) {
        const displayName = interaction.member?.displayName || interaction.user.username;
        const allPlayers = [...players1, ...players2];
        const detectedIgn = detectIGN(displayName, allPlayers);

        if (detectedIgn) {
          await db.linkUser(discordId, detectedIgn);
          link = { discord_id: discordId, ign: detectedIgn };
          autoSyncMessage = `ℹ️ **Auto-Sync**: We detected your Albion IGN as **${detectedIgn}** from your Discord nickname and linked your account automatically!`;
        } else {
          return await interaction.editReply({
            content: '❌ You have not linked your Albion Online IGN yet.\nUse `/linkign <your_ign>` to link your account.',
          });
        }
      }

      // Find player splits on both sheets
      const matchedPlayer1 = players1.find(p => p.name.toLowerCase() === link.ign.toLowerCase());
      const matchedPlayer2 = players2.find(p => p.name.toLowerCase() === link.ign.toLowerCase());

      // Update local db cache
      if (matchedPlayer1) {
        await db.updateCachedBalance(matchedPlayer1.name, config.owner1, matchedPlayer1.balance, matchedPlayer1.total, matchedPlayer1.fine);
      }
      if (matchedPlayer2) {
        await db.updateCachedBalance(matchedPlayer2.name, config.owner2, matchedPlayer2.balance, matchedPlayer2.total, matchedPlayer2.fine);
      }

      const embed = createSplitEmbed(link.ign, matchedPlayer1, matchedPlayer2);

      // Create interactive Refresh button
      const refreshBtn = new ButtonBuilder()
        .setCustomId(`refresh_split_${discordId}`)
        .setLabel('Refresh Balance')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔄');

      const row = new ActionRowBuilder().addComponents(refreshBtn);

      const payload = { embeds: [embed], components: [row] };
      if (autoSyncMessage) {
        payload.content = autoSyncMessage;
      }

      await interaction.editReply(payload);
    } catch (err) {
      console.error('Error in mysplit command:', err);
      return await interaction.editReply({
        content: '❌ Failed to fetch your split balance. The spreadsheets might be temporarily unavailable.',
      });
    }
  },
};
