# 🚂 Deploy to Railway - Complete Guide

This is your complete guide to hosting your prediction alert bot on Railway with GitHub integration.

## 📋 What You Need

1. ✅ Your bot code (you have this)
2. ✅ GitHub account (free)
3. ✅ Railway account (free tier available)
4. ✅ Discord bot token and channel ID

## 🎯 Quick Steps

### Step 1: Push Code to GitHub

**Option A: Command Line**
```bash
cd prediction-alert-bot
git init
git add .
git commit -m "Initial commit: Prediction alert bot"
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
git branch -M main
git push -u origin main
```

**Option B: GitHub Desktop**
1. Download [GitHub Desktop](https://desktop.github.com/)
2. File → Add Local Repository
3. Select `prediction-alert-bot` folder
4. Click "Publish repository"

### Step 2: Deploy to Railway

1. **Go to Railway**: [railway.app](https://railway.app)
2. **Sign in** with GitHub
3. **New Project** → **Deploy from GitHub repo**
4. **Select your repository**
5. **Add Environment Variables** (Variables tab):
   ```
   DISCORD_TOKEN=your_token_here
   DISCORD_ALERT_CHANNEL_ID=your_channel_id
   ```
6. **Wait for deployment** (check Logs tab)

### Step 3: Verify It Works

- Check Railway **Logs** for: `Logged in as YourBot#1234`
- In Discord, try: `!testalert` or `/testalert`

## 📚 Detailed Guides

- **Quick Start**: See `RAILWAY_QUICK_START.md`
- **Full Guide**: See `RAILWAY_DEPLOYMENT.md` (troubleshooting, advanced config)

## 🔄 Auto-Deploy

Once connected, Railway automatically deploys when you:
- Push to GitHub
- Merge pull requests
- Update your code

## 💰 Cost

- **Free Tier**: $5 credit/month (usually enough for a Discord bot)
- Your bot should run fine on the free tier

## 🆘 Need Help?

1. Check Railway **Logs** tab for errors
2. Verify all environment variables are set
3. See `RAILWAY_DEPLOYMENT.md` for troubleshooting

---

**Ready to deploy?** Start with Step 1 above! 🚀

