# How to Verify Your Bot is Hosted on Railway

## Quick Verification Checklist

### ✅ Method 1: Railway Dashboard
1. Go to [railway.app](https://railway.app) and sign in
2. Open your project
3. Check **Deployments** tab:
   - Latest deployment should show ✅ **"Active"** or **"Success"**
   - Should have a green checkmark
4. Check **Logs** tab:
   - Look for: `Logged in as YourBot#1234`
   - Look for: `Bot started successfully`
   - Look for: Periodic scan messages every few minutes
   - **No errors** = Good sign!

### ✅ Method 2: Discord Verification
1. **Check if bot is online:**
   - Open your Discord server
   - Look for your bot in the member list
   - Status should show **🟢 Online** (green dot)

2. **Test bot commands:**
   - Type `!health` or `/health` in your Discord channel
   - Bot should respond with health status
   - Type `!stats` or `/stats` to see metrics
   - Type `!testalert` or `/testalert` to test alerts

3. **Check for activity:**
   - Bot should automatically post alerts to your configured channel
   - Check if you're receiving market alerts

### ✅ Method 3: Railway Service Status
In Railway dashboard, check:
- **Status**: Should be "Active" or "Running"
- **Uptime**: Shows how long it's been running
- **Metrics**: CPU/Memory usage should show activity
- **Recent Deployments**: Should show successful deployments

### ✅ Method 4: Check Environment Variables
1. In Railway dashboard → **Variables** tab
2. Verify these are set:
   - `DISCORD_TOKEN` ✅
   - `DISCORD_ALERT_CHANNEL_ID` ✅
3. If missing, bot won't start properly

## Common Issues & Solutions

### ❌ Bot Not Online in Discord
**Possible causes:**
- Bot token is incorrect → Check `DISCORD_TOKEN` in Railway
- Bot not invited to server → Re-invite with correct permissions
- Bot crashed → Check Railway logs for errors

**Fix:**
1. Check Railway logs for error messages
2. Verify `DISCORD_TOKEN` is correct in Railway Variables
3. Redeploy: Go to Deployments → Click "Redeploy"

### ❌ No Logs in Railway
**Possible causes:**
- Deployment failed
- Service not started

**Fix:**
1. Check Deployments tab for failed builds
2. Look for error messages
3. Verify `package.json` has `"start": "node index.js"`

### ❌ Bot Commands Not Working
**Possible causes:**
- Slash commands not registered
- Missing `DISCORD_CLIENT_ID` or `DISCORD_GUILD_ID`

**Fix:**
1. Add `DISCORD_CLIENT_ID` to Railway Variables
2. Add `DISCORD_GUILD_ID` to Railway Variables
3. Redeploy the service

### ❌ Bot Keeps Restarting
**Possible causes:**
- Crashes due to errors
- Missing environment variables
- API connection issues

**Fix:**
1. Check Railway logs for crash errors
2. Verify all required environment variables are set
3. Check API keys are valid

## Success Indicators

Your bot is **definitely hosted** if you see:
- ✅ Bot appears online in Discord
- ✅ Railway shows "Active" deployment
- ✅ Logs show "Logged in as..." message
- ✅ Bot responds to `!health` command
- ✅ Receiving periodic market alerts

## Still Not Sure?

Run this quick test:
1. Open Railway dashboard → Logs tab
2. Type `!health` in Discord
3. If you see the command in logs AND get a response in Discord = ✅ **Hosted and working!**

---

**Need Help?**
- Check Railway logs for specific error messages
- Verify all environment variables are set correctly
- Make sure your Discord bot has proper permissions in the server



