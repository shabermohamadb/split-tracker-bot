const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');
const { fetchSheetData } = require('../sheets');
const config = require('../config');

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
      // Fetch both spreadsheets to validate
      const players1 = await fetchSheetData(config.spreadsheetId);
      let players2 = [];
      if (config.spreadsheetId2) {
        try {
          players2 = await fetchSheetData(config.spreadsheetId2);
        } catch (err) {
          console.error('[LinkIGN] Failed to fetch sheet 2:', err.message);
        }
      }

      const matchedPlayer1 = players1.find(p => p.name.toLowerCase() === inputIgn.toLowerCase());
      const matchedPlayer2 = players2.find(p => p.name.toLowerCase() === inputIgn.toLowerCase());
      const matchedPlayer = matchedPlayer1 || matchedPlayer2;
      
      const embed = new EmbedBuilder().setTimestamp();

      if (matchedPlayer) {
        const targetIgn = matchedPlayer.name;
        
        // Save link to database
        await db.linkUser(interaction.user.id, targetIgn);

        embed.setTitle('✅ Account Linked Successfully')
          .setDescription(`Your Discord account is now linked to the Albion IGN: **${targetIgn}**`)
          .setColor('#4caf50')
          .setFooter({ text: 'Split Tracker • Use /mysplit to check your balance' });

        // Add fields for Sheet 1
        if (matchedPlayer1) {
          embed.addFields({
            name: `⚔️ ${config.owner1}'s Splits`,
            value: `• Current: \`${matchedPlayer1.total.toFixed(3)}M\` Silver\n• Starting: \`${matchedPlayer1.balance.toFixed(3)}M\`\n• Fines: \`${matchedPlayer1.fine.toFixed(3)}M\``,
            inline: true
          });
        } else {
          embed.addFields({
            name: `⚔️ ${config.owner1}'s Splits`,
            value: '*Not listed on this sheet*',
            inline: true
          });
        }

        // Add fields for Sheet 2
        if (matchedPlayer2) {
          embed.addFields({
            name: `👑 ${config.owner2}'s Splits`,
            value: `• Current: \`${matchedPlayer2.total.toFixed(3)}M\` Silver\n• Starting: \`${matchedPlayer2.balance.toFixed(3)}M\`\n• Fines: \`${matchedPlayer2.fine.toFixed(3)}M\``,
            inline: true
          });
        } else if (config.spreadsheetId2) {
          embed.addFields({
            name: `👑 ${config.owner2}'s Splits`,
            value: '*Not listed on this sheet*',
            inline: true
          });
        }

        return await interaction.editReply({ embeds: [embed] });
      } else {
        // Reject linking
        embed.setTitle('❌ Linking Failed')
          .setDescription(
            `The IGN **${inputIgn}** was not found in either the **${config.owner1}** or **${config.owner2}** loot split spreadsheets.\n\n` +
            `• Please check your spelling and casing.\n` +
            `• If you are a new member, please ask an administrator to add your IGN to one of the sheets first.\n` +
            `• Your account **was not linked**.`
          )
          .setColor('#f44336')
          .setFooter({ text: 'Split Tracker • Invalid IGN' });

        return await interaction.editReply({ embeds: [embed] });
      }
    } catch (err) {
      console.error('Error in linkign command:', err);
      return await interaction.editReply({
        content: `❌ Failed to link your account. Ensure the spreadsheet links are configured correctly.`,
      });
    }
  },
};
