# 🔑 Quick Start: Polymarket API Key Setup

**Need an API key? Follow these simple steps!**

## ⚠️ Important: What You Need

You only need:
- ✅ **API Key** (that's it!)
- ❌ **NO Secret**
- ❌ **NO Seed phrase**
- ❌ **NO Private key**

Just a simple API key string.

## ⚡ Quick Setup (3 Minutes)

### Step 1: Get Your API Key

1. **Create/Login** to [Polymarket.com](https://polymarket.com)
2. **Find API Settings:**
   - Try: https://polymarket.com/settings/api
   - Or: Account Settings → Developer → API Keys
   - Or: Contact support@polymarket.com asking for API key access

3. **Generate Key:**
   - Click "Generate API Key" or "Create New Key"
   - Name it (e.g., "Discord Bot")
   - **Copy the key immediately** (you won't see it again!)

### Step 2: Add to Your Bot

Open your `.env` file and add:

```env
POLY_API_KEY=paste-your-api-key-here
```

**Important:**
- ❌ No spaces around the `=`
- ❌ No quotes needed
- ✅ Just: `POLY_API_KEY=your-actual-key-here`

### Step 3: Restart Bot

```bash
# Stop bot (Ctrl+C)
npm start
```

### Step 4: Verify

Check logs - you should see:
```
✅ Polymarket: Successfully fetched X markets
```

## 📖 Need More Help?

**Full detailed guide:** [API_KEY_SETUP.md](./API_KEY_SETUP.md)

**Common Issues:**
- Can't find API key? → See [API_KEY_SETUP.md](./API_KEY_SETUP.md#troubleshooting)
- Key not working? → Check for extra spaces, restart bot
- Don't have account? → Create free account at polymarket.com first

## ⚠️ Don't Have an API Key?

**That's OK!** The bot works without one, but:
- May encounter rate limits
- Some markets might not be accessible
- Performance may be slower

The bot will still work and find markets!

## 🔐 Security Reminder

- ❌ **NEVER** commit your `.env` file
- ❌ **NEVER** share your API key
- ✅ Keep it private and secure

---

**Ready?** → Open [API_KEY_SETUP.md](./API_KEY_SETUP.md) for the complete guide!

