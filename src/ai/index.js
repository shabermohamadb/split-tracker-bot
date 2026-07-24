const axios = require('axios');
const aiConfig = require('./config');
const db = require('./database');
const client = require('./client');
const memory = require('./memory');
const queue = require('./queue');

/**
 * Checks if a member has permission to use the AI module.
 */
function hasPermission(member, channel) {
  // Guild Owner or Admin always has access
  if (member.permissions.has('Administrator')) return true;

  // Check role restrictions
  if (aiConfig.allowedRoles.length > 0) {
    const hasRole = member.roles.cache.some(role => aiConfig.allowedRoles.includes(role.id));
    if (!hasRole) return false;
  }

  // Check channel restrictions
  if (aiConfig.allowedChannels.length > 0) {
    const channelId = channel.isThread() ? channel.parentId : channel.id;
    if (!aiConfig.allowedChannels.includes(channelId)) return false;
  }

  return true;
}

/**
 * Parses attached .txt or .md files.
 */
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
        console.error(`[AI Index] Failed to download attachment ${attachment.name}:`, err.message);
      }
    }
  }
  return attachmentContent;
}

/**
 * Throttled streaming message editor to display text updates smoothly.
 */
async function streamToDiscord(message, prunedMessages, options = {}) {
  let lastEdit = Date.now();
  let accumulatedText = '';
  let botReply = await message.reply('⏳ *AI is thinking...*');

  try {
    const finalResult = await client.getCompletion(prunedMessages, options, (chunk) => {
      accumulatedText += chunk;
      
      const now = Date.now();
      // Throttle edits to once every 1.8 seconds to avoid rate limits
      if (now - lastEdit > 1800) {
        lastEdit = now;
        const preview = accumulatedText.substring(0, 1900) + ' ✍️...';
        botReply.edit(preview).catch(() => {});
      }
    });

    // Save final tokens usage
    await db.logUsage(message.author.id, finalResult.usage.total_tokens || 0);

    // Split and output the final response
    const chunks = memory.splitMessage(finalResult.content);
    if (chunks.length > 0) {
      await botReply.edit(chunks[0]);
      
      // Send remaining chunks as sequential replies
      for (let i = 1; i < chunks.length; i++) {
        await message.channel.send(chunks[i]);
      }
    }

    return finalResult;
  } catch (err) {
    console.error('[AI Stream] Error during streaming completion:', err);
    await botReply.edit(`❌ Error generating AI response: ${err.message}`).catch(() => {});
    throw err;
  }
}

/**
 * Handle incoming message event for AI threads / replies.
 */
async function handleMessage(discordClient, message) {
  if (message.author.bot) return;

  const cleanContent = message.content.trim();
  const isPrefixCommand = cleanContent.toLowerCase().startsWith('/ai ');

  const isMentioned = message.mentions.has(discordClient.user.id);
  const isReplyToBot = message.reference && await checkIsReplyToBot(message, discordClient.user.id);
  const isThreadActivity = message.channel.isThread() && await checkIsAIThread(message.channel.id);

  if (!isMentioned && !isReplyToBot && !isThreadActivity && !isPrefixCommand) {
    return; // Not an AI conversation trigger
  }

  // Permission checks
  if (!hasPermission(message.member, message.channel)) {
    return; // Ignore if user lacks permissions
  }

  const userId = message.author.id;
  const channelId = message.channel.id;

  // Enqueue task for serialization per user
  queue.enqueue(userId, async () => {
    // 1. Cooldown checks
    const cooldownLeft = queue.getRemainingCooldown(userId);
    if (cooldownLeft > 0) {
      return await message.reply(`⚠️ Slow down! Please wait \`${cooldownLeft}s\` before your next prompt.`).catch(() => {});
    }

    // 2. Daily Limit checks
    const limitCheck = await queue.checkDailyLimits(userId);
    if (limitCheck.limited) {
      return await message.reply(`❌ You have reached your daily token usage limit (\`${limitCheck.current}/${limitCheck.limit}\` tokens used today). Limits reset tomorrow.`).catch(() => {});
    }

    // Trigger typing state
    message.channel.sendTyping().catch(() => {});

    try {
      // 3. Load active conversation
      const history = await db.getConversation(channelId);
      const userPreference = await db.getUserPreference(userId) || {};

      const messages = [];

      // Seed system instructions if conversation is fresh
      if (history.length === 0) {
        const sysPrompt = userPreference.system_prompt || 
          'You are an expert creative writing assistant, editor, and brainstorming companion. ' +
          'You excel in fiction, dark fantasy, horror, sci-fi, and world-building. ' +
          'Help the user improve drafts, continue scenes, rewrite styles, correct grammar, and check consistency. ' +
          'Always preserve the author\'s voice and unique style. Avoid preaching or over-censoring creative content.';
        
        messages.push({ role: 'system', content: sysPrompt });
      } else {
        messages.push(...history);
      }

      // 4. Download and parse attachments
      const textAttachment = await parseAttachments(message);
      let userPrompt = '';
      if (isPrefixCommand) {
        userPrompt = message.content.substring(4).trim();
      } else {
        userPrompt = message.content.replace(`<@${discordClient.user.id}>`, '').trim();
      }

      if (textAttachment) {
        messages.push({ role: 'system', content: textAttachment });
      }

      // Check if prompt is empty (only attachments uploaded)
      if (!userPrompt && textAttachment) {
        userPrompt = 'Please analyze this attached document and provide feedback or edit suggestions.';
      }

      if (!userPrompt) {
        return; // Empty message
      }

      messages.push({ role: 'user', content: userPrompt });

      // Prune messages to fit context limit
      const pruned = memory.pruneContext(messages, userPreference.max_tokens || aiConfig.contextLimit);

      // Trigger cooldown
      queue.triggerCooldown(userId);

      // 5. Stream response to Discord
      const completionResult = await streamToDiscord(message, pruned, {
        model: userPreference.model || aiConfig.model,
        temperature: userPreference.temperature !== undefined ? userPreference.temperature : aiConfig.temperature
      });

      // 6. Save updated conversation
      messages.push({ role: 'assistant', content: completionResult.content });
      await db.saveConversation(channelId, userId, messages);

    } catch (err) {
      console.error('[AI HandleMessage] Error in task queue:', err.message);
    }
  });
}

/**
 * Checks if a thread is an active AI conversation.
 */
async function checkIsAIThread(channelId) {
  try {
    const history = await db.getConversation(channelId);
    return history && history.length > 0;
  } catch (err) {
    return false;
  }
}

/**
 * Checks if a message is replying directly to the bot.
 */
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

  // 1. Permission checks
  if (!hasPermission(member, channel)) {
    return await interaction.reply({
      content: '❌ You do not have permissions to use the AI Writing Assistant in this role or channel.',
      ephemeral: true
    });
  }

  // 2. Cooldown checks
  const cooldownLeft = queue.getRemainingCooldown(userId);
  if (cooldownLeft > 0) {
    return await interaction.reply({
      content: `⚠️ Slow down! Please wait \`${cooldownLeft}s\` before your next prompt.`,
      ephemeral: true
    });
  }

  // 3. Daily Limit checks
  const limitCheck = await queue.checkDailyLimits(userId);
  if (limitCheck.limited) {
    return await interaction.reply({
      content: `❌ You have reached your daily token usage limit (\`${limitCheck.current}/${limitCheck.limit}\` tokens used today).`,
      ephemeral: true
    });
  }

  // Defer response
  await interaction.deferReply({ ephemeral: args.ephemeral || false });

  // Trigger cooldown
  queue.triggerCooldown(userId);

  try {
    // 4. Construct prompt based on command type
    let systemInstruction = 'You are an expert creative writing assistant, editor, and brainstorming companion. Avoid preaching or over-censoring creative content.';
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

    // 5. Fetch attachments if uploaded
    let attachmentText = '';
    if (args.file) {
      try {
        const response = await axios.get(args.file.url, { timeout: 10000 });
        if (response.data && typeof response.data === 'string') {
          attachmentText = `\n\n[Attached File Contents: ${args.file.name}]\n${response.data}\n[End of File]`;
        }
      } catch (err) {
        console.error('[AI Cmd] Attachment download failed:', err.message);
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

    // Load user preferences
    const userPref = await db.getUserPreference(userId) || {};
    const model = args.model || userPref.model || aiConfig.model;
    const temperature = args.temperature !== undefined ? parseFloat(args.temperature) : (userPref.temperature !== undefined ? userPref.temperature : aiConfig.temperature);

    const pruned = memory.pruneContext(messages, userPref.max_tokens || aiConfig.contextLimit);

    // 6. Run completion
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

    // Save tokens usage stats
    await db.logUsage(userId, finalResult.usage.total_tokens || 0);

    // 7. Output to Discord (handling message split)
    const chunks = memory.splitMessage(finalResult.content);

    if (chunks.length > 0) {
      const shouldCreateThread = type === 'ai' && 
                                  interaction.channel.type === 0 && // GuildText channel
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

          // Send the first chunk in the thread
          await thread.send({
            content: `**User Prompt**: ${args.prompt || 'Attachments uploaded'}\n\n${chunks[0]}`
          });

          // Save the thread conversation in the database
          messages.push({ role: 'assistant', content: finalResult.content });
          await db.saveConversation(thread.id, userId, messages);

          // Reply to the main interaction with a link to the thread
          await interaction.editReply(`✅ Created a dedicated AI thread: <#${thread.id}>`);
          
          // Send remaining chunks in the thread
          for (let i = 1; i < chunks.length; i++) {
            await thread.send(chunks[i]);
          }
          return;
        } catch (threadErr) {
          console.warn('[AI Cmd] Thread creation failed, falling back to direct message edit:', threadErr.message);
        }
      }

      // Default fallback: Edit the reply directly in the channel
      await interaction.editReply(chunks[0]);
      
      if (type === 'ai' && (interaction.channel.isThread() || interaction.channel.type === 1)) {
        messages.push({ role: 'assistant', content: finalResult.content });
        await db.saveConversation(interaction.channelId, userId, messages);
      }

      // Send remaining chunks
      for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp({ content: chunks[i], ephemeral: args.ephemeral || false });
      }
    }
  } catch (err) {
    console.error(`[AI Cmd] Command /${type} failed:`, err);
    await interaction.editReply(`❌ Failed to execute AI command: ${err.message}`).catch(() => {});
  }
}

module.exports = {
  handleMessage,
  hasPermission,
  executeCommand
};
