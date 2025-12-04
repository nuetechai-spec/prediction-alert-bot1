# How to Push Your Code to GitHub

This guide will walk you through installing Git and pushing your bot code to GitHub.

## Step 1: Install Git

### Option A: Download Git for Windows
1. Go to: https://git-scm.com/download/win
2. Download the installer (it will auto-detect 64-bit or 32-bit)
3. Run the installer
4. **Important**: During installation, choose these options:
   - ✅ "Git from the command line and also from 3rd-party software"
   - ✅ "Use Visual Studio Code as Git's default editor" (if you have VS Code)
   - ✅ "Override the default branch name" → Set to `main`
5. Click "Next" through the rest (defaults are fine)
6. Click "Install"
7. **Restart your terminal/PowerShell** after installation

### Option B: Install via Winget (if you have it)
```powershell
winget install --id Git.Git -e --source winget
```

### Verify Installation
Open a **new** PowerShell window and run:
```powershell
git --version
```
You should see something like: `git version 2.xx.x`

## Step 2: Create a GitHub Account (if you don't have one)

1. Go to: https://github.com
2. Click "Sign up"
3. Create your account (it's free)

## Step 3: Create a GitHub Repository

1. **Sign in** to GitHub
2. Click the **"+"** icon in the top right corner
3. Select **"New repository"**
4. Fill in:
   - **Repository name**: `prediction-alert-bot` (or any name you want)
   - **Description**: "Discord bot for prediction market alerts" (optional)
   - **Visibility**: Choose **Public** or **Private**
   - ⚠️ **DO NOT** check "Add a README file"
   - ⚠️ **DO NOT** check "Add .gitignore"
   - ⚠️ **DO NOT** check "Choose a license"
5. Click **"Create repository"**

## Step 4: Push Your Code to GitHub

Open PowerShell in your project folder and run these commands:

### 4.1 Navigate to Your Project
```powershell
cd "C:\Users\ZachC\Downloads\prediction-alert-bot (1)\prediction-alert-bot"
```

### 4.2 Initialize Git Repository
```powershell
git init
```

### 4.3 Add All Files
```powershell
git add .
```

### 4.4 Create Your First Commit
```powershell
git commit -m "Initial commit: Prediction alert bot"
```

### 4.5 Rename Branch to Main
```powershell
git branch -M main
```

### 4.6 Connect to GitHub
Replace `YOUR_USERNAME` with your GitHub username and `REPO_NAME` with your repository name:
```powershell
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
```

**Example:**
```powershell
git remote add origin https://github.com/johndoe/prediction-alert-bot.git
```

### 4.7 Push to GitHub
```powershell
git push -u origin main
```

**First time?** GitHub will ask you to sign in:
- A browser window will open
- Sign in to GitHub
- Authorize Git to access your account
- Return to PowerShell

## Step 5: Verify It Worked

1. Go to your GitHub repository page
2. You should see all your files there
3. Files like `.env` should **NOT** be visible (they're in `.gitignore`)

## Alternative: Using GitHub Desktop (Easier GUI Option)

If you prefer a visual interface:

### Install GitHub Desktop
1. Download: https://desktop.github.com/
2. Install and sign in with your GitHub account

### Push Your Code
1. Open GitHub Desktop
2. Click **"File"** → **"Add Local Repository"**
3. Click **"Choose..."** and select your `prediction-alert-bot` folder
4. Click **"Add Repository"**
5. You'll see all your files listed
6. At the bottom, type a commit message: `Initial commit: Prediction alert bot`
7. Click **"Commit to main"**
8. Click **"Publish repository"** button (top right)
9. Choose your repository name and visibility
10. Click **"Publish Repository"**

## Troubleshooting

### "git is not recognized"
- Git isn't installed or not in PATH
- **Solution**: Install Git (Step 1) and restart PowerShell

### "fatal: not a git repository"
- You're not in the right folder
- **Solution**: Make sure you're in the `prediction-alert-bot` folder

### "Permission denied" or "Authentication failed"
- GitHub authentication issue
- **Solution**: 
  - Use GitHub Desktop instead, OR
  - Set up a Personal Access Token:
    1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
    2. Generate new token (classic)
    3. Select scopes: `repo` (full control)
    4. Copy the token
    5. When Git asks for password, paste the token instead

### "remote origin already exists"
- You already added the remote
- **Solution**: 
  ```powershell
  git remote remove origin
  git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
  ```

### Files Not Showing on GitHub
- They might be in `.gitignore`
- **Solution**: Check `.gitignore` file - some files (like `.env`) are intentionally excluded for security

## What Gets Pushed?

✅ **Will be pushed:**
- All `.js` files
- `package.json`
- `README.md`
- `railway.json`
- All documentation files

❌ **Will NOT be pushed** (protected by `.gitignore`):
- `.env` files (contains secrets)
- `node_modules/` (dependencies)
- `logs/` (log files)
- `data/` (data files)

## Next Steps

Once your code is on GitHub:

1. **Deploy to Railway**: See `DEPLOY_TO_RAILWAY.md`
2. **Make Changes**: Edit files, then:
   ```powershell
   git add .
   git commit -m "Your change description"
   git push
   ```

## Quick Reference Commands

```powershell
# Check status
git status

# Add all changes
git add .

# Commit changes
git commit -m "Your message here"

# Push to GitHub
git push

# See what changed
git diff

# View commit history
git log
```

---

**Need help?** Check the troubleshooting section above or use GitHub Desktop for a visual interface!




