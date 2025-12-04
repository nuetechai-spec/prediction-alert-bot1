# Fix: Force Node.js 20 with Dockerfile

## What I Changed

I've created a `Dockerfile` that **explicitly uses Node.js 20** and updated `railway.json` to use Docker instead of Nixpacks. This gives us complete control over the Node version.

## Next Steps

### Option 1: Redeploy (Recommended)

1. **In Railway Dashboard:**
   - Go to your service: `prediction-alert-bot`
   - Click the **"..."** menu (three dots)
   - Select **"Redeploy"**
   - Railway will now build using the Dockerfile (Node 20)

2. **Watch the Build Logs:**
   - Click "Build Logs" tab
   - You should see: `FROM node:20-alpine`
   - And later: `Node.js v20.x.x` (not v18!)

### Option 2: Push to Git (If using Git)

If your Railway service is connected to Git:
1. Commit the new files:
   ```bash
   git add Dockerfile railway.json .dockerignore
   git commit -m "Force Node.js 20 with Dockerfile"
   git push
   ```
2. Railway will automatically redeploy

## Verify It's Fixed

After redeploy, check the **Deploy Logs**:
- ✅ Should see: `Node.js v20.x.x` (NOT v18.x.x)
- ✅ Should see: `Logged in as YourBotName#1234`
- ✅ Should NOT see: `ReferenceError: File is not defined`

## Why This Works

- **Dockerfile** explicitly specifies `FROM node:20-alpine`
- **railway.json** now uses `"builder": "DOCKERFILE"` instead of Nixpacks
- Railway will build the Docker image with Node 20, guaranteed

## If It Still Doesn't Work

1. **Delete the service and recreate it:**
   - Sometimes Railway caches the old build
   - Delete → Create new → Connect to your repo

2. **Check Build Logs:**
   - Make sure you see `FROM node:20-alpine` in the build
   - If you see Nixpacks, Railway might not be using the Dockerfile

3. **Manual Docker Build (for testing):**
   ```bash
   docker build -t prediction-bot .
   docker run prediction-bot
   ```

## Files Created

- ✅ `Dockerfile` - Forces Node.js 20
- ✅ `.dockerignore` - Excludes unnecessary files
- ✅ Updated `railway.json` - Uses Dockerfile builder

