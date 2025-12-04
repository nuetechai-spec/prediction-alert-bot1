# Railway Bot Diagnostic Guide

## How to Check if Your Bot is Running

### 1. Check Railway Logs (Most Important!)

**In Railway Dashboard:**
1. Click on your service: `prediction-alert-bot`
2. Click the **"Logs"** tab at the top
3. Look for these messages:

**✅ Bot is Running Successfully:**
```
Logged in as YourBotName#1234
Bot started
Scheduled recurring scans
```

**❌ Bot is NOT Running (Common Errors):**

**Missing Discord Token:**
```
Error: DISCORD_TOKEN is required.
```
**Fix:** Go to Railway → Variables tab → Add `DISCORD_TOKEN`

**Missing Channel ID:**
```
Error: DISCORD_ALERT_CHANNEL_ID is required.
```
**Fix:** Go to Railway → Variables tab → Add `DISCORD_ALERT_CHANNEL_ID`

**Discord Connection Failed:**
```
Discord client error
Failed to resolve alert channel
```
**Fix:** Check that:
- `DISCORD_TOKEN` is correct
- `DISCORD_ALERT_CHANNEL_ID` is correct
- Bot has permission to access the channel

### 2. Check Deployment Status

**In Railway Dashboard:**
- Look at the **"Deployments"** tab
- You should see: **"ACTIVE"** with green checkmark ✅
- If you see **"REMOVED"** or **"FAILED"** → The bot crashed

### 3. What "Unexposed Service" Means

**This is NORMAL!** ✅

Discord bots don't need to be "exposed" (they don't need a public URL). They connect to Discord's servers directly. The "Unexposed service" message is just Railway telling you the service doesn't have a public web URL - which is fine for a Discord bot.

### 4. Verify Bot is Actually Working

**Check Discord:**
1. Go to your Discord server
2. Check the alert channel (the one you set in `DISCORD_ALERT_CHANNEL_ID`)
3. You should see a message like:

```
✅ Bot Online
YourBotName#1234 is now monitoring prediction markets.

• Scanning every 1 minute(s)
• Thresholds: Confidence ≥30, Liquidity ≥$500
• Window: Markets resolving within 30 days

Use !scan or /scan to manually trigger a scan.
Use !config or /config to see current settings.
```

**If you DON'T see this message:**
- The bot hasn't started successfully
- Check Railway logs for errors
- Verify environment variables are set

### 5. Required Environment Variables Checklist

Go to Railway → Your Service → **Variables** tab and verify these are set:

**✅ REQUIRED:**
- `DISCORD_TOKEN` - Your Discord bot token
- `DISCORD_ALERT_CHANNEL_ID` - The channel ID where alerts go

**⚠️ RECOMMENDED (for slash commands):**
- `DISCORD_CLIENT_ID` - Your bot's client ID
- `DISCORD_GUILD_ID` - Your Discord server ID

**📊 OPTIONAL (for better performance):**
- `POLY_API_KEY` - Polymarket API key (reduces rate limiting)
- `KALSHI_API_KEY` - Kalshi API key
- `KALSHI_API_SECRET` - Kalshi API secret

**⚙️ OPTIONAL (customization):**
- `SCAN_INTERVAL_MINUTES` - How often to scan (default: 1, range: 1-5)
- `MIN_CONFIDENCE` - Minimum confidence score (default: 30)
- `MIN_LIQUIDITY` - Minimum liquidity in $ (default: 500)

### 6. Common Issues & Fixes

#### Issue: Bot shows "Deployment successful" but nothing happens

**Check:**
1. Railway Logs tab - look for error messages
2. Discord channel - did the bot send a startup message?
3. Environment variables - are they all set correctly?

**Fix:**
- Most likely missing `DISCORD_TOKEN` or `DISCORD_ALERT_CHANNEL_ID`
- Check logs for the exact error

#### Issue: Bot crashes immediately after starting

**Check Railway Logs for:**
- `DISCORD_TOKEN is required` → Add token to Variables
- `DISCORD_ALERT_CHANNEL_ID is required` → Add channel ID
- `Failed to fetch alert channel` → Check channel ID is correct
- `Invalid token` → Discord token is wrong

#### Issue: Bot starts but no alerts appear

**This is NORMAL if:**
- No markets meet your thresholds (confidence ≥30, liquidity ≥$500)
- All markets are being suppressed by duplicate cache
- APIs are rate-limited (normal without API keys)

**To test:**
- Use `!testalert` command in Discord to verify bot is responding
- Use `!scan` command to manually trigger a scan
- Use `!config` to see current thresholds

#### Issue: "Rate limited" messages in logs

**This is NORMAL without API keys!**

The bot will:
- Still work, but may get rate-limited occasionally
- Use fallback scraping when rate-limited
- Automatically retry after cooldown period

**To fix:**
- Add `POLY_API_KEY` to Railway Variables for better rate limits
- Add `KALSHI_API_KEY` and `KALSHI_API_SECRET` for Kalshi

### 7. Quick Health Check Commands

**In Discord, try these commands:**

1. `!config` or `/config` - Shows current settings
2. `!testalert` or `/testalert` - Sends a test alert (verifies bot works)
3. `!scan` or `/scan` - Manually triggers a market scan
4. `!stats` or `/stats` - Shows bot statistics and health
5. `!health` or `/health` - Shows detailed health status

**If commands don't work:**
- Bot might not be running
- Check Railway logs
- Verify bot has proper permissions in Discord

### 8. How to View Real-Time Logs

**In Railway:**
1. Go to your service
2. Click **"Logs"** tab
3. You'll see real-time output from the bot
4. Look for:
   - `🔄 Starting market scan` - Bot is scanning
   - `✅ Scan completed` - Scan finished successfully
   - `📦 Total markets collected` - Markets found
   - `❌` or `⚠️` - Errors or warnings

### 9. Restart the Bot

**If you need to restart:**
1. Railway Dashboard → Your Service
2. Click the **"..."** menu (three dots)
3. Select **"Restart"**
4. Watch the Logs tab to see it start up

### 10. Still Not Working?

**Debugging Steps:**
1. ✅ Check Railway Logs tab for errors
2. ✅ Verify all required environment variables are set
3. ✅ Test with `!testalert` command in Discord
4. ✅ Check Discord channel permissions (bot needs to send messages)
5. ✅ Verify Discord bot token is correct
6. ✅ Check that channel ID is correct (right-click channel → Copy ID)

**Get Help:**
- Share the error message from Railway Logs
- Share what you see when running `!config` in Discord
- Check if `!testalert` works (this confirms basic connectivity)

---

## Summary: Is Your Bot Running?

**✅ YES if you see:**
- "Deployment successful" in Railway
- "Logged in as..." in Railway logs
- Startup message in Discord channel
- Commands like `!config` work in Discord

**❌ NO if you see:**
- Error messages in Railway logs
- No startup message in Discord
- Commands don't work
- "Deployment failed" status

**Most Common Issue:** Missing `DISCORD_TOKEN` or `DISCORD_ALERT_CHANNEL_ID` environment variables.

