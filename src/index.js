const fs = require('fs');
const path = require('path');
const http = require('http');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const config = require('./config');
const db = require('./database');
const { startNotifier, checkForUpdates } = require('./notifier');
const { fetchSheetData } = require('./sheets');
const { createSplitEmbed } = require('./commands/mysplit');

// Check token configuration
if (!config.discordToken || config.discordToken === 'YOUR_DISCORD_BOT_TOKEN_HERE') {
  console.error('\n❌ ERROR: Discord token is not configured in .env.');
  console.error('Please configure DISCORD_TOKEN, DISCORD_CLIENT_ID, and SPREADSHEET_URL in your .env file.\n');
  process.exit(1);
}

// 🌐 Web Server for Render 24/7 Deployment & Interactive Dashboard
const PORT = process.env.PORT || 3000;
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  try {
    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(fs.readFileSync(path.join(__dirname, '../public/index.html')));
    } else if (pathname === '/style.css') {
      res.writeHead(200, { 'Content-Type': 'text/css' });
      res.end(fs.readFileSync(path.join(__dirname, '../public/style.css')));
    } else if (pathname === '/app.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(fs.readFileSync(path.join(__dirname, '../public/app.js')));
    } else if (pathname === '/api/splits') {
      try {
        const players1 = await fetchSheetData(config.spreadsheetId);
        let players2 = [];
        if (config.spreadsheetId2) {
          try {
            players2 = await fetchSheetData(config.spreadsheetId2);
          } catch (err) {
            console.error('[Web Server] Failed to fetch sheet 2:', err.message);
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          josephsteel: players1,
          king: players2,
          owner1: config.owner1,
          owner2: config.owner2,
          url1: config.spreadsheetUrl,
          url2: config.spreadsheetUrl2
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    } else if (pathname === '/api/links') {
      try {
        const links = await db.getAllLinks();
        const resolvedLinks = [];
        for (const link of links) {
          let username = 'Unknown';
          try {
            const user = await client.users.fetch(link.discord_id);
            username = user.username;
          } catch (err) {
            username = `ID: ${link.discord_id}`;
          }
          resolvedLinks.push({
            discord_id: link.discord_id,
            ign: link.ign,
            discord_username: username
          });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, links: resolvedLinks }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    } else if (pathname === '/api/debug') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        spreadsheetId1: config.spreadsheetId,
        spreadsheetId2: config.spreadsheetId2,
        url1: config.spreadsheetUrl ? 'set' : 'empty',
        url2: config.spreadsheetUrl2 ? 'set' : 'empty',
        dbMode: db.pool ? 'PostgreSQL' : 'JSON Local',
        owner1: config.owner1,
        owner2: config.owner2
      }));
    } else if (pathname === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'online',
        bot: client.user ? client.user.tag : 'connecting',
        timestamp: new Date().toISOString()
      }));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  } catch (err) {
    console.error(`[Web Server] Error serving ${req.url}:`, err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Internal Server Error' }));
  }
});

server.listen(PORT, () => {
  console.log(`[Web Server] Listening on port ${PORT}. Open http://localhost:${PORT} in your browser.`);
});

// Instantiate Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Load Commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
const commandsJson = [];

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  
  if (command.isAiCommand && !config.aiEnabled) {
    continue;
  }

  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    commandsJson.push(command.data.toJSON());
    console.log(`[Loader] Loaded command: /${command.data.name}`);
  } else {
    console.warn(`[Loader] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

// Client Ready Handler
client.once('ready', async () => {
  console.log(`\n🤖 Logged in as ${client.user.tag}!`);
  
  // 1. Initialize DB
  await db.initDb();

  if (config.aiEnabled) {
    try {
      const aiDb = require('./ai/database');
      await aiDb.initDb();
      const scheduler = require('./ai/scheduler');
      scheduler.startDailyReminder(client, '853633474869854219');
    } catch (err) {
      console.error('[AI Database] Initialization failed on boot:', err.message);
    }
  }
  
  // 2. Register Slash Commands
  const rest = new REST().setToken(config.discordToken);
  try {
    console.log(`[Slash Commands] Registering ${commandsJson.length} commands...`);
    
    if (config.guildId && config.guildId !== 'YOUR_DISCORD_GUILD_ID_HERE') {
      // Register in specific guild (instant registration, great for dev and guild bots)
      await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.guildId),
        { body: commandsJson }
      );
      console.log(`[Slash Commands] Successfully registered commands in guild: ${config.guildId}`);
    } else {
      // Register globally (can take up to an hour to propagate)
      await rest.put(
        Routes.applicationCommands(config.clientId),
        { body: commandsJson }
      );
      console.log('[Slash Commands] Successfully registered commands globally.');
    }
  } catch (error) {
    console.error('[Slash Commands] Registration failed:', error.message);
  }

  // 3. Start notifier polling loop
  startNotifier(client);
});

// Interaction Event Handler
client.on('interactionCreate', async interaction => {
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (command && command.autocomplete) {
      try {
        await command.autocomplete(interaction);
      } catch (err) {
        console.error(`[Autocomplete Error] command ${interaction.commandName}:`, err);
      }
    }
    return;
  }

  // Slash Commands
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`[Interaction] Error executing slash command /${interaction.commandName}:`, error);
      const replyPayload = { content: '❌ There was an error while executing this command!', ephemeral: true };
      
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(replyPayload);
      } else {
        await interaction.reply(replyPayload);
      }
    }
    return;
  }

  // Buttons (Refresh Balance)
  if (interaction.isButton()) {
    const customId = interaction.customId;
    if (customId.startsWith('refresh_split_')) {
      const ownerDiscordId = customId.replace('refresh_split_', '');
      
      // Restrict refresh action to the command owner
      if (interaction.user.id !== ownerDiscordId) {
        return await interaction.reply({
          content: '❌ You can only refresh your own balance. Use `/mysplit` to check yours.',
          ephemeral: true,
        });
      }

      await interaction.deferUpdate();

      try {
        const link = await db.getLinkByDiscordId(ownerDiscordId);
        if (!link) {
          return await interaction.followUp({
            content: '❌ Account link not found. Use `/linkign <ign>` to link your account.',
            ephemeral: true,
          });
        }

        console.log(`[Button] User ${interaction.user.tag} requested live refresh for IGN "${link.ign}"`);
        const players1 = await fetchSheetData(config.spreadsheetId);
        let players2 = [];
        if (config.spreadsheetId2) {
          try {
            players2 = await fetchSheetData(config.spreadsheetId2);
          } catch (err) {
            console.error('[Button] Failed to fetch sheet 2:', err.message);
          }
        }

        const matchedPlayer1 = players1.find(p => p.name.toLowerCase() === link.ign.toLowerCase());
        const matchedPlayer2 = players2.find(p => p.name.toLowerCase() === link.ign.toLowerCase());

        if (matchedPlayer1) {
          await db.updateCachedBalance(matchedPlayer1.name, config.owner1, matchedPlayer1.balance, matchedPlayer1.total, matchedPlayer1.fine);
        }
        if (matchedPlayer2) {
          await db.updateCachedBalance(matchedPlayer2.name, config.owner2, matchedPlayer2.balance, matchedPlayer2.total, matchedPlayer2.fine);
        }

        const embed = createSplitEmbed(link.ign, matchedPlayer1, matchedPlayer2);
        
        await interaction.editReply({
          embeds: [embed],
        });
      } catch (err) {
        console.error('[Button] Error refreshing split:', err.message);
        await interaction.followUp({
          content: '❌ Failed to fetch fresh data. Spreadsheet might be temporarily locked or offline.',
          ephemeral: true,
        });
      }
    }
  }
});

// Message Create Event (AI Multi-message conversations)
client.on('messageCreate', async message => {
  if (config.aiEnabled) {
    try {
      const aiModule = require('./ai');
      await aiModule.handleMessage(client, message);
    } catch (err) {
      console.error('[AI Message Listener] Error handling messageCreate:', err.message);
    }
  }
});

// Login
client.login(config.discordToken).catch(err => {
  console.error('\n❌ ERROR: Discord login failed.');
  console.error(err.message);
  console.error('Please verify that your DISCORD_TOKEN is correct and has the necessary gateway intents enabled in the developer portal.\n');
});
