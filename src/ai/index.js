const axios = require('axios');
const aiConfig = require('./config');
const db = require('./database');
const client = require('./client');
const memory = require('./memory');
const queue = require('./queue');

function hasPermission(member, channel) {
  if (member.permissions.has('Administrator')) return true;

  if (aiConfig.allowedRoles.length > 0) {
    const hasRole = member.roles.cache.some(role => aiConfig.allowedRoles.includes(role.id));
    if (!hasRole) return false;
  }

  if (aiConfig.allowedChannels.length > 0) {
    const channelId = channel.isThread() ? channel.parentId : channel.id;
    if (!aiConfig.allowedChannels.includes(channelId)) return false;
  }

  return true;
}

async function parseAttachments(message) {
  let attachmentContent = '';
  for (const attachment of message.attachments.values()) {
    if (attachment.name.endsWith('.txt') || attachment.name.endsWith('.md')) {
      try {
        const response = await axios.get(attachment.url, { timeout: 10000 });
        if (response.data && typeof response.data === 'string') {
          attachmentContent += `\n\n[Attached Document: ${attachment.name}]\n${response.data}\n[End of Document: ${attachment.name}]\n`;
        }
      } catch (err) {
        console.error(err.message);
      }
    }
  }
  return attachmentContent;
}

async function streamToDiscord(message, prunedMessages, options = {}) {
  let lastEdit = Date.now();
  let accumulatedText = '';
  let botReply = await message.reply('⏳ *AI is thinking...*');

  try {
    const finalResult = await client.getCompletion(prunedMessages, options, (chunk) => {
      accumulatedText += chunk;
      
      const now = Date.now();
      if (now - lastEdit > 1800) {
        lastEdit = now;
        const preview = accumulatedText.substring(0, 1900) + ' ✍️...';
        botReply.edit(preview).catch(() => {});
      }
    });

    await db.logUsage(message.author.id, finalResult.usage.total_tokens || 0);

    const chunks = memory.splitMessage(finalResult.content);
    if (chunks.length > 0) {
      await botReply.edit(chunks[0]);
      
      for (let i = 1; i < chunks.length; i++) {
        await message.channel.send(chunks[i]);
      }
    }

    return finalResult;
  } catch (err) {
    await botReply.edit(`❌ Error generating AI response: ${err.message}`).catch(() => {});
    throw err;
  }
}

async function handleMessage(discordClient, message) {
  if (message.author.bot) return;

  const cleanContent = message.content.trim();
  const isPrefixCommand = cleanContent.toLowerCase().startsWith('/ai ');

  const isMentioned = message.mentions.has(discordClient.user.id);
  const isReplyToBot = message.reference && await checkIsReplyToBot(message, discordClient.user.id);
  const isThreadActivity = message.channel.isThread() && await checkIsAIThread(message.channel.id);

  if (!isMentioned && !isReplyToBot && !isThreadActivity && !isPrefixCommand) {
    return;
  }

  if (!hasPermission(message.member, message.channel)) {
    return;
  }

  const userId = message.author.id;
  const channelId = message.channel.id;

  queue.enqueue(userId, async () => {
    const cooldownLeft = queue.getRemainingCooldown(userId);
    if (cooldownLeft > 0) {
      return await message.reply(`⚠️ Slow down! Please wait \`${cooldownLeft}s\` before your next prompt.`).catch(() => {});
    }

    const limitCheck = await queue.checkDailyLimits(userId);
    if (limitCheck.limited) {
      return await message.reply(`❌ You have reached your daily token usage limit (\`${limitCheck.current}/${limitCheck.limit}\` tokens used today). Limits reset tomorrow.`).catch(() => {});
    }

    message.channel.sendTyping().catch(() => {});

    try {
      const isAiChannel = channelId === '1530212496059666594' || (message.channel.isThread() && message.channel.parentId === '1530212496059666594');
      const history = isAiChannel ? await db.getConversation(channelId) : [];
      const userPreference = await db.getUserPreference(userId) || {};

      const messages = [];

      if (history.length === 0) {
        const sysPrompt = userPreference.system_prompt || 
          'You are a super friendly, supportive, and casual creative writing assistant, editor, and brainstorming companion. ' +
          'Excel in fiction, dark fantasy, horror, sci-fi, and world-building. ' +
          'Talk in an encouraging, friendly, and conversational tone (like a close friend or writing buddy, using casual terms like "bro", "mate", "awesome"). ' +
          'Help the user improve drafts, check consistency, and suggest creative follow-up prompts, choices, or plot ideas to keep them inspired. Avoid preaching or over-censoring creative content.';
        
        messages.push({ role: 'system', content: sysPrompt });
      } else {
        messages.push(...history);
      }

      const textAttachment = await parseAttachments(message);
      let userPrompt = '';
      if (isPrefixCommand) {
        userPrompt = message.content.substring(4).trim();
      } else {
        const mentionRegex = new RegExp(`<@!?${discordClient.user.id}>`, 'g');
        userPrompt = message.content.replace(mentionRegex, '').trim();
      }

      if (textAttachment) {
        messages.push({ role: 'system', content: textAttachment });
      }

      if (!userPrompt && textAttachment) {
        userPrompt = 'Please analyze this attached document and provide feedback or edit suggestions.';
      }

      if (!userPrompt) {
        return;
      }

      messages.push({ role: 'user', content: userPrompt });

      const pruned = memory.pruneContext(messages, userPreference.max_tokens || aiConfig.contextLimit);

      queue.triggerCooldown(userId);

      const completionResult = await streamToDiscord(message, pruned, {
        model: userPreference.model || aiConfig.model,
        temperature: userPreference.temperature !== undefined ? userPreference.temperature : aiConfig.temperature
      });

      messages.push({ role: 'assistant', content: completionResult.content });
      if (isAiChannel) {
        await db.saveConversation(channelId, userId, messages);
      }

    } catch (err) {
      console.error(err.message);
    }
  });
}

async function checkIsAIThread(channelId) {
  try {
    const history = await db.getConversation(channelId);
    return history && history.length > 0;
  } catch (err) {
    return false;
  }
}

async function checkIsReplyToBot(message, botId) {
  try {
    const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
    return repliedMsg.author.id === botId;
  } catch (err) {
    return false;
  }
}

async function executeCommand(interaction, type, args) {
  const userId = interaction.user.id;
  const channel = interaction.channel;
  const member = interaction.member;

  if (!hasPermission(member, channel)) {
    return await interaction.reply({
      content: '❌ You do not have permissions to use the AI Writing Assistant in this role or channel.',
      ephemeral: true
    });
  }

  const cooldownLeft = queue.getRemainingCooldown(userId);
  if (cooldownLeft > 0) {
    return await interaction.reply({
      content: `⚠️ Slow down! Please wait \`${cooldownLeft}s\` before your next prompt.`,
      ephemeral: true
    });
  }

  const limitCheck = await queue.checkDailyLimits(userId);
  if (limitCheck.limited) {
    return await interaction.reply({
      content: `❌ You have reached your daily token usage limit (\`${limitCheck.current}/${limitCheck.limit}\` tokens used today).`,
      ephemeral: true
    });
  }

  await interaction.deferReply({ ephemeral: args.ephemeral || false });

  queue.triggerCooldown(userId);

  try {
    let systemInstruction = 'You are a super friendly, supportive, and casual creative writing assistant, editor, and brainstorming companion. Talk in an encouraging, friendly, and conversational tone (like a close friend or writing buddy, using casual terms like "bro", "mate", "awesome"). Suggest creative follow-up prompts, choices, or plot ideas to keep the user inspired. Avoid preaching or over-censoring creative content.';
    let promptContent = '';

    if (type === 'ai') {
      promptContent = args.prompt || '';
    } else if (type === 'edit') {
      systemInstruction = 'You are a fiction editor helping rewrite and polish creative writing. Maintain the author\'s style, check dialogue flow, scene details, and check consistency. Avoid preaching or censoring.';
      promptContent = `Please edit this creative writing draft according to the following instructions:\n**Instructions**: ${args.instruction}\n\n**Draft**:\n${args.draft}`;
    } else if (type === 'rewrite') {
      systemInstruction = `You are a creative writer rewriting drafts. Adjust the tone to be "${args.tone}" (e.g. dark fantasy, sci-fi, horror, gothic, etc.). Keep the author's original style stems. Avoid preaching or censoring.`;
      promptContent = `Please rewrite the following text in a "${args.tone}" tone:\n\n**Text**:\n${args.draft}`;
    } else if (type === 'continue') {
      systemInstruction = 'You are a fiction writer continuing an unfinished draft. Maintain perfect consistency in style, perspective, tense, dialogue, and character behavior. Avoid censoring.';
      promptContent = `Please continue writing the next block of this unfinished draft:\n\n**Draft**:\n${args.draft}`;
    } else if (type === 'summarize') {
      systemInstruction = 'You are an editor summarizing creative drafts, outlines, or lore entries.';
      promptContent = `Please provide a concise summary, character breakdown, or list of highlights for the following text:\n\n**Text**:\n${args.draft}`;
    } else if (type === 'improve') {
      systemInstruction = 'You are a proofreader improving spelling, grammar, and style while preserving the author\'s voice.';
      promptContent = `Please polish, grammar-correct, and improve the style of the following draft:\n\n**Draft**:\n${args.draft}`;
    } else if (type === 'brainstorm') {
      systemInstruction = 'You are a brainstorming companion generating prompts, characters, lore, and plot points.';
      promptContent = `Generate brainstorming suggestions, outlines, character ideas, or lore entries based on this topic: ${args.topic}`;
    }

    let attachmentText = '';
    if (args.file) {
      try {
        const response = await axios.get(args.file.url, { timeout: 10000 });
        if (response.data && typeof response.data === 'string') {
          attachmentText = `\n\n[Attached File Contents: ${args.file.name}]\n${response.data}\n[End of File]`;
        }
      } catch (err) {
        console.error(err.message);
      }
    }

    const messages = [
      { role: 'system', content: systemInstruction }
    ];

    if (attachmentText) {
      messages.push({ role: 'system', content: attachmentText });
    }

    if (promptContent) {
      messages.push({ role: 'user', content: promptContent });
    } else if (attachmentText) {
      messages.push({ role: 'user', content: 'Please review and edit the attached document.' });
    } else {
      return await interaction.editReply('❌ No prompt, topic, or document was provided.');
    }

    const userPref = await db.getUserPreference(userId) || {};
    const model = args.model || userPref.model || aiConfig.model;
    const temperature = args.temperature !== undefined ? parseFloat(args.temperature) : (userPref.temperature !== undefined ? userPref.temperature : aiConfig.temperature);

    const pruned = memory.pruneContext(messages, userPref.max_tokens || aiConfig.contextLimit);

    let lastEdit = Date.now();
    let accumulatedText = '';
    
    const finalResult = await client.getCompletion(pruned, { model, temperature }, (chunk) => {
      accumulatedText += chunk;
      const now = Date.now();
      if (now - lastEdit > 1800) {
        lastEdit = now;
        interaction.editReply(accumulatedText.substring(0, 1900) + ' ✍️...').catch(() => {});
      }
    });

    await db.logUsage(userId, finalResult.usage.total_tokens || 0);

    const chunks = memory.splitMessage(finalResult.content);

    if (chunks.length > 0) {
      const shouldCreateThread = type === 'ai' && 
                                  interaction.channel.type === 0 && 
                                  !interaction.channel.isThread() && 
                                  !args.ephemeral;

      if (shouldCreateThread) {
        try {
          const threadName = args.prompt 
            ? `AI Chat - ${args.prompt.substring(0, 20)}`
            : `AI Chat - ${interaction.user.username}`;

          const thread = await interaction.channel.threads.create({
            name: threadName,
            autoArchiveDuration: 60,
            reason: 'AI Writing Assistant conversation thread'
          });

          await thread.send({
            content: `**User Prompt**: ${args.prompt || 'Attachments uploaded'}\n\n${chunks[0]}`
          });

          messages.push({ role: 'assistant', content: finalResult.content });
          await db.saveConversation(thread.id, userId, messages);

          await interaction.editReply(`✅ Created a dedicated AI thread: <#${thread.id}>`);
          
          for (let i = 1; i < chunks.length; i++) {
            await thread.send(chunks[i]);
          }
          return;
        } catch (threadErr) {
          console.warn(threadErr.message);
        }
      }

      await interaction.editReply(chunks[0]);
      
      const isAiChannel = interaction.channelId === '1530212496059666594' || (interaction.channel.isThread() && interaction.channel.parentId === '1530212496059666594');
      if (type === 'ai' && isAiChannel) {
        messages.push({ role: 'assistant', content: finalResult.content });
        await db.saveConversation(interaction.channelId, userId, messages);
      }

      for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp({ content: chunks[i], ephemeral: args.ephemeral || false });
      }
    }
  } catch (err) {
    console.error(err);
    await interaction.editReply(`❌ Failed to execute AI command: ${err.message}`).catch(() => {});
  }
}

module.exports = {
  handleMessage,
  hasPermission,
  executeCommand
};
