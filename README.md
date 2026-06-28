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

## File Structure
- `src/index.js` - Bot bootloader, gateway connections, command router, button listeners.
- `src/config.js` - Configuration loader and Google URL parser.
- `src/database.js` - Local database helper utilizing a lightweight, pure JS JSON storage (`data/db.json`).
- `src/sheets.js` - Live Google Sheet exporter and parser.
- `src/notifier.js` - Automated scheduler that checks for differences and triggers alerts.
- `src/commands/` - Subdirectory hosting all slash command definitions.
