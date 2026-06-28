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
      
      const embed = new EmbedBuilder().setTimestamp();

      if (matchedPlayer) {
        const targetIgn = matchedPlayer.name;
        
        // Save link to database for target user
        await db.linkUser(targetUser.id, targetIgn);

        embed.setTitle('✅ Account Linked by Admin')
          .setDescription(`Successfully linked <@${targetUser.id}> to the Albion IGN: **${targetIgn}**`)
          .setColor('#4caf50')
          .addFields(
            { name: 'Current Balance', value: `\`${matchedPlayer.total.toFixed(3)}M\` Silver`, inline: false },
            { name: 'Starting Balance', value: `\`${matchedPlayer.balance.toFixed(3)}M\` Silver`, inline: true },
            { name: 'Fines / Withdraws', value: `\`${matchedPlayer.fine.toFixed(3)}M\` Silver`, inline: true }
          )
          .setFooter({ text: `Linked by Admin: ${interaction.user.tag}` });
      } else {
        // Reject link
        embed.setTitle('❌ Linking Failed')
          .setDescription(
            `The IGN **${inputIgn}** was not found in the current loot split spreadsheet.\n\n` +
            `• Check spelling and casing.\n` +
            `• The user <@${targetUser.id}> **was not linked**.`
          )
          .setColor('#f44336')
          .setFooter({ text: `Rejected by Admin: ${interaction.user.tag}` });
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
