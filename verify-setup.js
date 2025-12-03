#!/usr/bin/env node
/**
 * Setup Verification Script
 * Run this before starting the bot to check if everything is configured correctly
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const errors = [];
const warnings = [];

console.log('🔍 Verifying Prediction Alert Bot Setup...\n');

// Check if .env exists
if (!fs.existsSync('.env')) {
  errors.push('❌ .env file not found!');
  errors.push('   → Run: Copy-Item .env.example .env');
  errors.push('   → Then fill in your Discord token and channel ID');
} else {
  console.log('✅ .env file exists');
}

// Check required environment variables
const required = {
  DISCORD_TOKEN: 'Discord bot token (get from https://discord.com/developers/applications)',
  DISCORD_ALERT_CHANNEL_ID: 'Discord channel ID (enable Developer Mode, right-click channel → Copy ID)'
};

Object.entries(required).forEach(([key, description]) => {
  const value = process.env[key];
  if (!value || value === `your_${key.toLowerCase().replace(/_/g, '_')}_here` || value.trim() === '') {
    errors.push(`❌ ${key} is not set or is empty`);
    errors.push(`   → ${description}`);
  } else {
    console.log(`✅ ${key} is set`);
  }
});

// Check optional but recommended variables
const optional = {
  DISCORD_CLIENT_ID: 'Client ID (for slash commands - bot works without this)',
  DISCORD_GUILD_ID: 'Guild/Server ID (for slash commands - bot works without this)'
};

Object.entries(optional).forEach(([key, description]) => {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    warnings.push(`⚠️  ${key} is not set`);
    warnings.push(`   → ${description}`);
    warnings.push(`   → Bot will work, but only prefix commands (!scan) will work, not slash commands (/scan)`);
  } else {
    console.log(`✅ ${key} is set`);
  }
});

// Check Node.js version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
if (majorVersion < 18) {
  errors.push(`❌ Node.js version ${nodeVersion} is too old. Bot requires Node.js 18+`);
} else {
  console.log(`✅ Node.js version ${nodeVersion} is compatible (requires 18+)`);
}

// Check if dependencies are installed
if (!fs.existsSync('node_modules')) {
  errors.push('❌ node_modules folder not found');
  errors.push('   → Run: npm install');
} else {
  console.log('✅ Dependencies are installed');
  
  // Check critical dependencies
  const criticalDeps = ['discord.js', 'axios', 'dotenv', 'winston', 'node-cron'];
  const missingDeps = [];
  
  criticalDeps.forEach(dep => {
    const depPath = path.join('node_modules', dep);
    if (!fs.existsSync(depPath)) {
      missingDeps.push(dep);
    }
  });
  
  if (missingDeps.length > 0) {
    errors.push(`❌ Missing dependencies: ${missingDeps.join(', ')}`);
    errors.push('   → Run: npm install');
  } else {
    console.log('✅ All critical dependencies are present');
  }
}

// Check if main file exists
if (!fs.existsSync('index.js')) {
  errors.push('❌ index.js not found!');
} else {
  console.log('✅ index.js found');
}

console.log('\n' + '='.repeat(60) + '\n');

// Report results
if (errors.length === 0 && warnings.length === 0) {
  console.log('🎉 Everything looks good! You can start the bot with:');
  console.log('   npm start\n');
  process.exit(0);
}

if (errors.length > 0) {
  console.log('❌ ERRORS FOUND:\n');
  errors.forEach(error => console.log(error));
  console.log('\n');
}

if (warnings.length > 0) {
  console.log('⚠️  WARNINGS (bot will work but with limitations):\n');
  // Group warnings and show unique ones
  const uniqueWarnings = [...new Set(warnings)];
  uniqueWarnings.forEach(warning => console.log(warning));
  console.log('\n');
}

if (errors.length > 0) {
  console.log('🔧 Fix the errors above, then run this script again:\n   node verify-setup.js\n');
  process.exit(1);
} else {
  console.log('✅ Setup is complete (some optional features are missing)');
  console.log('   You can start the bot with: npm start\n');
  process.exit(0);
}


