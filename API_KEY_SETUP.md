# Polymarket API Key Setup Guide

## Why Do You Need an API Key?

An API key improves your bot's access to Polymarket markets:
- ✅ Better rate limits (more requests allowed)
- ✅ Access to current/active markets
- ✅ More reliable data fetching
- ✅ Priority access during high traffic

**Note:** The bot works without an API key, but having one is recommended for best performance.

## 🔑 What You Need: API Key Only (No Secret or Seed Required)

**Important:** For the Polymarket Gamma API used by this bot, you only need:
- ✅ **API Key** (public identifier)
- ❌ **NO API Secret needed**
- ❌ **NO Seed phrase needed**
- ❌ **NO Private key needed**

The bot only uses a simple API key in the Authorization header. You don't need wallet credentials or private keys.

---

## Step-by-Step: Getting Your Polymarket API Key

### Step 1: Create/Login to Your Polymarket Account

1. Go to [https://polymarket.com](https://polymarket.com)
2. Click **"Sign Up"** or **"Login"** in the top right
3. Complete the registration/login process

### Step 2: Access Polymarket Developer Portal

1. After logging in, go to: **https://docs.polymarket.com** or **https://gamma-api.polymarket.com**
2. Look for **"API Keys"** or **"Developer"** section
3. Some users find it under **Account Settings → API** or **Profile → Developer**

### Step 3: Generate Your API Key

1. In the Developer/API section, click **"Generate API Key"** or **"Create New Key"**
2. Give it a name (e.g., "Discord Bot")
3. Copy the API key immediately - you won't be able to see it again!

### Step 4: Add API Key to Your Bot

#### Option A: Using .env File (Recommended)

1. Open the `.env` file in your bot folder
2. Find the line that says:
   ```
   POLY_API_KEY=
   ```
3. Add your API key after the equals sign:
   ```
   POLY_API_KEY=your-api-key-here
   ```
4. Save the file

**Example:**
```env
POLY_API_KEY=pm_api_1234567890abcdef
```

#### Option B: Using Environment Variables (Windows)

1. Open PowerShell as Administrator
2. Set the environment variable:
   ```powershell
   [System.Environment]::SetEnvironmentVariable('POLY_API_KEY', 'your-api-key-here', 'User')
   ```
3. Restart your terminal/command prompt

#### Option C: Using Environment Variables (Linux/Mac)

1. Open your terminal
2. Add to your `.bashrc` or `.zshrc`:
   ```bash
   export POLY_API_KEY="your-api-key-here"
   ```
3. Reload your shell:
   ```bash
   source ~/.bashrc  # or source ~/.zshrc
   ```

### Step 5: Restart Your Bot

After adding the API key:

1. **Stop the bot** (press `Ctrl+C` in the terminal)
2. **Restart the bot**:
   ```bash
   npm start
   ```

### Step 6: Verify It's Working

Check your bot logs. You should see:
```
✅ Polymarket: Successfully fetched X markets
```

Instead of:
```
⚠️  POLYMARKET API ISSUE: No valid markets found...
```

## Troubleshooting

### "I can't find where to get an API key"

**Option 1: Try These URLs Directly**
- https://polymarket.com/settings/api
- https://polymarket.com/account/api-keys
- https://docs.polymarket.com/developers

**Option 2: Contact Polymarket Support**
- Email: support@polymarket.com
- Ask: "How do I get an API key for the Gamma API?"

**Option 3: Use Without API Key**
- The bot works without an API key
- You may encounter rate limits
- Some markets might not be accessible

### "The API key isn't working"

1. **Check for extra spaces:**
   ```env
   POLY_API_KEY=your-key-here  ❌ (extra space)
   POLY_API_KEY=your-key-here   ✅ (no space)
   ```

2. **Remove quotes if you added them:**
   ```env
   POLY_API_KEY="your-key-here"  ❌ (quotes not needed)
   POLY_API_KEY=your-key-here    ✅ (no quotes)
   ```

3. **Verify the key is loaded:**
   - Restart the bot
   - Check logs for any API authentication errors

4. **Test the API key manually:**
   ```bash
   curl -H "Authorization: Bearer YOUR_API_KEY" https://gamma-api.polymarket.com/events?limit=1
   ```

### "I don't have a Polymarket account"

1. Create a free account at [polymarket.com](https://polymarket.com)
2. Complete any required verification
3. Then follow Step 2 above

## Current Configuration

Your bot is currently configured to use:
- **API Endpoint:** `https://gamma-api.polymarket.com/events`
- **API Key Location:** `.env` file (in the bot folder)
- **Variable Name:** `POLY_API_KEY`

## Example .env File

Here's what your complete `.env` file should look like:

```env
# Discord Configuration
DISCORD_TOKEN=your-discord-bot-token
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_GUILD_ID=your-discord-guild-id
DISCORD_ALERT_CHANNEL_ID=your-alert-channel-id
DISCORD_OWNER_ID=your-user-id

# Polymarket API (Optional but recommended)
POLY_API_KEY=your-polymarket-api-key-here

# Kalshi API (Optional)
KALSHI_API_KEY=your-kalshi-api-key
KALSHI_API_SECRET=your-kalshi-api-secret

# Bot Configuration
SCAN_INTERVAL_MINUTES=2
MIN_CONFIDENCE=55
MIN_LIQUIDITY=500
```

## Security Notes

⚠️ **IMPORTANT:**
- ❌ **NEVER** commit your `.env` file to Git
- ❌ **NEVER** share your API key publicly
- ✅ Keep your `.env` file private and secure
- ✅ If your key is compromised, revoke it immediately and create a new one

## Still Having Issues?

1. Check the bot logs for specific error messages
2. Verify your API key is correct (no typos)
3. Make sure you restarted the bot after adding the key
4. Check Polymarket's status: https://status.polymarket.com

## Quick Test

After adding your API key, you can test if it's working:

```bash
# In PowerShell or Command Prompt
$env:POLY_API_KEY="your-key-here"
node -e "require('dotenv').config(); console.log('API Key loaded:', process.env.POLY_API_KEY ? 'Yes' : 'No');"
```

If it says "Yes", your API key is loaded correctly!

