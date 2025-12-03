# 🚀 QUICK SETUP CHECKLIST - Get Your Bot Running in 5 Minutes

Follow these steps **in order** to get your bot working:

---

## ✅ STEP 1: Create Your .env File

1. Open PowerShell or Command Prompt in the `prediction-alert-bot` folder
2. Run this command:
   ```powershell
   Copy-Item .env.example .env
   ```
3. Open the `.env` file in a text editor (Notepad, VS Code, etc.)

---

## ✅ STEP 2: Get Your Discord Bot Token (REQUIRED)

1. Go to: https://discord.com/developers/applications
2. Click **"New Application"** → Give it a name (e.g., "Prediction Bot")
3. Click on your application
4. Go to **"Bot"** in the left sidebar
5. Click **"Reset Token"** or **"Copy"** (if token exists)
6. **⚠️ IMPORTANT:** Before using the token, scroll down and enable:
   - ✅ **"Message Content Intent"** (under Privileged Gateway Intents)
   - ✅ Click **"Save Changes"**
7. Copy your token and paste it in `.env`:
   ```
   DISCORD_TOKEN=paste_your_token_here
   ```

---

## ✅ STEP 3: Get Your Discord Channel ID (REQUIRED)

1. Open Discord
2. Go to **Settings** → **Advanced** → Enable **"Developer Mode"**
3. In your Discord server, right-click on the channel where you want alerts
4. Click **"Copy Channel ID"**
5. Paste it in `.env`:
   ```
   DISCORD_ALERT_CHANNEL_ID=paste_your_channel_id_here
   ```

---

## ✅ STEP 4: Get Client ID & Guild ID (For Slash Commands - OPTIONAL)

**Note:** Bot works without these, but you'll only have `!scan` commands instead of `/scan` commands.

### Client ID:
1. Go to: https://discord.com/developers/applications
2. Select your application
3. Go to **"General Information"**
4. Copy the **"Application ID"**
5. Paste in `.env`:
   ```
   DISCORD_CLIENT_ID=paste_your_client_id_here
   ```

### Guild ID (Server ID):
1. In Discord (with Developer Mode enabled)
2. Right-click on your server name/icon
3. Click **"Copy Server ID"**
4. Paste in `.env`:
   ```
   DISCORD_GUILD_ID=paste_your_server_id_here
   ```

---

## ✅ STEP 5: Invite Bot to Your Discord Server

**Before starting the bot, you MUST invite it to your server!**

1. Go to: https://discord.com/developers/applications
2. Select your application
3. Go to **"OAuth2"** → **"URL Generator"**
4. Under **Scopes**, check:
   - ✅ `bot`
   - ✅ `applications.commands` (if using slash commands)
5. Under **Bot Permissions**, check:
   - ✅ `Send Messages`
   - ✅ `Embed Links`
   - ✅ `Read Message History`
   - ✅ `View Channels`
6. Copy the generated URL at the bottom
7. Open the URL in your browser
8. Select your Discord server
9. Click **"Authorize"**
10. Complete CAPTCHA if prompted

---

## ✅ STEP 6: Start the Bot

1. Open PowerShell/Command Prompt in the `prediction-alert-bot` folder
2. Run:
   ```powershell
   npm start
   ```

### What You Should See:
```
2024-01-15T10:00:00.000Z [info] Logged in as YourBotName#1234
2024-01-15T10:00:00.100Z [info] Scheduled recurring scans { cron: '*/2 * * * *', intervalMinutes: 2 }
2024-01-15T10:00:05.000Z [info] Scan finished { reason: 'startup', considered: 150, eligible: 5, alerted: 2, suppressed: 0 }
```

✅ **SUCCESS INDICATORS:**
- "Logged in as..." message appears
- Bot shows as online (green dot) in Discord
- "Scheduled recurring scans" appears
- No error messages

---

## ✅ STEP 7: Test the Bot

### Test Commands:

1. **Test Alert:**
   - Type `!testalert` in any Discord channel (or `/testalert` if you set up slash commands)
   - Bot should reply and post a test embed in your alert channel

2. **Check Config:**
   - Type `!config` (or `/config`)
   - Bot should display your current settings

3. **Manual Scan:**
   - Type `!scan` (or `/scan`)
   - Bot should scan markets and report results

---

## 🎉 You're Done!

Your bot should now be:
- ✅ Running and online
- ✅ Scanning markets every 2 minutes
- ✅ Posting alerts when markets meet criteria
- ✅ Responding to commands

---

## 🚨 Troubleshooting

### Bot Won't Start

**Error: "DISCORD_TOKEN is required"**
- ✅ Check `.env` file exists
- ✅ Check `DISCORD_TOKEN=` line has a value (no spaces around `=`)

**Error: "Could not resolve channel"**
- ✅ Check `DISCORD_ALERT_CHANNEL_ID` is correct
- ✅ Make sure bot is invited to your server
- ✅ Make sure bot has permission to view that channel

**Error: "Invalid token"**
- ✅ Token may have been reset - get a new one from Developer Portal
- ✅ Make sure you copied the entire token

### Bot Starts But Commands Don't Work

**Slash commands don't appear:**
- ✅ Check `DISCORD_CLIENT_ID` and `DISCORD_GUILD_ID` are set
- ✅ Restart bot (commands register on startup)
- ✅ Make sure bot has `applications.commands` scope when invited

**Prefix commands don't work:**
- ✅ Make sure "Message Content Intent" is enabled in Developer Portal
- ✅ Restart bot after enabling

### No Alerts Appearing

**Markets scanned but no alerts:**
- ✅ Try lowering `MIN_CONFIDENCE` (e.g., set to `40`)
- ✅ Try lowering `MIN_LIQUIDITY` (e.g., set to `300`)
- ✅ Check logs - markets may not meet your thresholds

---

## 📝 Quick Reference

### Required .env Variables:
- `DISCORD_TOKEN` ✅
- `DISCORD_ALERT_CHANNEL_ID` ✅

### Optional but Recommended:
- `DISCORD_CLIENT_ID` (for slash commands)
- `DISCORD_GUILD_ID` (for slash commands)

### Commands Available:
- `!scan` or `/scan` - Manual market scan
- `!config` or `/config` - Show configuration
- `!testalert` or `/testalert` - Send test alert

---

## ⚠️ Important Notes

- **Never commit `.env` file** - it contains secrets!
- **Keep bot token secret** - regenerate if exposed
- **Bot must be online** for it to work (keep terminal/process running)
- **For 24/7 operation**, use PM2 or a VPS

---

**Need help?** Check the other documentation files:
- `ENV_SETUP_GUIDE.md` - Detailed explanation of each variable
- `GETTING_STARTED.md` - More detailed setup guide
- `CLIENT_ID_EXPLAINED.md` - Understanding Client ID


