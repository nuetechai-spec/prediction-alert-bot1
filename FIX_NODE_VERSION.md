# Fix: Node.js Version Error

## The Problem

Your bot is crashing with:
```
ReferenceError: File is not defined
```

This happens because Railway is using **Node.js 18.20.5** but your bot requires **Node.js 20+**.

## The Fix

I've updated your configuration files, but you need to **redeploy** for the changes to take effect.

### Option 1: Force Redeploy (Recommended)

1. **In Railway Dashboard:**
   - Go to your service
   - Click the **"..."** menu (three dots)
   - Select **"Redeploy"**
   - This will rebuild with Node.js 20

### Option 2: Add Environment Variable

1. **In Railway Dashboard:**
   - Go to your service
   - Click **"Variables"** tab
   - Add a new variable:
     - **Name:** `NODE_VERSION`
     - **Value:** `20`
   - Save and redeploy

### Option 3: Manual Redeploy via Git

If you're using Git:
1. Commit the updated files (`.node-version`, `nixpacks.toml`)
2. Push to your repository
3. Railway will automatically redeploy

## Verify It's Fixed

After redeploying, check the logs. You should see:
- ✅ `Node.js v20.x.x` (not v18.x.x)
- ✅ `Logged in as YourBotName#1234`
- ✅ No `ReferenceError: File is not defined` error

## Why This Happened

Railway sometimes auto-detects Node.js version and ignores configuration files. The updated files now explicitly require Node.js 20, which Railway should respect on the next deployment.

## Still Having Issues?

If Railway still uses Node 18 after redeploy:
1. Check Railway → Variables → Make sure `NODE_VERSION=20` is set
2. Try deleting the service and redeploying from scratch
3. Check Railway's build logs to see which Node version it detected

