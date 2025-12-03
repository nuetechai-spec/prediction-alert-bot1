# Bot Restart Instructions

## ⚠️ You Need to Restart the Bot

After adding new features (logging, error alerts, uptime tracking, and usage metrics), you **must restart** the bot for changes to take effect.

## How to Restart

### Option 1: If Running in Terminal Window
1. Find the terminal window where the bot is running
2. Press `Ctrl+C` to stop the bot
3. Run: `npm start` (or `node index.js`)

### Option 2: If Using PM2 (Process Manager)
```bash
cd prediction-alert-bot
pm2 restart prediction-alert-bot
# OR if you don't know the name:
pm2 list
pm2 restart <id>
```

### Option 3: Kill and Restart Manually
```powershell
# Find the bot process (look for node.exe running index.js)
tasklist | findstr node

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F

# Restart
cd prediction-alert-bot
npm start
```

## What to Look For After Restart

### ✅ Success Indicators:
1. **Startup Message**: You should see "Bot Online" message in Discord
2. **Log Files Created**: Check for `logs/` directory with:
   - `bot.log` - All logs
   - `error.log` - Errors only
3. **Data Directory**: `data/` directory will be created for metrics
4. **New Commands Available**:
   - `/metrics` or `!metrics` - View usage analytics
   - All existing commands still work

### 📊 New Features Active:
- ✅ Enhanced logging (file + console)
- ✅ Error alerts to Discord
- ✅ Uptime tracking
- ✅ Usage metrics for all tools
- ✅ Periodic status updates (every 6 hours)

## Verify It's Working

1. **Check Discord**: Bot should send "Bot Online" message
2. **Test Commands**: Try `/metrics` or `!metrics` to see usage stats
3. **Check Logs**: Look in `logs/bot.log` for activity
4. **Wait for Scan**: Bot will run first scan on startup

## Troubleshooting

If bot doesn't start:
- Check `.env` file has all required variables
- Check `logs/error.log` for errors
- Verify Node.js version: `node --version` (needs 18+)
- Check Discord token is valid

## Next Steps

After restart, the bot will:
- Start tracking all usage metrics
- Log to files automatically
- Send error alerts for critical issues
- Track uptime and send periodic status updates






