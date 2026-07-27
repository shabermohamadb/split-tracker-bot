const { SlashCommandBuilder } = require('discord.js');
const aiModule = require('../ai');

module.exports = {
  isAiCommand: true,
  data: new SlashCommandBuilder()
    .setName('gemini')
    .setDescription('Ask Google Gemini (fast and smart)')
    .addStringOption(option =>
      option.setName('prompt')
        .setDescription('Your question or prompt for Gemini')
        .setRequired(true)
    )
    .addAttachmentOption(option =>
      option.setName('file')
        .setDescription('Optional text or markdown file draft attachment (.txt, .md)')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('private')
        .setDescription('Whether the response should only be visible to you (ephemeral)')
        .setRequired(false)
    )
    .addNumberOption(option =>
      option.setName('temperature')
        .setDescription('Creativity level (0.0 = analytical, 1.0 = creative)')
        .setMinValue(0)
        .setMaxValue(2)
        .setRequired(false)
    ),

  async execute(interaction) {
    const prompt = interaction.options.getString('prompt');
    const file = interaction.options.getAttachment('file');
    const ephemeral = interaction.options.getBoolean('private') || false;
    const temp = interaction.options.getNumber('temperature');

    await aiModule.executeCommand(interaction, 'ai', {
      prompt,
      file,
      ephemeral,
      model: 'google/gemini-flash-latest',
      temperature: temp
    });
  }
};
