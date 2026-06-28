# Split Tracker Discord Bot

The **Split Tracker** is a premium Discord bot designed to keep track of loot split balances from a Google Sheet. It allows players to link their Albion Online In-Game Names (IGNs) to their Discord accounts, query their split balances, and receive instant DMs and channel notifications when their balances are updated by administrators.

## Features
- 🔗 **`/linkign <ign>`**: Link your Discord account to your Albion Online character name (case-insensitive check against the sheet).
- 💰 **`/mysplit`**: Shows current balance, total earnings, and fines in a beautiful embed. Includes a `🔄 Refresh` button to query the sheet on demand.
- 📭 **`/unlinkign`**: Unlinks your Discord account.
- 🔄 **`/sync`** (Admin only): Forces the bot to check the spreadsheet for updates immediately.
- 👥 **`/linkother <user> <ign>`** (Admin only): Links another user's Discord account to an IGN.
- 📋 **`/viewsplits <filter>`** (Admin only): View summaries of positive, negative, or non-zero balances.
- 🔔 **Automated Balance Alerts**: Background polling loop detects changes on the spreadsheet and sends:
  - Direct Messages (DMs) to linked users.
  - Channel announcements in a configured channel (reminding unlinked users to link their account).

---

## Prerequisites
- **Node.js**: v18.0.0 or higher.
- A **Google Sheet** (publicly viewable via link) that contains your loot split records.

---

## Discord Developer Portal Configuration

Before running the bot, you need to create an application in the Discord Developer Portal:

1. Visit the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application**, name it (e.g., `Split Tracker`), and create it.
3. Navigate to the **Bot** tab on the left sidebar:
   - Click **Add Bot**.
   - Under **Privileged Gateway Intents**, enable:
     - **Server Members Intent** (required to look up user tags).
     - **Message Content Intent** (optional but recommended for compatibility).
   - Click **Reset Token** and copy the bot token. Paste this as `DISCORD_TOKEN` in your `.env` file.
4. Navigate to the **OAuth2** tab:
   - Copy the **Client ID** (Application ID). Paste this as `DISCORD_CLIENT_ID` in your `.env` file.
   - Go to **URL Generator** under OAuth2.
   - Select the `bot` and `applications.commands` scopes.
   - Select the following bot permissions:
     - **Send Messages**
     - **Embed Links**
     - **Use External Emojis**
     - **Read Message History**
   - Copy the generated URL and open it in a browser to invite the bot to your Discord server.
5. In your Discord app, enable Developer Mode and copy your **Guild ID** (Server ID). Paste this as `DISCORD_GUILD_ID` in your `.env` file.

---

## Installation & Configuration

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   Open the `.env` file and replace the placeholder values:
   ```env
   DISCORD_TOKEN=your_bot_token_here
   DISCORD_CLIENT_ID=your_client_id_here
   DISCORD_GUILD_ID=your_guild_id_here
   
   # SPREADSHEET_URL should point to your loot split Google Sheet:
   SPREADSHEET_URL=https://docs.google.com/spreadsheets/d/1lXrXb3ek7ewkPhx2WHuKPaJzUHqSHo2Lahvr58fXdZ4/edit?usp=sharing
   
   # Background checking frequency in minutes:
   POLL_INTERVAL_MINUTES=10
   
   # Optional: Post updates to a specific channel (e.g. #loot-split-updates)
   NOTIFICATION_CHANNEL_ID=your_channel_id_here
   
   # Optional: Restrict admin commands to a specific Discord Role ID (in addition to server Admins)
   ADMIN_ROLE_ID=
   ```

---

## How to Run

### Test Your Spreadsheet Integration
Verify that the bot can fetch and parse your spreadsheet rows before launching:
```bash
npm run test-sheet
```
This script will output a table of the first 10 players and check some specific player records to confirm the columns map correctly.

### Run in Development/Production
Start the bot:
```bash
npm start
```
On startup, the bot registers all slash commands to your guild instantly (using `DISCORD_GUILD_ID`) and boots up the database. If commands were updated, they will be refreshed immediately.

---

- `src/index.js` - Bot bootloader, health check HTTP server, gateway connections, command router, button listeners.
- `src/config.js` - Configuration loader and Google URL parser.
- `src/database.js` - Dual-mode database (PostgreSQL on cloud, JSON file locally).
- `src/sheets.js` - Live Google Sheet exporter and parser.
- `src/notifier.js` - Automated scheduler that checks for differences and triggers alerts.
- `src/commands/` - Subdirectory hosting all slash command definitions.

---

## Deploying to Render (24/7 Free Hosting)

This project contains a `render.yaml` blueprint that makes deploying on Render.com simple and persists database links for free.

### Step-by-Step Deployment:
1. **Push your code to GitHub/GitLab**: Push this bot's project folder to your own git repository.
2. **Link to Render**:
   - Go to [Render Dashboard](https://dashboard.render.com/) and click **New > Blueprint**.
   - Connect your GitHub repository.
3. **Configure Database & Secrets**:
   - Render will read the `render.yaml` file, provision a free Node.js Web Service, and set up a free PostgreSQL database.
   - You will be prompted to enter the missing environment variables in the Render dashboard:
     - `DISCORD_TOKEN`
     - `DISCORD_CLIENT_ID`
     - `DISCORD_GUILD_ID`
4. **Approve and Deploy**:
   - Click **Apply** to deploy the database and web service. Once the web service builds, your bot will log into Discord!

### Keeping the Bot Awake 24/7 (Free Tier Keep-Alive):
Render's free tier web services spin down after 15 minutes of inactivity. To prevent this:
1. Copy the public URL of your Render service (e.g., `https://split-tracker-bot.onrender.com`).
2. Go to a free uptime monitoring service like [UptimeRobot](https://uptimerobot.com/) or [Cron-Job.org](https://cron-job.org/).
3. Set up an HTTP monitor pointing to your Render URL that runs every **10 minutes**.
4. This will trigger the bot's health check server in `src/index.js` and keep the bot active 24/7!

