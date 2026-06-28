const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { checkForUpdates } = require('../notifier');
const config = require('../config');

// Helper to check if user has admin privileges
function isAdmin(member) {
  if (!member) return false;
  // Check standard Administrator permission
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  // Check configured role
  if (config.adminRoleId && member.roles.cache.has(config.adminRoleId)) return true;
  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sync')
    .setDescription('Force check spreadsheet for balance updates (Admin only)'),
  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return await interaction.reply({
        content: '❌ Only administrators or users with the designated Admin role can use this command.',
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      console.log(`[Admin] Sync command triggered by ${interaction.user.tag}`);
      await checkForUpdates(interaction.client);
      
      const embed = new EmbedBuilder()
        .setTitle('🔄 Manual Synchronization Complete')
        .setDescription('Successfully polled the loot split spreadsheet and checked all player balances.')
        .setColor('#4caf50')
        .setTimestamp();

      return await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Error executing manual sync command:', err);
      return await interaction.editReply({
        content: '❌ An error occurred during synchronization. Check bot logs for details.',
      });
    }
  },
  isAdmin, // export helper
};
