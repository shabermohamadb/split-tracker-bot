const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');
const { fetchSheetData } = require('../sheets');
const { isAdmin } = require('./sync');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('linkother')
    .setDescription("Link another user's Discord account to an Albion Online IGN (Admin only)")
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The Discord user to link')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('ign')
        .setDescription('The Albion Online In-Game Name to assign')
        .setRequired(true)
    ),
  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return await interaction.reply({
        content: '❌ Only administrators or users with the designated Admin role can use this command.',
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    const targetUser = interaction.options.getUser('user');
    const inputIgn = interaction.options.getString('ign').trim();

    try {
      // Validate IGN against sheet
      const players = await fetchSheetData();
      const matchedPlayer = players.find(p => p.name.toLowerCase() === inputIgn.toLowerCase());
      
      const targetIgn = matchedPlayer ? matchedPlayer.name : inputIgn;
      
      // Save link to database for target user
      db.linkUser(targetUser.id, targetIgn);
      
      const embed = new EmbedBuilder().setTimestamp();

      if (matchedPlayer) {
        embed.setTitle('✅ Account Linked by Admin')
          .setDescription(`Successfully linked <@${targetUser.id}> to the Albion IGN: **${targetIgn}**`)
          .setColor('#4caf50')
          .addFields(
            { name: 'Current Balance', value: `\`${matchedPlayer.balance.toFixed(3)}M\` Silver`, inline: true },
            { name: 'Total Payouts', value: `\`${matchedPlayer.total.toFixed(3)}M\` Silver`, inline: true },
            { name: 'Fines / Withdraws', value: `\`${matchedPlayer.fine.toFixed(3)}M\` Silver`, inline: true }
          )
          .setFooter({ text: `Linked by Admin: ${interaction.user.tag}` });
      } else {
        embed.setTitle('⚠️ Linked with Warning by Admin')
          .setDescription(
            `Linked <@${targetUser.id}> to **${targetIgn}**.\n\n` +
            `❌ **Warning**: This IGN was not found in the current spreadsheet.\n` +
            `Ensure the name matches the spreadsheet exact casing/spelling if possible.`
          )
          .setColor('#ff9800')
          .setFooter({ text: `Linked by Admin: ${interaction.user.tag}` });
      }

      return await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Error in linkother command:', err);
      return await interaction.editReply({
        content: `❌ Failed to link user. Ensure spreadsheet is accessible.`,
      });
    }
  },
};
