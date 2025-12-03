# Railway Quick Start Guide

## 🚀 Fast Track Deployment

### 1. Push to GitHub (if not done)
```bash
cd prediction-alert-bot
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
git branch -M main
git push -u origin main
```

### 2. Deploy to Railway

1. **Sign up**: [railway.app](https://railway.app) (use GitHub to sign in)
2. **New Project** → **Deploy from GitHub repo**
3. **Select your repository**
4. **Add Environment Variables** (Variables tab):
   - `DISCORD_TOKEN` (required)
   - `DISCORD_ALERT_CHANNEL_ID` (required)
   - Add other variables as needed (see full guide)

### 3. Verify

- Check **Logs** tab for: `Logged in as YourBot#1234`
- Test in Discord: `!testalert`

## ✅ That's It!

Railway auto-deploys on every GitHub push. See `RAILWAY_DEPLOYMENT.md` for detailed instructions.

