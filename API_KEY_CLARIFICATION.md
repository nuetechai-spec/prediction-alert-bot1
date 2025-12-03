# Polymarket API Key - What You Actually Need

## 🎯 Quick Answer

**You ONLY need an API Key** - that's it!

- ✅ **API Key** - A simple string like `pm_api_abc123...`
- ❌ **NO API Secret** - Not needed
- ❌ **NO Seed Phrase** - Not needed  
- ❌ **NO Private Key** - Not needed
- ❌ **NO Wallet** - Not needed

## 🔍 Why the Confusion?

You might see different authentication methods when researching Polymarket:

1. **API Key (What We Use)** ✅
   - Simple bearer token authentication
   - Used for reading market data
   - This is what the bot uses
   - Just add `POLY_API_KEY=your-key-here` to `.env`

2. **API Secret/Private Key** ❌
   - Used for signing requests (advanced trading APIs)
   - NOT needed for this bot
   - Used for placing trades, not reading data

3. **Seed Phrase/Wallet** ❌
   - Used for blockchain wallet operations
   - NOT needed for this bot
   - Used for interacting with smart contracts

## 📝 What Your .env Should Look Like

**Simple - just one line:**

```env
POLY_API_KEY=your-actual-api-key-string-here
```

**That's it!** No secret, no seed, nothing else.

## ✅ How to Verify

When you get your API key from Polymarket, it should look like:
- `pm_api_1234567890abcdef`
- `pk_live_abc123def456...`
- Or similar format

**If you see:**
- "API Secret" field → You don't need it (ignore it)
- "Private Key" field → You don't need it (ignore it)
- "Seed Phrase" field → You don't need it (ignore it)
- "Wallet Address" → You don't need it (ignore it)

**You ONLY need the API Key!**

## 🔧 How the Bot Uses It

The bot uses simple Bearer token authentication:

```javascript
headers.Authorization = `Bearer ${apiKey}`
```

That's all. No signing, no secrets, no wallet - just a simple API key.

## ❓ Still Confused?

If Polymarket gives you multiple fields, **only copy the "API Key" field** and ignore everything else.

---

**Need help getting the API key?** → See [API_KEY_SETUP.md](./API_KEY_SETUP.md)








