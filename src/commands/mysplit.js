const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database');
const { fetchSheetData } = require('../sheets');

// Helper to construct the split embed
function createSplitEmbed(ign, player) {
  const embed = new EmbedBuilder()
    .setTitle(`💰 Loot Split Balance`)
    .setDescription(`Current loot split details for Albion IGN: **${ign}**`)
    .setColor('#00bcd4') // Cyan theme
    .setTimestamp()
    .setFooter({ text: 'Split Tracker • Updates automatically' });

  if (player) {
    embed.addFields(
      { name: 'Current Balance (Withdrawable)', value: `\`${player.total.toFixed(3)}M\` Silver`, inline: false },
      { name: 'Starting Balance (Till 14/06)', value: `\`${player.balance.toFixed(3)}M\` Silver`, inline: true },
      { name: 'Fines / Withdraws', value: `\`${player.fine.toFixed(3)}M\` Silver`, inline: true }
    );

    // Add session history splits and comments
    if (player.sessions && player.sessions.length > 0) {
      const sessionList = player.sessions.map(s => {
        const commentDetails = s.comments.length > 0 ? `\n   *Split details: ${s.comments.join(' | ')}*` : '';
        return `• **${s.sessionName}**: \`+${s.amount.toFixed(3)}M\` Silver${commentDetails}`;
      }).join('\n');

      embed.addFields({ name: '📊 Recent Session Splits & Details', value: sessionList, inline: false });
    } else {
      embed.addFields({ name: '📊 Recent Session Splits & Details', value: '*No recent sessions recorded on this sheet.*', inline: false });
    }

    // Add visual status indicator
    if (player.total > 0.0001) {
      embed.setDescription(`Current loot split details for Albion IGN: **${ign}**\n🟢 You have withdrawable silver! Contact an administrator to request a payout.`);
    } else if (player.total < -0.0001) {
      embed.setDescription(`Current loot split details for Albion IGN: **${ign}**\n🔴 You owe silver (fines/debts). Please pay an administrator.`);
      embed.setColor('#f44336'); // Red for negative balance
    } else {
      embed.setDescription(`Current loot split details for Albion IGN: **${ign}**\n⚪ Your balance is fully settled.`);
    }
  } else {
    embed.setTitle('⚠️ IGN Not Found in Sheet')
      .setDescription(
        `Your Discord account is linked to **${ign}**, but this name was not found in the spreadsheet.\n\n` +
        `• Please check if you spelt your IGN correctly.\n` +
        `• If you are new, wait for an admin to add your IGN to the sheet.\n` +
        `• You can re-run \`/linkign <correct_ign>\` to link a different name.`
      )
      .setColor('#ff9800');
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mysplit')
    .setDescription('View your current loot split balance'),
  async execute(interaction) {
    await interaction.deferReply();

    const discordId = interaction.user.id;
    const link = await db.getLinkByDiscordId(discordId);

    if (!link) {
      return await interaction.editReply({
        content: '❌ You have not linked your Albion Online IGN yet.\nUse `/linkign <your_ign>` to link your account.',
      });
    }

    try {
      // Fetch latest sheet data
      const players = await fetchSheetData();
      const matchedPlayer = players.find(p => p.name.toLowerCase() === link.ign.toLowerCase());

      // If player found, update local cache
      if (matchedPlayer) {
        await db.updateCachedBalance(matchedPlayer.name, matchedPlayer.balance, matchedPlayer.total, matchedPlayer.fine);
      }

      const embed = createSplitEmbed(link.ign, matchedPlayer);

      // Create interactive Refresh button
      const refreshBtn = new ButtonBuilder()
        .setCustomId(`refresh_split_${discordId}`)
        .setLabel('Refresh Balance')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔄');

      const row = new ActionRowBuilder().addComponents(refreshBtn);

      await interaction.editReply({
        embeds: [embed],
        components: [row],
      });
    } catch (err) {
      console.error('Error in mysplit command:', err);
      return await interaction.editReply({
        content: '❌ Failed to fetch your split balance. The spreadsheet might be temporarily unavailable.',
      });
    }
  },
  
  // Expose embed builder and handler for button interactions
  createSplitEmbed,
};
