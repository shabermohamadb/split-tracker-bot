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
      
      const embed = new EmbedBuilder().setTimestamp();

      if (matchedPlayer) {
        const targetIgn = matchedPlayer.name;
        
        // Save link to database
        await db.linkUser(interaction.user.id, targetIgn);

        embed.setTitle('✅ Account Linked Successfully')
          .setDescription(`Your Discord account is now linked to the Albion IGN: **${targetIgn}**`)
          .setColor('#4caf50')
          .addFields(
            { name: 'Current Balance', value: `\`${matchedPlayer.total.toFixed(3)}M\` Silver`, inline: false },
            { name: 'Starting Balance', value: `\`${matchedPlayer.balance.toFixed(3)}M\` Silver`, inline: true },
            { name: 'Fines / Withdraws', value: `\`${matchedPlayer.fine.toFixed(3)}M\` Silver`, inline: true }
          )
          .setFooter({ text: 'Split Tracker • Use /mysplit to check your balance' });

        return await interaction.editReply({ embeds: [embed] });
      } else {
        // Reject linking
        embed.setTitle('❌ Linking Failed')
          .setDescription(
            `The IGN **${inputIgn}** was not found in the current loot split spreadsheet.\n\n` +
            `• Please check your spelling and casing.\n` +
            `• If you are a new member, please ask an administrator to add your IGN to the sheet first.\n` +
            `• Your account **was not linked**.`
          )
          .setColor('#f44336') // Red error color
          .setFooter({ text: 'Split Tracker • Invalid IGN' });

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
