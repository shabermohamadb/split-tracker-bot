const fs = require('fs');
const path = require('path');
const http = require('http');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const config = require('./config');
const db = require('./database');
const { startNotifier } = require('./notifier');
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
      const players = await fetchSheetData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, players }));
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
        const players = await fetchSheetData();
        const matchedPlayer = players.find(p => p.name.toLowerCase() === link.ign.toLowerCase());

        if (matchedPlayer) {
          await db.updateCachedBalance(matchedPlayer.name, matchedPlayer.balance, matchedPlayer.total, matchedPlayer.fine);
        }

        const embed = createSplitEmbed(link.ign, matchedPlayer);
        
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

// Login
client.login(config.discordToken).catch(err => {
  console.error('\n❌ ERROR: Discord login failed.');
  console.error(err.message);
  console.error('Please verify that your DISCORD_TOKEN is correct and has the necessary gateway intents enabled in the developer portal.\n');
});
