# Next Step: Deploy to Railway 🚂

Your code is on GitHub! Now let's deploy it to Railway so your bot runs 24/7.

## Step 1: Sign Up for Railway (2 minutes)

1. Go to: **https://railway.app**
2. Click **"Start a New Project"** or **"Login"**
3. **Sign in with GitHub** (use the same GitHub account)
4. Authorize Railway to access your GitHub

## Step 2: Create New Project (1 minute)

1. In Railway dashboard, click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Find and select your `prediction-alert-bot` repository
4. Click on it to deploy

## Step 3: Add Environment Variables (3 minutes)

Railway needs your Discord bot credentials:

1. In your Railway project, click on your service
2. Go to the **"Variables"** tab
3. Click **"New Variable"** and add these one by one:

### Required Variables:
```
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_ALERT_CHANNEL_ID=your_channel_id_here
```

### Optional (but recommended):
```
DISCORD_CLIENT_ID=your_client_id
DISCORD_GUILD_ID=your_guild_id
DISCORD_ADMIN_ROLE_ID=your_admin_role_id
DISCORD_OWNER_ID=your_owner_id
```

### Optional API Keys:
```
POLY_API_KEY=your_polymarket_key
KALSHI_API_KEY=your_kalshi_key
KALSHI_API_SECRET=your_kalshi_secret
```

### Configuration (Optional):
```
SCAN_INTERVAL_MINUTES=2
MIN_CONFIDENCE=30
MIN_LIQUIDITY=500
LOG_LEVEL=info
```

**Important:**
- No quotes around values
- No spaces around `=` sign
- Example: `DISCORD_TOKEN=abc123` ✅
- Example: `DISCORD_TOKEN="abc123"` ❌

## Step 4: Deploy (Automatic!)

1. Railway automatically starts building
2. Watch the **"Deployments"** tab
3. Wait 2-3 minutes for build to complete
4. Check **"Logs"** tab to see if bot is running

## Step 5: Verify It's Working

### Check Railway Logs:
1. Go to **"Logs"** tab in Railway
2. Look for: `Logged in as YourBot#1234`
3. Look for: `Bot started`
4. Look for: `Scan completed` messages

### Test in Discord:
1. Go to your Discord server
2. The bot should appear **online**
3. Try: `!testalert` or `/testalert`
4. Try: `!scan` or `/scan`
5. Try: `!health` or `/health`

## Troubleshooting

### Bot Not Starting?
- Check **Logs** tab for errors
- Verify `DISCORD_TOKEN` is correct
- Verify `DISCORD_ALERT_CHANNEL_ID` is correct
- Make sure channel ID is a number (no quotes)

### "DISCORD_TOKEN is required" Error?
- Go to Variables tab
- Make sure `DISCORD_TOKEN` is spelled exactly right
- No extra spaces
- Click **"Redeploy"** after adding variables

### Bot Offline in Discord?
- Check Railway logs for connection errors
- Verify bot has proper permissions in Discord
- Make sure bot is invited to your server

### Need to Restart?
- Go to **Deployments** tab
- Click **"Redeploy"** on latest deployment
- Or use **"Restart"** button in settings

## What Happens Next?

✅ **Auto-Deploy**: Every time you push to GitHub, Railway automatically deploys the new version!

✅ **24/7 Running**: Your bot runs continuously on Railway's servers

✅ **Monitoring**: Check Railway logs anytime to see what your bot is doing

## Cost

- **Free Tier**: $5 credit/month (usually enough for a Discord bot)
- Your bot should run fine on the free tier
- Railway only charges for actual usage

## Success Checklist

- [ ] Code pushed to GitHub ✅ (You did this!)
- [ ] Railway account created
- [ ] Project created from GitHub repo
- [ ] Environment variables added
- [ ] Deployment successful
- [ ] Bot online in Discord
- [ ] Test commands working

---

**Ready?** Go to https://railway.app and start deploying! 🚀

Need help? Check `RAILWAY_DEPLOYMENT.md` for detailed troubleshooting.



