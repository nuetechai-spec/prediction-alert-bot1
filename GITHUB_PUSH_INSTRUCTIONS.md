# Instructions to Push to GitHub

## Step 1: Install Git (if not already installed)
Download and install Git from: https://git-scm.com/download/win

## Step 2: Initialize Git Repository
Open PowerShell or Command Prompt in the `prediction-alert-bot` directory and run:

```bash
git init
```

## Step 3: Add All Files
```bash
git add .
```

## Step 4: Create Initial Commit
```bash
git commit -m "Initial commit: Premium Discord alert bot with market diversity system"
```

## Step 5: Create GitHub Repository
1. Go to https://github.com and sign in
2. Click the "+" icon in the top right
3. Select "New repository"
4. Name it (e.g., "prediction-alert-bot")
5. Choose public or private
6. **DO NOT** initialize with README, .gitignore, or license (we already have these)
7. Click "Create repository"

## Step 6: Add Remote and Push
GitHub will show you commands. Use these (replace YOUR_USERNAME and REPO_NAME):

```bash
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
git branch -M main
git push -u origin main
```

## Alternative: Using GitHub Desktop
1. Download GitHub Desktop: https://desktop.github.com/
2. File > Add Local Repository
3. Select the `prediction-alert-bot` folder
4. Click "Publish repository" button
5. Follow the prompts

## What Was Changed
- ✅ Premium embed formatting with better visual design
- ✅ Market images support (Polymarket & Kalshi)
- ✅ Market diversity system to prevent crypto overcrowding
- ✅ Category-based filtering (crypto, politics, sports, entertainment, etc.)
- ✅ Enhanced market categorization and display
- ✅ Removed plain text fallback (clean embed-only output)





