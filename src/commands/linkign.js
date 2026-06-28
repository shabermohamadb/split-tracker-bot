const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');
const { fetchSheetData } = require('../sheets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('linkign')
    .setDescription('Link your Discord account to your Albion Online IGN')
    .addStringOption(option =>
      option.setName('ign')
        .setDescription('Your exact Albion Online In-Game Name')
        .setRequired(true)
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    const inputIgn = interaction.options.getString('ign').trim();
    
    try {
      // Fetch current players list to validate the IGN
      const players = await fetchSheetData();
      const matchedPlayer = players.find(p => p.name.toLowerCase() === inputIgn.toLowerCase());
      
      const targetIgn = matchedPlayer ? matchedPlayer.name : inputIgn;
      
      // Save link to database
      await db.linkUser(interaction.user.id, targetIgn);
      
      const embed = new EmbedBuilder().setTimestamp();

      if (matchedPlayer) {
        embed.setTitle('✅ Account Linked Successfully')
          .setDescription(`Your Discord account is now linked to the Albion IGN: **${targetIgn}**`)
          .setColor('#4caf50')
          .addFields(
            { name: 'Current Balance', value: `\`${matchedPlayer.balance.toFixed(3)}M\` Silver`, inline: true },
            { name: 'Total Payouts', value: `\`${matchedPlayer.total.toFixed(3)}M\` Silver`, inline: true },
            { name: 'Fines / Withdraws', value: `\`${matchedPlayer.fine.toFixed(3)}M\` Silver`, inline: true }
          )
          .setFooter({ text: 'Split Tracker • Use /mysplit to check your balance' });

        return await interaction.editReply({ embeds: [embed] });
      } else {
        // Linked but with warning (not found in sheet)
        embed.setTitle('⚠️ Linked with Warning')
          .setDescription(
            `Your Discord account was linked to **${targetIgn}**.\n\n` +
            `❌ **Warning**: This IGN was not found in the current loot split spreadsheet.\n\n` +
            `• Please check if you spelt your IGN correctly.\n` +
            `• If you are a new member, please wait for an administrator to add you to the sheet.\n` +
            `• You can re-run \`/linkign\` anytime to correct a spelling error.`
          )
          .setColor('#ff9800') // Orange warning
          .setFooter({ text: 'Split Tracker • Unverified IGN' });

        return await interaction.editReply({ embeds: [embed] });
      }
    } catch (err) {
      console.error('Error in linkign command:', err);
      return await interaction.editReply({
        content: '❌ An error occurred while linking your account. Please try again later.',
      });
    }
  },
};
