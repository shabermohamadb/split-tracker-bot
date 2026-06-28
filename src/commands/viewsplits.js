const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');
const { fetchSheetData } = require('../sheets');
const { isAdmin } = require('./sync');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('viewsplits')
    .setDescription('View player balances from the spreadsheet (Admin only)')
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

    const filter = interaction.options.getString('filter') || 'nonzero';

    try {
      const players = await fetchSheetData();
      
      // Filter players
      let filteredPlayers = players;
      let filterTitle = 'Non-Zero Balances';

      if (filter === 'nonzero') {
        filteredPlayers = players.filter(p => Math.abs(p.balance) > 0.0001);
      } else if (filter === 'negative') {
        filteredPlayers = players.filter(p => p.balance < -0.0001);
        filterTitle = 'Owes Silver (Negative)';
      } else if (filter === 'positive') {
        filteredPlayers = players.filter(p => p.balance > 0.0001);
        filterTitle = 'Withdrawable (Positive)';
      } else {
        filterTitle = 'All Players';
      }

      // Sort by balance descending
      filteredPlayers.sort((a, b) => b.balance - a.balance);

      if (filteredPlayers.length === 0) {
        return await interaction.editReply({
          content: `ℹ️ No players found matching the filter: **${filterTitle}**`,
        });
      }

      // Build text-based table
      let tableContent = 'IGN             | Balance   | Total     | Fines\n';
      tableContent +=    '----------------|-----------|-----------|-----------\n';

      for (const p of filteredPlayers.slice(0, 20)) { // limit to top 20 to avoid Discord character limit
        const nameCol = p.name.substring(0, 15).padEnd(15);
        const balCol = `${p.balance.toFixed(2)}M`.padEnd(9);
        const totCol = `${p.total.toFixed(2)}M`.padEnd(9);
        const fineCol = `${p.fine.toFixed(2)}M`;
        tableContent += `${nameCol} | ${balCol} | ${totCol} | ${fineCol}\n`;
      }

      const totalCount = filteredPlayers.length;
      let footerText = `Showing ${Math.min(20, totalCount)} of ${totalCount} matching players.`;
      if (totalCount > 20) {
        footerText += ' (Top 20 displayed, check spreadsheet for full list)';
      }

      const embed = new EmbedBuilder()
        .setTitle(`📋 Loot Split Sheet Summary - ${filterTitle}`)
        .setDescription(`\`\`\`\n${tableContent}\`\`\``)
        .setColor('#607d8b')
        .setFooter({ text: footerText })
        .setTimestamp();

      return await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Error in viewsplits command:', err);
      return await interaction.editReply({
        content: '❌ Failed to fetch spreadsheet summary.',
      });
    }
  },
};
