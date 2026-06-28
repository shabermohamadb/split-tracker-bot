const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');
const { fetchSheetData } = require('../sheets');
const { isAdmin } = require('./sync');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('viewsplits')
    .setDescription('View player balances from the spreadsheet (Admin only)')
    .addStringOption(option =>
      option.setName('sheet')
        .setDescription('Which spreadsheet splits to view')
        .setRequired(false)
        .addChoices(
          { name: 'JosephSteel\'s splits (Default)', value: 'josephsteel' },
          { name: 'King\'s splits', value: 'king' }
        )
    )
    .addStringOption(option =>
      option.setName('filter')
        .setDescription('Filter players by balance type')
        .setRequired(false)
        .addChoices(
          { name: 'Non-Zero Balances (Default)', value: 'nonzero' },
          { name: 'Owes Silver (Negative)', value: 'negative' },
          { name: 'Withdrawable (Positive)', value: 'positive' },
          { name: 'All Players', value: 'all' }
        )
    ),
  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return await interaction.reply({
        content: '❌ Only administrators or users with the designated Admin role can use this command.',
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    const sheetOption = interaction.options.getString('sheet') || 'josephsteel';
    const filter = interaction.options.getString('filter') || 'nonzero';

    let sheetId = config.spreadsheetId;
    let ownerName = config.owner1;

    if (sheetOption === 'king') {
      if (!config.spreadsheetId2) {
        return await interaction.editReply({
          content: '❌ King\'s spreadsheet is not configured in the bot\'s .env environment variables.',
        });
      }
      sheetId = config.spreadsheetId2;
      ownerName = config.owner2;
    }

    try {
      const players = await fetchSheetData(sheetId);
      
      // Filter players
      let filteredPlayers = players;
      let filterTitle = 'Non-Zero Balances';

      if (filter === 'nonzero') {
        filteredPlayers = players.filter(p => Math.abs(p.total) > 0.0001);
      } else if (filter === 'negative') {
        filteredPlayers = players.filter(p => p.total < -0.0001);
        filterTitle = 'Owes Silver (Negative)';
      } else if (filter === 'positive') {
        filteredPlayers = players.filter(p => p.total > 0.0001);
        filterTitle = 'Withdrawable (Positive)';
      } else {
        filterTitle = 'All Players';
      }

      // Sort by balance descending
      filteredPlayers.sort((a, b) => b.total - a.total);

      if (filteredPlayers.length === 0) {
        return await interaction.editReply({
          content: `ℹ️ No players found on **${ownerName}'s** sheet matching the filter: **${filterTitle}**`,
        });
      }

      // Build text-based table
      let tableContent = 'IGN             | Current   | Starting  | Fines\n';
      tableContent +=    '----------------|-----------|-----------|-----------\n';

      for (const p of filteredPlayers.slice(0, 20)) { // limit to top 20 to avoid Discord character limit
        const nameCol = p.name.substring(0, 15).padEnd(15);
        const balCol = `${p.total.toFixed(2)}M`.padEnd(9);
        const totCol = `${p.balance.toFixed(2)}M`.padEnd(9);
        const fineCol = `${p.fine.toFixed(2)}M`;
        tableContent += `${nameCol} | ${balCol} | ${totCol} | ${fineCol}\n`;
      }

      const totalCount = filteredPlayers.length;
      let footerText = `Showing ${Math.min(20, totalCount)} of ${totalCount} matching players.`;
      if (totalCount > 20) {
        footerText += ' (Top 20 displayed, check spreadsheet for full list)';
      }

      const embed = new EmbedBuilder()
        .setTitle(`📋 ${ownerName}'s Splits Summary - ${filterTitle}`)
        .setDescription(`\`\`\`\n${tableContent}\`\`\``)
        .setColor(sheetOption === 'king' ? '#ffc107' : '#00bcd4') // Gold for King, Cyan for Joseph
        .setFooter({ text: footerText })
        .setTimestamp();

      return await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Error in viewsplits command:', err);
      return await interaction.editReply({
        content: `❌ Failed to retrieve sheet data for ${ownerName}.`,
      });
    }
  },
};
