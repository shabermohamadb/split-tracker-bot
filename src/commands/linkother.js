const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const { fetchSheetData } = require('../sheets');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('linkother')
    .setDescription('Link another user\'s Discord account to their Albion IGN (Admin Only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The Discord user to link')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('ign')
        .setDescription('Their exact Albion Online In-Game Name')
        .setRequired(true)
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const targetUser = interaction.options.getUser('user');
    const inputIgn = interaction.options.getString('ign').trim();

    try {
      // Validate IGN against both sheets
      const players1 = await fetchSheetData(config.spreadsheetId);
      let players2 = [];
      if (config.spreadsheetId2) {
        try {
          players2 = await fetchSheetData(config.spreadsheetId2);
        } catch (err) {
          console.error('[LinkOther] Failed to fetch sheet 2:', err.message);
        }
      }

      const matchedPlayer1 = players1.find(p => p.name.toLowerCase() === inputIgn.toLowerCase());
      const matchedPlayer2 = players2.find(p => p.name.toLowerCase() === inputIgn.toLowerCase());
      const matchedPlayer = matchedPlayer1 || matchedPlayer2;
      
      const embed = new EmbedBuilder().setTimestamp();

      if (matchedPlayer) {
        const targetIgn = matchedPlayer.name;
        
        // Save link to database for target user
        await db.linkUser(targetUser.id, targetIgn);

        embed.setTitle('✅ Account Linked by Admin')
          .setDescription(`Successfully linked <@${targetUser.id}> to the Albion IGN: **${targetIgn}**`)
          .setColor('#4caf50')
          .setFooter({ text: `Linked by Admin: ${interaction.user.tag}` });

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
      } else {
        // Reject link
        embed.setTitle('❌ Linking Failed')
          .setDescription(
            `The IGN **${inputIgn}** was not found in either the **${config.owner1}** or **${config.owner2}** loot split spreadsheets.\n\n` +
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
        content: `❌ Failed to link user. Ensure the spreadsheet links are configured correctly.`,
      });
    }
  },
};
