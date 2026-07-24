const { SlashCommandBuilder } = require('discord.js');
const aiModule = require('../ai');

module.exports = {
  isAiCommand: true,
  data: new SlashCommandBuilder()
    .setName('rewrite')
    .setDescription('Rewrite a draft in a specific tone or genre')
    .addStringOption(option =>
      option.setName('tone')
        .setDescription('Select or type a tone (e.g., "gothic horror", "cyberpunk", "noir")')
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('draft')
        .setDescription('Paste your writing draft text here')
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
    const focusedOption = interaction.options.getFocused(true);
    
    if (focusedOption.name === 'tone') {
      const focusedValue = focusedOption.value.toLowerCase();
      const tones = ['Dark Fantasy', 'Sci-Fi', 'Gothic Horror', 'Steampunk', 'Noir', 'Poetic', 'Action-Packed', 'Suspenseful', 'Grimdark', 'Cyberpunk'];
      const filtered = tones.filter(choice => choice.toLowerCase().includes(focusedValue));
      await interaction.respond(
        filtered.map(choice => ({ name: choice, value: choice }))
      ).catch(() => {});
    } else if (focusedOption.name === 'model') {
      const focusedValue = focusedOption.value.toLowerCase();
      const models = ['gpt-4o', 'claude-3.5-sonnet', 'meta-llama-3.1-405b', 'hermes-3-llama-3.1-8b', 'ollama-local'];
      const filtered = models.filter(choice => choice.includes(focusedValue));
      await interaction.respond(
        filtered.map(choice => ({ name: choice, value: choice }))
      ).catch(() => {});
    }
  },

  async execute(interaction) {
    const tone = interaction.options.getString('tone');
    const draft = interaction.options.getString('draft') || '';
    const file = interaction.options.getAttachment('file');
    const ephemeral = interaction.options.getBoolean('private') || false;
    const model = interaction.options.getString('model');
    const temp = interaction.options.getNumber('temperature');

    await aiModule.executeCommand(interaction, 'rewrite', {
      tone,
      draft,
      file,
      ephemeral,
      model,
      temperature: temp
    });
  }
};
