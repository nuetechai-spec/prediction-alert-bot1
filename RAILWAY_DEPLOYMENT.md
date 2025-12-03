# Railway Deployment Guide

This guide will walk you through deploying your prediction alert bot to Railway and connecting it to GitHub for automatic deployments.

## Prerequisites

1. **GitHub Account** - You'll need a GitHub account
2. **Railway Account** - Sign up at [railway.app](https://railway.app) (free tier available)
3. **Git Repository** - Your code should be in a GitHub repository

## Step 1: Push Your Code to GitHub

If you haven't already, follow these steps to push your code to GitHub:

### Option A: Using Command Line

1. **Initialize Git** (if not already done):
   ```bash
   cd prediction-alert-bot
   git init
   ```

2. **Add all files**:
   ```bash
   git add .
   ```

3. **Create initial commit**:
   ```bash
   git commit -m "Initial commit: Prediction alert bot"
   ```

4. **Create GitHub repository**:
   - Go to [github.com](https://github.com)
   - Click the "+" icon → "New repository"
   - Name it (e.g., "prediction-alert-bot")
   - Choose public or private
   - **DO NOT** initialize with README, .gitignore, or license
   - Click "Create repository"

5. **Connect and push**:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
   git branch -M main
   git push -u origin main
   ```

### Option B: Using GitHub Desktop

1. Download [GitHub Desktop](https://desktop.github.com/)
2. File → Add Local Repository
3. Select the `prediction-alert-bot` folder
4. Click "Publish repository"
5. Follow the prompts

## Step 2: Deploy to Railway

### 2.1 Create Railway Project

1. Go to [railway.app](https://railway.app) and sign in (you can use GitHub to sign in)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Authorize Railway to access your GitHub account if prompted
5. Select your repository (`prediction-alert-bot`)
6. Railway will automatically detect it's a Node.js project

### 2.2 Configure Environment Variables

Railway needs your environment variables. Add them in the Railway dashboard:

1. In your Railway project, click on your service
2. Go to the **"Variables"** tab
3. Add all required environment variables:

#### Required Variables:
```
DISCORD_TOKEN=your_discord_bot_token
DISCORD_ALERT_CHANNEL_ID=your_channel_id
```

#### Optional but Recommended:
```
DISCORD_CLIENT_ID=your_client_id
DISCORD_GUILD_ID=your_guild_id
DISCORD_ADMIN_ROLE_ID=your_admin_role_id
DISCORD_OWNER_ID=your_owner_id
POLY_API_KEY=your_polymarket_api_key
KALSHI_API_KEY=your_kalshi_api_key
KALSHI_API_SECRET=your_kalshi_api_secret
```

#### Configuration Variables (Optional):
```
SCAN_INTERVAL_MINUTES=2
MIN_CONFIDENCE=30
MIN_LIQUIDITY=500
MAX_MARKET_AGE_MINUTES=5760
DUPLICATE_SUPPRESSION_MINUTES=60
API_TIMEOUT_MS=10000
RATE_LIMIT_PAUSE_MS=300000
LOG_LEVEL=info
```

**Important Notes:**
- Never commit `.env` files to GitHub
- Railway encrypts environment variables
- You can add variables one at a time or use the "Raw Editor" to paste multiple

### 2.3 Configure Build Settings

Railway should auto-detect Node.js, but verify:

1. Go to **"Settings"** tab
2. **Root Directory**: Should be `/` (or leave empty)
3. **Build Command**: Railway auto-detects `npm install`
4. **Start Command**: Should be `npm start` (which runs `node index.js`)

### 2.4 Deploy

1. Railway will automatically start building and deploying
2. Watch the **"Deployments"** tab for progress
3. Once deployed, check the **"Logs"** tab to see if your bot is running

## Step 3: Verify Deployment

1. **Check Logs**: In Railway, go to the **"Logs"** tab
   - You should see: `Logged in as YourBot#1234`
   - Look for: `Bot started` and scan messages

2. **Test in Discord**:
   - The bot should appear online in your Discord server
   - Try: `!testalert` or `/testalert` to verify it's working
   - Try: `!scan` or `/scan` to trigger a manual scan

3. **Monitor Health**:
   - Use `!health` or `/health` to check bot status
   - Use `!stats` or `/stats` to see performance metrics

## Step 4: Enable Auto-Deploy (GitHub Integration)

Railway automatically deploys when you push to GitHub:

1. **Default Behavior**: Railway watches your `main` branch
2. **Every push to `main`** triggers a new deployment
3. **Deployment Settings**: Go to **Settings** → **Deploy** to configure:
   - Branch to watch (default: `main`)
   - Auto-deploy on push (enabled by default)

### Custom Branch Deployments

To deploy from a different branch:
1. Go to **Settings** → **Deploy**
2. Change **"Production Branch"** to your desired branch
3. Or create a separate service for staging/testing

## Step 5: Monitoring & Maintenance

### Viewing Logs

- **Real-time Logs**: Railway dashboard → **Logs** tab
- **Historical Logs**: Click on any deployment to see its logs
- **Search Logs**: Use the search bar in the logs view

### Updating Your Bot

1. **Make changes** to your code locally
2. **Commit and push** to GitHub:
   ```bash
   git add .
   git commit -m "Your update message"
   git push
   ```
3. **Railway automatically deploys** the new version
4. **Monitor the deployment** in Railway dashboard

### Restarting the Bot

If you need to restart:
1. Go to **Deployments** tab
2. Click **"Redeploy"** on the latest deployment
3. Or use the **"Restart"** button in the service settings

## Troubleshooting

### Bot Not Starting

1. **Check Environment Variables**:
   - Verify `DISCORD_TOKEN` is set correctly
   - Verify `DISCORD_ALERT_CHANNEL_ID` is set
   - Check for typos in variable names

2. **Check Logs**:
   - Look for error messages in Railway logs
   - Common errors:
     - `DISCORD_TOKEN is required` → Missing token
     - `Failed to resolve channel` → Wrong channel ID
     - `Failed to register slash commands` → Missing CLIENT_ID or GUILD_ID

3. **Verify Node.js Version**:
   - Railway uses Node.js 18+ by default
   - Check `package.json` for any version requirements

### Bot Disconnects Frequently

1. **Check Railway Limits**:
   - Free tier has resource limits
   - Consider upgrading if you hit limits

2. **Check Discord Rate Limits**:
   - Too many API calls can cause disconnects
   - Adjust `SCAN_INTERVAL_MINUTES` if needed

3. **Monitor Health**:
   - Use `!health` command to check API status
   - Check Railway logs for error patterns

### Environment Variables Not Working

1. **Verify Format**:
   - No quotes needed around values
   - No spaces around `=` sign
   - Example: `DISCORD_TOKEN=abc123` ✅
   - Example: `DISCORD_TOKEN="abc123"` ❌ (quotes included in value)

2. **Redeploy After Changes**:
   - Environment variable changes require a redeploy
   - Go to **Deployments** → **Redeploy**

## Railway Pricing

- **Free Tier**: $5 credit/month (usually enough for a Discord bot)
- **Hobby Plan**: $5/month for more resources
- **Pro Plan**: $20/month for production workloads

Your bot should run fine on the free tier unless you have very high traffic.

## Security Best Practices

1. **Never commit secrets**: Use Railway environment variables
2. **Use private repos**: If your code contains sensitive logic
3. **Rotate tokens**: Regularly update your Discord bot token
4. **Monitor access**: Check Railway logs for unauthorized access
5. **Limit permissions**: Give your Discord bot only necessary permissions

## Next Steps

- ✅ Set up monitoring alerts (Railway can send email notifications)
- ✅ Configure custom domain (if needed)
- ✅ Set up staging environment for testing
- ✅ Enable Railway's metrics dashboard
- ✅ Set up backup strategies for your data

## Support

- **Railway Docs**: [docs.railway.app](https://docs.railway.app)
- **Railway Discord**: [discord.gg/railway](https://discord.gg/railway)
- **Your Bot Logs**: Check Railway dashboard → Logs tab

---

**Congratulations!** Your bot is now running on Railway with automatic deployments from GitHub! 🚀

