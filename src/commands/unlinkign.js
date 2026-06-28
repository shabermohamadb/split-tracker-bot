const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlinkign')
    .setDescription('Unlink your Discord account from your Albion Online IGN'),
  async execute(interaction) {
    const discordId = interaction.user.id;
    const existingLink = db.getLinkByDiscordId(discordId);

    if (!existingLink) {
      return await interaction.reply({
        content: '❌ You do not have any linked Albion IGN. Use `/linkign <ign>` to link one.',
        ephemeral: true,
      });
    }

    try {
      db.unlinkUser(discordId);
      
      const embed = new EmbedBuilder()
        .setTitle('❌ Account Unlinked')
        .setDescription(`Successfully unlinked your Discord account from the IGN: **${existingLink.ign}**`)
        .setColor('#f44336')
        .setTimestamp()
        .setFooter({ text: 'Split Tracker' });

      return await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      console.error('Error in unlinkign command:', err);
      return await interaction.reply({
        content: '❌ An error occurred while unlinking your account.',
        ephemeral: true,
      });
    }
  },
};
