# Quick Bot Status Check ⚡

## Right Now - Check These 3 Things:

### 1. Railway Logs (2 minutes)
1. Open Railway Dashboard
2. Click your service: `prediction-alert-bot`
3. Click **"Logs"** tab
4. Look for: `Logged in as YourBotName#1234`
   - ✅ **Found it?** → Bot is running!
   - ❌ **Not found?** → See errors below

### 2. Discord Channel (30 seconds)
1. Go to your Discord server
2. Check the alert channel
3. Look for: `✅ Bot Online` message
   - ✅ **Found it?** → Bot is connected!
   - ❌ **Not found?** → Bot isn't connecting to Discord

### 3. Test Command (30 seconds)
1. In Discord, type: `!testalert`
2. Bot should send a test message
   - ✅ **Works?** → Bot is fully functional!
   - ❌ **Doesn't work?** → Bot might not be running

---

## Common Errors & Quick Fixes

### Error: `DISCORD_TOKEN is required`
**Fix:** Railway → Variables → Add `DISCORD_TOKEN`

### Error: `DISCORD_ALERT_CHANNEL_ID is required`
**Fix:** Railway → Variables → Add `DISCORD_ALERT_CHANNEL_ID`

### Error: `Failed to fetch alert channel`
**Fix:** Check that `DISCORD_ALERT_CHANNEL_ID` is correct (right-click channel → Copy ID)

### Error: `Invalid token`
**Fix:** Your Discord bot token is wrong. Get a new one from Discord Developer Portal

### No errors but bot doesn't respond
**Check:**
- Is deployment status "ACTIVE" (green checkmark)?
- Are environment variables set in Railway?
- Does bot have permission to send messages in the channel?

---

## What "Unexposed Service" Means

**✅ This is NORMAL!** Discord bots don't need a public URL. They connect directly to Discord's servers. The "Unexposed service" message just means Railway isn't giving it a web URL - which is fine!

---

## Still Stuck?

1. **Copy the error message** from Railway Logs
2. **Check which step failed** from the 3 checks above
3. **Verify environment variables** are all set in Railway

See `RAILWAY_DIAGNOSTIC_GUIDE.md` for detailed troubleshooting.

