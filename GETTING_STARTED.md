# Getting Started - Next Steps After Filling .env

Now that you've filled in your `.env` file, here's the step-by-step process to get your bot running!

## ✅ Step 1: Verify Your Setup

Before starting, make sure:

- [ ] `.env` file exists (you've copied `.env.example` to `.env`)
- [ ] Required variables are filled:
  - [ ] `DISCORD_TOKEN` (not empty, valid bot token)
  - [ ] `DISCORD_ALERT_CHANNEL_ID` (channel ID where alerts will post)
- [ ] Optional but recommended:
  - [ ] `DISCORD_CLIENT_ID` (for slash commands)
  - [ ] `DISCORD_GUILD_ID` (for slash commands)

---

## 🔧 Step 2: Install Dependencies

Open a terminal in the `prediction-alert-bot` folder and run:

```bash
npm install
```

This installs all required packages (discord.js, axios, cheerio, etc.).

**What to expect:**
- Terminal will show progress as packages install
- Takes 30-60 seconds typically
- Should complete without errors

**If you see errors:**
- Make sure you're in the `prediction-alert-bot` folder
- Try deleting `node_modules` and `package-lock.json`, then run `npm install` again

---

## 🔑 Step 3: Invite Bot to Discord Server

**Before starting the bot, you need to invite it to your Discord server with proper permissions.**

### Quick Invite Method:

1. Go to https://discord.com/developers/applications
2. Select your bot application
3. Go to **"OAuth2"** → **"URL Generator"** in the left sidebar
4. Under **Scopes**, check:
   - ✅ `bot`
   - ✅ `applications.commands` (if using slash commands)
5. Under **Bot Permissions**, check:
   - ✅ `Send Messages`
   - ✅ `Embed Links`
   - ✅ `Read Message History`
   - ✅ `View Channels`
   - ✅ `Use Slash Commands` (if using slash commands)
6. **Copy the generated URL** at the bottom
7. **Open the URL** in your browser
8. Select your Discord server
9. Click **"Authorize"**
10. Complete any CAPTCHA if prompted

### Manual Permissions:

Alternatively, you can invite the bot manually:

1. Right-click your server → **Server Settings** → **Integrations** → **Bots and Apps**
2. Add the bot manually using its Client ID
3. Ensure it has the permissions listed above

**⚠️ Important:** The bot must be in your server before it can start!

---

## 🚀 Step 4: Start the Bot

In your terminal (still in the `prediction-alert-bot` folder), run:

```bash
npm start
```

Or directly:
```bash
node index.js
```

### What You Should See:

```
2024-01-15T10:00:00.000Z [info] Logged in as YourBotName#1234
2024-01-15T10:00:00.100Z [info] Slash commands registered { guildId: '...' }
2024-01-15T10:00:00.200Z [info] Scheduled recurring scans { cron: '*/2 * * * *', intervalMinutes: 2 }
2024-01-15T10:00:05.000Z [info] Scan finished { reason: 'startup', considered: 150, eligible: 5, alerted: 2, suppressed: 0 }
```

**Success indicators:**
- ✅ "Logged in as YourBotName#1234"
- ✅ "Slash commands registered" (if Client ID/Guild ID are set)
- ✅ "Scheduled recurring scans"
- ✅ Bot appears online in Discord

**If you see errors:**
- Check the error message - it will tell you what's missing
- Common issues:
  - Invalid token → Get a new token from Developer Portal
  - Channel not found → Check `DISCORD_ALERT_CHANNEL_ID` is correct
  - Bot not in server → Invite it first (Step 3)

---

## ✅ Step 5: Test the Bot

Once the bot is running, test it in Discord:

### Test Slash Commands (if enabled):

1. Type `/` in any channel in your Discord server
2. You should see:
   - `/scan`
   - `/config`
   - `/testalert`
3. Try `/testalert` first - it sends a sample alert to verify formatting

### Test Prefix Commands (always available):

1. Type `!testalert` in any channel
2. Bot should respond and send a test alert to the configured channel
3. Type `!config` to see your current settings
4. Type `!scan` to manually trigger a scan

### Expected Results:

**`!testalert` or `/testalert`:**
- Bot replies acknowledging the command
- A test embed appears in your alert channel
- Embed shows sample market data

**`!config` or `/config`:**
- Bot displays current configuration:
  - Scan interval
  - Thresholds
  - Channel ID
  - Duplicate suppression settings

**`!scan` or `/scan`:**
- Bot scans Polymarket and Kalshi
- Logs show markets found
- Alerts posted if markets meet criteria
- Bot replies with scan summary

---

## 📊 Step 6: Monitor the Bot

### What Happens Automatically:

- **Every 2 minutes** (default): Bot automatically scans for new markets
- **Alerts posted**: When markets meet your criteria (confidence, liquidity, etc.)
- **Duplicate suppression**: Same market won't alert again for 2 hours (default)

### View Logs:

The bot logs everything to the terminal/console:
- Market scans
- Alerts sent
- API errors
- Operational alerts

**Log levels:**
- `error` - Only errors
- `warn` - Warnings and errors
- `info` - Normal operation (default)
- `debug` - Detailed debugging info

Change log level in `.env`:
```
LOG_LEVEL=debug
```

---

## 🛠️ Step 7: Troubleshooting

### Bot Won't Start

**Error: "DISCORD_TOKEN is required"**
- Check `.env` file exists and has `DISCORD_TOKEN=...`
- Make sure no spaces around the `=`

**Error: "Could not resolve channel"**
- Verify `DISCORD_ALERT_CHANNEL_ID` is correct
- Make sure bot has permission to view that channel
- Bot must be in the server

**Error: "Invalid token"**
- Token may have been reset - get a new one from Developer Portal
- Make sure you copied the entire token (it's long!)

### Bot Starts But No Commands Work

**Slash commands don't appear:**
- Check `DISCORD_CLIENT_ID` and `DISCORD_GUILD_ID` are set
- Restart the bot (slash commands register on startup)
- Wait 30-60 seconds after startup
- Make sure bot has `applications.commands` scope when invited

**Prefix commands don't work:**
- Make sure "Message Content Intent" is enabled in Developer Portal
- Bot → Privileged Gateway Intents → Enable "Message Content Intent"
- Restart the bot after enabling

**Bot doesn't respond:**
- Check bot has permission to send messages in that channel
- Check bot is online (green dot in Discord)
- Check logs for errors

### No Alerts Appearing

**Markets scanned but no alerts:**
- Markets may not meet your thresholds
- Try lowering `MIN_CONFIDENCE` (default: 55)
- Try lowering `MIN_LIQUIDITY` (default: 500)
- Run `!config` to see your current thresholds

**Check if markets are eligible:**
- Bot only alerts on markets resolving within 7 days
- Markets must have confidence score ≥ threshold
- Markets must have liquidity ≥ threshold

### API Errors

**"Polymarket API failed" or "Kalshi API failed":**
- This is normal - bot will try fallback scraping
- If you have API keys, add them to `.env` for better rate limits
- Check internet connection
- Wait a few minutes and try again

---

## 🎯 Quick Reference Commands

Once the bot is running, here are the commands:

| Command | Description |
|---------|-------------|
| `!scan` or `/scan` | Manually trigger a market scan |
| `!config` or `/config` | View current configuration |
| `!testalert` or `/testalert` | Send a test alert embed |

**All commands require:**
- Admin role (if `DISCORD_ADMIN_ROLE_ID` is set)
- Owner ID (if `DISCORD_OWNER_ID` is set)
- Or "Manage Guild" permission (default)

---

## 📝 Next Steps After Bot is Running

1. **Tune Thresholds:**
   - Adjust `MIN_CONFIDENCE` to filter more/less
   - Adjust `MIN_LIQUIDITY` for minimum market size
   - Adjust `SCAN_INTERVAL_MINUTES` for scan frequency

2. **Monitor Alerts:**
   - Watch your alert channel
   - Check which markets trigger alerts
   - Adjust thresholds based on what you see

3. **Add API Keys** (optional):
   - Get Polymarket API key for better rate limits
   - Get Kalshi API key/secret for better rate limits

4. **Keep Bot Running:**
   - Bot runs continuously while terminal is open
   - Close terminal = bot stops
   - For 24/7 operation, use PM2, systemd, or a VPS

---

## 🚨 Important Reminders

- ⚠️ **Never commit `.env` file** - it contains secrets
- ⚠️ **Keep bot token secret** - regenerate if exposed
- ⚠️ **Not financial advice** - bot provides informational alerts only
- ⚠️ **Respect rate limits** - don't modify scan interval too low (< 1 minute)
- ⚠️ **Comply with ToS** - review Polymarket and Kalshi terms of service

---

## 🎉 You're Done!

Your bot should now be:
- ✅ Running and online in Discord
- ✅ Scanning markets every 2 minutes
- ✅ Posting alerts when markets meet criteria
- ✅ Responding to commands

**Happy monitoring!** 📈

