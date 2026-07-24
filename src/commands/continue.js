const { SlashCommandBuilder } = require('discord.js');
const aiModule = require('../ai');

module.exports = {
  isAiCommand: true,
  data: new SlashCommandBuilder()
    .setName('continue')
    .setDescription('Continue writing an unfinished creative draft')
    .addStringOption(option =>
      option.setName('draft')
        .setDescription('Paste the end of your draft here')
        .setRequired(false)
    )
    .addAttachmentOption(option =>
      option.setName('file')
        .setDescription('Or upload a text/markdown file draft (.txt, .md)')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('private')
        .setDescription('Whether the response should only be visible to you (ephemeral)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('model')
        .setDescription('Override default AI model')
        .setAutocomplete(true)
        .setRequired(false)
    )
    .addNumberOption(option =>
      option.setName('temperature')
        .setDescription('Creativity level (0.0 = analytical, 1.0 = creative)')
        .setMinValue(0)
        .setMaxValue(2)
        .setRequired(false)
    ),

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const choices = ['gpt-4o', 'claude-3.5-sonnet', 'meta-llama-3.1-405b', 'hermes-3-llama-3.1-8b', 'ollama-local'];
    const filtered = choices.filter(choice => choice.includes(focusedValue));
    await interaction.respond(
      filtered.map(choice => ({ name: choice, value: choice }))
    ).catch(() => {});
  },

  async execute(interaction) {
    const draft = interaction.options.getString('draft') || '';
    const file = interaction.options.getAttachment('file');
    const ephemeral = interaction.options.getBoolean('private') || false;
    const model = interaction.options.getString('model');
    const temp = interaction.options.getNumber('temperature');

    await aiModule.executeCommand(interaction, 'continue', {
      draft,
      file,
      ephemeral,
      model,
      temperature: temp
    });
  }
};
