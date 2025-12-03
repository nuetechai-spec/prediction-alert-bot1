# 🚀 START HERE - Get Your Bot Running in 5 Minutes

**Follow these steps IN ORDER. The bot will NOT work until you complete all required steps.**

---

## 📋 REQUIRED STEPS (Must Do These)

### 1️⃣ Create Your .env File

Open PowerShell in the `prediction-alert-bot` folder and run:

```powershell
Copy-Item .env.example .env
```

Then open `.env` in a text editor (Notepad, VS Code, etc.)

---

### 2️⃣ Get Your Discord Bot Token (REQUIRED)

1. Go to: **https://discord.com/developers/applications**
2. Click **"New Application"** → Name it (e.g., "Prediction Bot")
3. Click on your application
4. Go to **"Bot"** in the left sidebar
5. Click **"Reset Token"** or **"Copy"** → **COPY THIS TOKEN**
6. ⚠️ **IMPORTANT:** Scroll down to "Privileged Gateway Intents"
   - ✅ Enable **"Message Content Intent"**
   - ✅ Click **"Save Changes"**
7. Paste the token in your `.env` file:
   ```
   DISCORD_TOKEN=paste_your_token_here
   ```

---

### 3️⃣ Get Your Discord Channel ID (REQUIRED)

1. Open Discord
2. Go to **User Settings** → **Advanced** → Enable **"Developer Mode"**
3. In your Discord server, **right-click** on the channel where you want alerts
4. Click **"Copy Channel ID"**
5. Paste it in your `.env` file:
   ```
   DISCORD_ALERT_CHANNEL_ID=paste_your_channel_id_here
   ```

---

### 4️⃣ Invite Your Bot to Discord Server (REQUIRED)

**⚠️ You MUST do this before starting the bot!**

1. Go to: **https://discord.com/developers/applications**
2. Select your application
3. Go to **"OAuth2"** → **"URL Generator"**
4. Under **Scopes**, check:
   - ✅ `bot`
   - ✅ `applications.commands` (optional, for slash commands)
5. Under **Bot Permissions**, check:
   - ✅ `Send Messages`
   - ✅ `Embed Links`
   - ✅ `Read Message History`
   - ✅ `View Channels`
6. **Copy the generated URL** at the bottom
7. **Open the URL** in your browser
8. Select your Discord server
9. Click **"Authorize"**

---

### 5️⃣ Verify Setup (Recommended)

Run this to check if everything is configured:

```powershell
node verify-setup.js
```

This will tell you if anything is missing.

---

### 6️⃣ Start the Bot

```powershell
npm start
```

**What you should see:**
```
2024-01-15T10:00:00.000Z [info] Logged in as YourBotName#1234
2024-01-15T10:00:00.100Z [info] Scheduled recurring scans
2024-01-15T10:00:05.000Z [info] Scan finished { reason: 'startup' }
```

**✅ Success indicators:**
- "Logged in as..." message appears
- Bot shows as **online** (green dot) in Discord
- No error messages

---

### 7️⃣ Test the Bot

In Discord, type:
- `!testalert` - Should post a test alert to your channel
- `!config` - Should show your configuration
- `!scan` - Should manually scan markets

---

## ⚠️ TROUBLESHOOTING

### Bot Won't Start

**Error: "DISCORD_TOKEN is required"**
- ✅ Make sure `.env` file exists
- ✅ Check `DISCORD_TOKEN=` has a value (no spaces around `=`)
- ✅ Make sure token is correct (get a new one if needed)

**Error: "Could not resolve channel"**
- ✅ Check `DISCORD_ALERT_CHANNEL_ID` is correct
- ✅ Make sure bot is **invited to your server** (Step 4)
- ✅ Make sure bot can **view that channel**

**Error: "Invalid token"**
- ✅ Token may have been reset - get a new one from Developer Portal
- ✅ Make sure you copied the **entire token**

### Bot Starts But Commands Don't Work

**Commands not responding:**
- ✅ Make sure **"Message Content Intent"** is enabled in Developer Portal
- ✅ Restart bot after enabling
- ✅ Make sure bot has permission to send messages in that channel

**Slash commands don't appear (`/scan` doesn't work):**
- ✅ Bot will still work with `!scan` commands
- ✅ To enable slash commands, add `DISCORD_CLIENT_ID` and `DISCORD_GUILD_ID` to `.env`
- ✅ See `SETUP_CHECKLIST.md` for how to get these

---

## 🎯 QUICK REFERENCE

### Minimum Required in .env:
```
DISCORD_TOKEN=your_token_here
DISCORD_ALERT_CHANNEL_ID=your_channel_id_here
```

### Commands Available:
- `!scan` - Manually scan markets
- `!config` - Show configuration  
- `!testalert` - Send test alert

### Bot Behavior:
- **Scans every 2 minutes** automatically
- **Posts alerts** when markets meet criteria
- **Suppresses duplicates** for 2 hours

---

## 🔑 Optional: Polymarket API Key (Recommended)

**Want better performance and fewer rate limits?**

👉 **Quick Setup (3 min):** See [QUICK_START_API_KEY.md](./QUICK_START_API_KEY.md)  
👉 **Full Guide:** See [API_KEY_SETUP.md](./API_KEY_SETUP.md)

**Note:** The bot works fine without an API key, but having one improves performance!

---

## 📚 Need More Help?

- **API Key Setup:** See [QUICK_START_API_KEY.md](./QUICK_START_API_KEY.md) (3 min) or [API_KEY_SETUP.md](./API_KEY_SETUP.md) (detailed)
- **Detailed setup:** See `SETUP_CHECKLIST.md`
- **Environment variables:** See `ENV_SETUP_GUIDE.md`
- **Getting started:** See `GETTING_STARTED.md`
- **Client ID explained:** See `CLIENT_ID_EXPLAINED.md`

---

## ✅ CHECKLIST

Before starting the bot, make sure:

- [ ] `.env` file exists (copied from `.env.example`)
- [ ] `DISCORD_TOKEN` is set in `.env`
- [ ] `DISCORD_ALERT_CHANNEL_ID` is set in `.env`
- [ ] "Message Content Intent" is enabled in Discord Developer Portal
- [ ] Bot is invited to your Discord server
- [ ] Bot has permissions in your server
- [ ] Dependencies are installed (`npm install` if needed)
- [ ] Verified setup with `node verify-setup.js`

**Once all checked, run `npm start`!** 🚀


