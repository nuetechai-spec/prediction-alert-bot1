# How to Fix Node.js Version Issue

## ⚡ QUICK FIX (Recommended - No Git Needed)

### Use Railway Dashboard:

1. **Go to Railway Dashboard:**
   - Open [railway.app](https://railway.app)
   - Click on your project "precious-strength"
   - Click on "prediction-alert-bot" service

2. **Add Environment Variable:**
   - Click the **"Variables"** tab
   - Click **"+ New Variable"**
   - Name: `NODE_VERSION`
   - Value: `20`
   - Click **"Add"**

3. **Redeploy:**
   - Go to **"Deployments"** tab
   - Find the latest deployment (the one with "ACTIVE" status)
   - Click the **"..."** menu (three dots) → **"Redeploy"**
   - Wait for it to finish (2-3 minutes)

4. **Check Logs:**
   - Go to **"Logs"** tab
   - You should see Node.js v20.x.x instead of v18.20.5
   - The `ReferenceError: File is not defined` errors should be gone
   - Look for: `Logged in as YourBot#1234`

---

## 🔧 Alternative: Install Git and Push Changes

If you want to push the changes to GitHub:

### Step 1: Install Git

1. Download Git for Windows: https://git-scm.com/download/win
2. Run the installer (use default options)
3. **Restart your terminal/PowerShell** after installation

### Step 2: Open Terminal in the Right Folder

1. **Open PowerShell:**
   - Press `Windows Key + X`
   - Click "Windows PowerShell" or "Terminal"

2. **Navigate to your project:**
   ```powershell
   cd "C:\Users\ZachC\Downloads\prediction-alert-bot (1)\prediction-alert-bot"
   ```

### Step 3: Run Git Commands

```powershell
# Check if git is working
git --version

# Check current status
git status

# Add the changed files
git add package.json .nvmrc railway.json

# Commit the changes
git commit -m "Fix: Upgrade to Node.js 20 to resolve File API error"

# Push to GitHub (this will trigger Railway auto-deploy)
git push
```

**Note:** If you haven't set up git remote yet, you'll need to:
```powershell
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

---

## ✅ After Fixing

Once Railway redeploys with Node.js 20:

1. **Check Railway Logs:**
   - Should show: `Node.js v20.x.x` (not v18)
   - No more `ReferenceError: File is not defined` errors
   - Should see: `Logged in as YourBot#1234`

2. **Check Discord:**
   - Bot should appear **online** (green dot)
   - Try `!health` command - should respond

3. **If Still Having Issues:**
   - Check Railway logs for new error messages
   - Verify `DISCORD_TOKEN` is set correctly in Railway Variables
   - Make sure bot is invited to your Discord server

---

## 🎯 Recommended: Use Option 1 (Railway Dashboard)

It's faster and doesn't require installing anything. Just add the environment variable and redeploy!



