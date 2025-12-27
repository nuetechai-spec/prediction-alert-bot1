'use strict';

/**
 * Prediction market Discord alert bot.
 * Periodically scans Polymarket + Kalshi, scores short-dated markets,
 * and posts curated embeds to a Discord channel.
 *
 * DISCLAIMER: This software distributes informational alerts only.
 * It MUST NOT be used for automated trading or advice.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  REST,
  Routes,
  PermissionsBitField
} = require('discord.js');
const winston = require('winston');

const {
  calculateConfidenceScore,
  bucketMarket,
  formatDuration,
  formatUtc,
  liquidityLabel,
  formatProbability,
  formatCurrency,
  selectColorByConfidence,
  isMarketEligible,
  categorizeMarket,
  selectMarketsWithDiversity,
  safeNumber
} = require('./utils');
const { HealthMonitor } = require('./health');
const { CircuitBreaker } = require('./circuit-breaker');
const { MarketIntelligence } = require('./intelligence');
const { UsageMetrics } = require('./usage-metrics');

const USER_AGENT =
  process.env.USER_AGENT ||
  'PredictionAlertBot/1.0 (+https://github.com/your-handle; contact@example.com)';

const CONFIG_OVERRIDES_PATH =
  process.env.CONFIG_OVERRIDES_PATH ||
  path.join(__dirname, 'config.overrides.json');

// Enhanced logger with file rotation and structured logging
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'prediction-alert-bot' },
  transports: [
    // Console transport with readable format
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(
          ({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
            return `${timestamp} [${level}] ${message}${metaStr}`;
          }
        )
      )
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logDir, 'bot.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    // Separate file for errors only
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    })
  ]
});

const duplicateCache = new Map();
const operationalAlerts = [];
const operationalAlertCache = new Map();
const OP_ALERT_TTL_MS = 30 * 60 * 1000;
const rateLimitState = {
  polymarket: 0,
  kalshi: 0
};

// Error alert system - tracks errors and sends Discord notifications
const errorAlertCache = new Map();
const ERROR_ALERT_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes between same error type
const CRITICAL_ERROR_TYPES = [
  'scan_failed',
  'discord_connection_failed',
  'fatal_error',
  'uncaught_exception',
  'unhandled_rejection'
];

// Enhanced features
const healthMonitor = new HealthMonitor();
const polymarketCircuitBreaker = new CircuitBreaker({ 
  name: 'polymarket', 
  failureThreshold: 5,
  resetTimeout: 60000 
});
const kalshiCircuitBreaker = new CircuitBreaker({ 
  name: 'kalshi', 
  failureThreshold: 3,
  resetTimeout: 300000 // 5 minutes for Kalshi
});
const marketIntelligence = new MarketIntelligence();

// Usage metrics tracker
const usageMetrics = new UsageMetrics({
  dataDir: path.join(__dirname, 'data'),
  costConfig: {
    scan: { costPerQuery: parseFloat(process.env.COST_SCAN || '0.001') },
    config: { costPerQuery: 0 },
    testalert: { costPerQuery: parseFloat(process.env.COST_TESTALERT || '0.0001') },
    stats: { costPerQuery: 0 },
    health: { costPerQuery: 0 },
    trends: { costPerQuery: 0 },
    scheduled_scan: { costPerQuery: parseFloat(process.env.COST_SCAN || '0.001') },
    market_alert: { costPerQuery: parseFloat(process.env.COST_ALERT || '0.0005') },
    api_polymarket: { costPerQuery: parseFloat(process.env.COST_API_POLY || '0.0002') },
    api_kalshi: { costPerQuery: parseFloat(process.env.COST_API_KALSHI || '0.0002') }
  }
});

// Request cache for API responses (5 minute TTL)
const requestCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedAlertChannel = null;

// Periodic cleanup
setInterval(() => {
  cleanupCaches();
  marketIntelligence.cleanup();
}, 15 * 60 * 1000); // Every 15 minutes

function cleanupCaches() {
  const now = Date.now();
  
  // Clean duplicate cache (remove expired entries)
  for (const [key, expiresAt] of duplicateCache.entries()) {
    if (expiresAt < now) {
      duplicateCache.delete(key);
    }
  }
  
  // Clean request cache
  for (const [key, cached] of requestCache.entries()) {
    if (cached.expiresAt < now) {
      requestCache.delete(key);
    }
  }
  
  // Clean operational alerts cache
  for (const [key, expiresAt] of operationalAlertCache.entries()) {
    if (expiresAt < now) {
      operationalAlertCache.delete(key);
    }
  }
  
  logger.debug('Cache cleanup completed', {
    duplicateCacheSize: duplicateCache.size,
    requestCacheSize: requestCache.size,
    alertCacheSize: operationalAlertCache.size
  });
}

function loadOverrides() {
  if (!fs.existsSync(CONFIG_OVERRIDES_PATH)) return {};
  try {
    const raw = fs.readFileSync(CONFIG_OVERRIDES_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    logger.info('Loaded config overrides', { path: CONFIG_OVERRIDES_PATH });
    return parsed;
  } catch (err) {
    logger.warn('Failed to parse config overrides file', {
      path: CONFIG_OVERRIDES_PATH,
      error: err.message
    });
    return {};
  }
}

function loadConfig() {
  const overrides = loadOverrides();
  const scanIntervalMinutes = clampToRange(
    parseInt(process.env.SCAN_INTERVAL_MINUTES || '1', 10),
    1,
    5
  );
  const thresholds = {
    minConfidence: safeNumber(process.env.MIN_CONFIDENCE, 30),
    minLiquidity: safeNumber(process.env.MIN_LIQUIDITY, 500),
    maxMarketAgeMinutes: safeNumber(process.env.MAX_MARKET_AGE_MINUTES, 4 * 24 * 60),
    maxResolutionMs: safeNumber(
      process.env.MAX_RESOLUTION_MS,
      30 * 24 * 60 * 60 * 1000  // Changed from 7 to 30 days to catch more markets
    )
  };
  const duplicateSuppressionMinutes = safeNumber(
    process.env.DUPLICATE_SUPPRESSION_MINUTES,
    60
  );
  
  // Diversity settings - prevents overcrowding by single market type
  const diversity = {
    enabled: process.env.ENABLE_DIVERSITY !== 'false', // Default: true
    maxPerCategory: safeNumber(process.env.MAX_MARKETS_PER_CATEGORY, 3), // Max crypto/politics/etc per scan
    maxTotal: safeNumber(process.env.MAX_MARKETS_PER_SCAN, 10) // Max total markets to alert per scan
  };

  return {
    discord: {
      token: process.env.DISCORD_TOKEN,
      alertChannelId: process.env.DISCORD_ALERT_CHANNEL_ID,
      adminRoleId: process.env.DISCORD_ADMIN_ROLE_ID || null,
      ownerId: process.env.DISCORD_OWNER_ID || null,
      clientId: process.env.DISCORD_CLIENT_ID || null,
      guildId: process.env.DISCORD_GUILD_ID || null
    },
    scanIntervalMinutes,
    duplicateSuppressionMinutes,
    thresholds,
    diversity,
    scoringOverrides: overrides.scoring || {},
    polymarket: {
      apiBase:
        process.env.POLY_API_URL || 'https://gamma-api.polymarket.com/events',
      apiKey: process.env.POLY_API_KEY || null,
      limit: clampToRange(parseInt(process.env.POLY_LIMIT || '1000', 10), 20, 1000)
    },
    kalshi: {
      apiBase:
        process.env.KALSHI_API_URL ||
        'https://trading-api.kalshi.com/v1/markets',
      apiKey: process.env.KALSHI_API_KEY || null,
      apiSecret: process.env.KALSHI_API_SECRET 
        ? process.env.KALSHI_API_SECRET.replace(/^["']|["']$/g, '').trim() // Strip quotes if present
        : null,
      fallbackUrl: 'https://kalshi.com/markets'
    },
    userAgent: USER_AGENT,
    apiTimeoutMs: safeNumber(process.env.API_TIMEOUT_MS, 10000),
    pauseOnRateLimitMs: safeNumber(
      process.env.RATE_LIMIT_PAUSE_MS,
      5 * 60 * 1000
    ),
    logLevel: process.env.LOG_LEVEL || 'info'
  };
}

function clampToRange(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

const config = loadConfig();
logger.level = config.logLevel;

async function main() {
  validateConfig(config);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
  });

  setupClientEvents(client);

  await client.login(config.discord.token);
}

function validateConfig(cfg) {
  if (!cfg.discord.token) {
    throw new Error('DISCORD_TOKEN is required.');
  }
  if (!cfg.discord.alertChannelId) {
    throw new Error('DISCORD_ALERT_CHANNEL_ID is required.');
  }
  if (!cfg.discord.clientId || !cfg.discord.guildId) {
    logger.warn(
      'DISCORD_CLIENT_ID or DISCORD_GUILD_ID missing. Slash commands will not be registered.'
    );
  }
}

function setupClientEvents(client) {
  // Store client reference for error handlers
  discordClient = client;
  
  client.on('ready', async () => {
    logger.info(`Logged in as ${client.user.tag}`);
    client.user.setActivity('prediction markets | Not financial advice');
    
    // Log startup with uptime tracking
    const startTime = healthMonitor.metrics.startTime;
    logger.info('Bot started', { 
      startTime: new Date(startTime).toISOString(),
      botTag: client.user.tag 
    });

    if (config.discord.clientId && config.discord.guildId) {
      await registerSlashCommands().catch((err) =>
        logger.error('Failed to register slash commands', { error: err.message })
      );
    }

    const channel = await resolveChannel(client).catch(err => {
      logger.error('Failed to resolve alert channel', { error: err.message });
      return null;
    });

    if (channel) {
      // Send startup notification (only once, not on every reconnect)
      try {
        await channel.send({
          embeds: [new EmbedBuilder()
            .setTitle('✅ Bot Online')
            .setDescription(`**${client.user.tag}** is now monitoring prediction markets.\n\n` +
              `• Scanning every ${config.scanIntervalMinutes} minute(s)\n` +
              `• Thresholds: Confidence ≥${config.thresholds.minConfidence}, Liquidity ≥$${config.thresholds.minLiquidity}\n` +
              `• Window: Markets resolving within ${Math.round((config.thresholds.maxResolutionMs || 7*24*60*60*1000)/(24*60*60*1000))} days\n\n` +
              `Use \`!scan\` or \`/scan\` to manually trigger a scan.\n` +
              `Use \`!config\` or \`/config\` to see current settings.`)
            .setColor(0x00ff00)
            .setTimestamp()
          ]
        });
      } catch (err) {
        logger.warn('Failed to send startup notification', { error: err.message });
      }
    }

    // Run initial scan with notifications enabled to show results
    await runScan(client, { reason: 'startup', notifyChannel: true });
    scheduleRecurringScan(client);
    
    // Schedule periodic uptime status updates (every 6 hours)
    scheduleUptimeUpdates(client);
  });
  
  // Handle Discord connection errors
  client.on('error', async (error) => {
    logger.error('Discord client error', { error: error.message, stack: error.stack });
    healthMonitor.recordError('discord_client_error', error.message);
    
    await sendErrorAlert(
      client,
      'discord_connection_failed',
      `Discord client error: ${error.message}`,
      { error: error.message }
    ).catch(() => {});
  });
  
  // Handle Discord disconnects
  client.on('disconnect', () => {
    logger.warn('Discord client disconnected');
    healthMonitor.recordError('discord_disconnect', 'Client disconnected');
  });
  
  // Handle Discord reconnects
  client.on('reconnecting', () => {
    logger.info('Discord client reconnecting...');
  });

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;

    const [command] = message.content
      .slice(1)
      .trim()
      .toLowerCase()
      .split(/\s+/);

    if (!['scan', 'config', 'testalert', 'search', 'stats', 'health', 'trends', 'metrics'].includes(command)) return;

    const isAuthorized = checkAuthorization(message.member);
    if (!isAuthorized) {
      await message.reply(
        'You are not authorized to use this command. Contact the bot admin.'
      );
      return;
    }

    if (command === 'scan') {
      const startTime = Date.now();
      try {
        const result = await runScan(message.client, {
          reason: 'manual-command',
          notifyChannel: true,
          commandMessage: message
        });
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('scan', {
          userId: message.author.id,
          success: true,
          responseTime,
          metadata: { 
            considered: result.considered,
            eligible: result.eligible,
            alerted: result.alerted 
          }
        });
        await message.reply(
          `Scan completed. Considered ${result.considered} markets, ${result.eligible} passed filters, ${result.alerted} alerts sent, ${result.suppressed} suppressed by cooldown.`
        );
      } catch (err) {
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('scan', {
          userId: message.author.id,
          success: false,
          error: err,
          responseTime,
          metadata: { error: err.message }
        });
        throw err;
      }
    } else if (command === 'config') {
      const startTime = Date.now();
      try {
        await message.reply(formatConfigSummary());
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('config', {
          userId: message.author.id,
          success: true,
          responseTime
        });
      } catch (err) {
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('config', {
          userId: message.author.id,
          success: false,
          error: err,
          responseTime
        });
        throw err;
      }
    } else if (command === 'testalert') {
      const startTime = Date.now();
      try {
        await sendTestAlert(message.channel);
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('testalert', {
          userId: message.author.id,
          success: true,
          responseTime
        });
      } catch (err) {
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('testalert', {
          userId: message.author.id,
          success: false,
          error: err,
          responseTime
        });
        throw err;
      }
    } else if (command === 'search') {
      const startTime = Date.now();
      try {
        const args = message.content.slice(1).trim().split(/\s+/).slice(1);
        const category = args[0]?.toLowerCase();
        
        if (!category) {
          await message.reply('Please specify a category. Usage: `!search <category>`\nAvailable categories: crypto, politics, weather, tech, economics, breaking, sports, entertainment, other');
          return;
        }
        
        // Normalize category names
        const categoryMap = {
          'crypto': 'crypto',
          'politics': 'politics',
          'weather': 'weather',
          'tech': 'technology',
          'technology': 'technology',
          'econ': 'economics',
          'economics': 'economics',
          'breaking': 'breaking',
          'news': 'breaking',
          'breaking/news': 'breaking',
          'sports': 'sports',
          'entertainment': 'entertainment',
          'other': 'other'
        };
        
        const normalizedCategory = categoryMap[category] || category;
        
        const result = await runSearch(message.client, normalizedCategory, {
          reason: 'manual-command',
          commandMessage: message
        });
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('search', {
          userId: message.author.id,
          success: true,
          responseTime,
          metadata: { 
            category: normalizedCategory,
            found: result.found,
            alerted: result.alerted 
          }
        });
        await message.reply(
          `Search completed for **${normalizedCategory}**. Found ${result.found} markets, sent ${result.alerted} alerts.`
        );
      } catch (err) {
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('search', {
          userId: message.author.id,
          success: false,
          error: err,
          responseTime,
          metadata: { error: err.message }
        });
        await message.reply(`Error searching markets: ${err.message}`);
      }
    } else if (command === 'stats') {
      const startTime = Date.now();
      try {
        await message.reply(formatStatsSummary());
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('stats', {
          userId: message.author.id,
          success: true,
          responseTime
        });
      } catch (err) {
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('stats', {
          userId: message.author.id,
          success: false,
          error: err,
          responseTime
        });
        throw err;
      }
    } else if (command === 'health') {
      const startTime = Date.now();
      try {
        await message.reply(formatHealthStatus());
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('health', {
          userId: message.author.id,
          success: true,
          responseTime
        });
      } catch (err) {
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('health', {
          userId: message.author.id,
          success: false,
          error: err,
          responseTime
        });
        throw err;
      }
    } else if (command === 'trends') {
      const startTime = Date.now();
      try {
        await message.reply('Trends feature coming soon. Use `/stats` to see current market intelligence.');
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('trends', {
          userId: message.author.id,
          success: true,
          responseTime
        });
      } catch (err) {
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('trends', {
          userId: message.author.id,
          success: false,
          error: err,
          responseTime
        });
        throw err;
      }
    } else if (command === 'metrics') {
      const startTime = Date.now();
      try {
        const report = usageMetrics.getMetricsReport('today');
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('metrics', {
          userId: message.author.id,
          success: true,
          responseTime
        });
        await message.reply(formatMetricsReport(report));
      } catch (err) {
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('metrics', {
          userId: message.author.id,
          success: false,
          error: err,
          responseTime
        });
        await message.reply(`Error generating metrics report: ${err.message}`);
      }
    }
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    
    // Wrap in try-catch to prevent "Unknown interaction" errors
    try {
      // Check authorization first
      if (!checkAuthorization(interaction.member)) {
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
              content: 'You are not authorized to use this command. Contact the bot admin.'
            });
          } else {
            await interaction.reply({
              content: 'You are not authorized to use this command. Contact the bot admin.',
              ephemeral: true
            });
          }
        } catch (err) {
          logger.error('Failed to send authorization error', { error: err.message });
        }
        return;
      }

    if (interaction.commandName === 'scan') {
      const startTime = Date.now();
      await interaction.deferReply({ ephemeral: true });
      try {
        const result = await runScan(interaction.client, {
          reason: 'manual-slash',
          notifyChannel: true
        });
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('scan', {
          userId: interaction.user.id,
          success: true,
          responseTime,
          metadata: { 
            considered: result.considered,
            eligible: result.eligible,
            alerted: result.alerted 
          }
        });
        await interaction.editReply(
          `Scan completed. Considered ${result.considered} markets, ${result.eligible} eligible, ${result.alerted} alerts sent, ${result.suppressed} suppressed by cooldown.`
        );
      } catch (err) {
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('scan', {
          userId: interaction.user.id,
          success: false,
          error: err,
          responseTime,
          metadata: { error: err.message }
        });
        throw err;
      }
    }
    if (interaction.commandName === 'config') {
      const startTime = Date.now();
      try {
        await interaction.reply({
          content: formatConfigSummary(),
          ephemeral: true
        });
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('config', {
          userId: interaction.user.id,
          success: true,
          responseTime
        });
      } catch (err) {
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('config', {
          userId: interaction.user.id,
          success: false,
          error: err,
          responseTime
        });
        throw err;
      }
    }
    if (interaction.commandName === 'testalert') {
      const startTime = Date.now();
      await interaction.deferReply({ ephemeral: true });
      try {
        const channel = await resolveChannel(interaction.client);
        await sendTestAlert(channel);
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('testalert', {
          userId: interaction.user.id,
          success: true,
          responseTime
        });
        await interaction.editReply('Sample alert posted to the configured channel.');
      } catch (err) {
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('testalert', {
          userId: interaction.user.id,
          success: false,
          error: err,
          responseTime
        });
        throw err;
      }
    }
    if (interaction.commandName === 'search') {
      const startTime = Date.now();
      let deferred = false;
      
      try {
        // Defer immediately to prevent timeout
        await interaction.deferReply({ ephemeral: true });
        deferred = true;
        
        const category = interaction.options.getString('category')?.toLowerCase();
        
        if (!category) {
          await interaction.editReply('Please specify a category. Available categories: crypto, politics, weather, tech, economics, breaking, sports, entertainment, other');
          return;
        }
        
        // Normalize category names
        const categoryMap = {
          'crypto': 'crypto',
          'politics': 'politics',
          'weather': 'weather',
          'tech': 'technology',
          'technology': 'technology',
          'econ': 'economics',
          'economics': 'economics',
          'breaking': 'breaking',
          'news': 'breaking',
          'breaking/news': 'breaking',
          'sports': 'sports',
          'entertainment': 'entertainment',
          'other': 'other'
        };
        
        const normalizedCategory = categoryMap[category] || category;
        
        // Update reply to show we're searching
        await interaction.editReply(`🔍 Searching for **${normalizedCategory}** markets...`);
        
        const result = await runSearch(interaction.client, normalizedCategory, {
          reason: 'manual-slash',
          notifyChannel: true
        });
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('search', {
          userId: interaction.user.id,
          success: true,
          responseTime,
          metadata: { 
            category: normalizedCategory,
            found: result.found,
            eligible: result.eligible,
            alerted: result.alerted 
          }
        });
        
        let replyMessage = `✅ Search completed for **${normalizedCategory}**\n`;
        replyMessage += `• Found: ${result.found} markets\n`;
        replyMessage += `• Eligible: ${result.eligible} markets\n`;
        replyMessage += `• Alerts sent: ${result.alerted}`;
        if (result.suppressed > 0) {
          replyMessage += `\n• Suppressed: ${result.suppressed} (duplicate cooldown)`;
        }
        
        await interaction.editReply(replyMessage);
      } catch (err) {
        logger.error('Search command error', { 
          error: err.message, 
          stack: err.stack,
          userId: interaction.user.id 
        });
        
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('search', {
          userId: interaction.user.id,
          success: false,
          error: err,
          responseTime,
          metadata: { error: err.message }
        });
        
        try {
          if (deferred) {
            await interaction.editReply(`❌ Error searching markets: ${err.message}\n\nPlease try again or check the bot logs.`);
          } else {
            await interaction.reply({
              content: `❌ Error searching markets: ${err.message}\n\nPlease try again or check the bot logs.`,
              ephemeral: true
            });
          }
        } catch (replyErr) {
          logger.error('Failed to send error reply', { error: replyErr.message });
        }
      }
    }
    if (interaction.commandName === 'stats') {
      const startTime = Date.now();
      try {
        await interaction.reply({
          content: formatStatsSummary(),
          ephemeral: true
        });
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('stats', {
          userId: interaction.user.id,
          success: true,
          responseTime
        });
      } catch (err) {
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('stats', {
          userId: interaction.user.id,
          success: false,
          error: err,
          responseTime
        });
        throw err;
      }
    }
    if (interaction.commandName === 'health') {
      const startTime = Date.now();
      try {
        await interaction.reply({
          content: formatHealthStatus(),
          ephemeral: true
        });
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('health', {
          userId: interaction.user.id,
          success: true,
          responseTime
        });
      } catch (err) {
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('health', {
          userId: interaction.user.id,
          success: false,
          error: err,
          responseTime
        });
        throw err;
      }
    }
    if (interaction.commandName === 'trends') {
      const startTime = Date.now();
      try {
        await interaction.reply({
          content: 'Trends feature coming soon. Use `/stats` to see current market intelligence.',
          ephemeral: true
        });
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('trends', {
          userId: interaction.user.id,
          success: true,
          responseTime
        });
      } catch (err) {
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('trends', {
          userId: interaction.user.id,
          success: false,
          error: err,
          responseTime
        });
        throw err;
      }
    }
    if (interaction.commandName === 'metrics') {
      const startTime = Date.now();
      try {
        await interaction.deferReply({ ephemeral: true });
        const report = usageMetrics.getMetricsReport('today');
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('metrics', {
          userId: interaction.user.id,
          success: true,
          responseTime
        });
        await interaction.editReply(formatMetricsReport(report));
      } catch (err) {
        const responseTime = Date.now() - startTime;
        usageMetrics.recordUsage('metrics', {
          userId: interaction.user.id,
          success: false,
          error: err,
          responseTime
        });
        await interaction.editReply(`Error generating metrics report: ${err.message}`);
      }
    }
    } catch (err) {
      // Global error handler for interactions to prevent "Unknown interaction" errors
      logger.error('Unhandled interaction error', { 
        command: interaction.commandName,
        error: err.message, 
        stack: err.stack,
        userId: interaction.user?.id 
      });
      
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            content: `❌ An error occurred while processing your command: ${err.message}\n\nPlease try again later.`
          });
        } else {
          await interaction.reply({
            content: `❌ An error occurred while processing your command: ${err.message}\n\nPlease try again later.`,
            ephemeral: true
          });
        }
      } catch (replyErr) {
        logger.error('Failed to send error reply to interaction', { 
          originalError: err.message,
          replyError: replyErr.message 
        });
      }
    }
  });
}

async function resolveChannel(client) {
  if (cachedAlertChannel) return cachedAlertChannel;
  cachedAlertChannel = await client.channels
    .fetch(config.discord.alertChannelId)
    .catch((err) => {
      logger.error('Failed to fetch alert channel', { error: err.message });
      return null;
    });
  if (!cachedAlertChannel) {
    throw new Error(
      `Could not resolve channel ${config.discord.alertChannelId}. Verify the bot can access it.`
    );
  }
  return cachedAlertChannel;
}

async function registerSlashCommands() {
  const commands = [
    {
      name: 'scan',
      description: 'Run an immediate market scan'
    },
    {
      name: 'config',
      description: 'Display current alert thresholds'
    },
    {
      name: 'testalert',
      description: 'Send a sample alert embed'
    },
    {
      name: 'search',
      description: 'Search markets by category',
      options: [
        {
          name: 'category',
          type: 3, // STRING
          description: 'Category to search for',
          required: true,
          choices: [
            { name: 'Crypto', value: 'crypto' },
            { name: 'Politics', value: 'politics' },
            { name: 'Weather', value: 'weather' },
            { name: 'Tech', value: 'technology' },
            { name: 'Economics', value: 'economics' },
            { name: 'Breaking News', value: 'breaking' },
            { name: 'Sports', value: 'sports' },
            { name: 'Entertainment', value: 'entertainment' },
            { name: 'Other', value: 'other' }
          ]
        }
      ]
    },
    {
      name: 'stats',
      description: 'Show bot performance statistics and health'
    },
    {
      name: 'health',
      description: 'Check API health and bot status'
    },
    {
      name: 'trends',
      description: 'Show trending markets and patterns'
    },
    {
      name: 'metrics',
      description: 'View usage metrics and analytics for all tools'
    }
  ];

  const rest = new REST({ version: '10' }).setToken(config.discord.token);
  await rest.put(
    Routes.applicationGuildCommands(
      config.discord.clientId,
      config.discord.guildId
    ),
    { body: commands }
  );
  logger.info('Slash commands registered', {
    guildId: config.discord.guildId
  });
}

function scheduleRecurringScan(client) {
  const cronExpression = `*/${config.scanIntervalMinutes} * * * *`;
  cron.schedule(cronExpression, async () => {
    const startTime = Date.now();
    try {
      await runScan(client, { reason: 'scheduled', notifyChannel: true });
      const responseTime = Date.now() - startTime;
      usageMetrics.recordUsage('scheduled_scan', {
        success: true,
        responseTime
      });
    } catch (err) {
      const responseTime = Date.now() - startTime;
      usageMetrics.recordUsage('scheduled_scan', {
        success: false,
        error: err,
        responseTime
      });
    }
  });
  logger.info('Scheduled recurring scans', {
    cron: cronExpression,
    intervalMinutes: config.scanIntervalMinutes
  });
}

/**
 * Schedule periodic uptime status updates
 * Sends status embed to Discord every 6 hours showing bot health and uptime
 */
function scheduleUptimeUpdates(client) {
  // Send status update every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    try {
      const channel = await resolveChannel(client).catch(() => null);
      if (!channel) {
        logger.warn('Cannot send uptime update: channel not available');
        return;
      }
      
      const health = healthMonitor.getHealth();
      const stats = healthMonitor.getStatsSummary();
      const uptimeMs = Date.now() - healthMonitor.metrics.startTime;
      const uptimeDays = Math.floor(uptimeMs / (24 * 60 * 60 * 1000));
      const uptimeHours = Math.floor((uptimeMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const uptimeMinutes = Math.floor((uptimeMs % (60 * 60 * 1000)) / (60 * 1000));
      
      const uptimeStr = uptimeDays > 0 
        ? `${uptimeDays}d ${uptimeHours}h ${uptimeMinutes}m`
        : `${uptimeHours}h ${uptimeMinutes}m`;
      
      const statusEmoji = health.status === 'healthy' ? '✅' : health.status === 'degraded' ? '⚠️' : '❌';
      const statusColor = health.status === 'healthy' ? 0x00ff00 : health.status === 'degraded' ? 0xff8800 : 0xff0000;
      
      const embed = new EmbedBuilder()
        .setTitle(`${statusEmoji} Bot Status Update`)
        .setDescription(`**Uptime:** ${uptimeStr}\n**Status:** ${health.status.toUpperCase()}`)
        .setColor(statusColor)
        .addFields(
          {
            name: '📊 Scans',
            value: `Total: ${stats.scans.total}\nSuccess Rate: ${stats.scans.successRate}\nAvg Duration: ${stats.scans.avgDuration}`,
            inline: true
          },
          {
            name: '📈 Markets',
            value: `Processed: ${stats.markets.processed}\nAlerts Sent: ${stats.markets.alerts}`,
            inline: true
          },
          {
            name: '🔌 API Health',
            value: `Polymarket: ${stats.apiHealth.polymarket.status}\nKalshi: ${stats.apiHealth.kalshi.status}`,
            inline: true
          },
          {
            name: '❌ Errors',
            value: `Total: ${stats.errors.total}`,
            inline: true
          }
        )
        .setFooter({ text: 'Automated status update • Next update in 6 hours' })
        .setTimestamp();
      
      await channel.send({ embeds: [embed] });
      logger.info('Uptime status update sent', { uptime: uptimeStr, status: health.status });
    } catch (err) {
      logger.error('Failed to send uptime status update', { error: err.message });
    }
  });
  
  logger.info('Scheduled periodic uptime status updates (every 6 hours)');
}

async function runScan(client, options = {}) {
  const { reason, notifyChannel = true, commandMessage } = options;
  const now = Date.now();
  const scanStartTime = Date.now();

  logger.info(`🔄 Starting market scan: ${reason}`);
  
  try {
    const markets = await fetchAllMarkets();
    logger.info(`📦 Total markets collected: ${markets.length}${markets.length > 0 ? ' - Processing...' : ' - No markets to process'}`);
    const stats = {
      considered: markets.length,
      eligible: 0,
      alerted: 0,
      suppressed: 0
    };

    const channel = notifyChannel ? await resolveChannel(client) : null;

  // Only show operational alerts for non-rate-limit issues to prevent spam
  const opsAlerts = drainOperationalAlerts();
  if (channel && opsAlerts.length) {
    // Filter out ALL rate limit related alerts (they're normal and handled automatically)
    const importantAlerts = opsAlerts.filter(alert => {
      const msg = alert.message.toLowerCase();
      const src = alert.source.toLowerCase();
      return !src.includes('rate-limit') && 
             !src.includes('kalshi-fallback') && // Don't send Kalshi fallback errors (usually rate limits)
             !msg.includes('rate limited') &&
             !msg.includes('429') &&
             !msg.includes('503') &&
             !msg.includes('too many requests') &&
             !msg.includes('request failed with status code 429') &&
             !msg.includes('request failed with status code 503');
    });
    
    // Only send truly important alerts (not rate limits)
    for (const alert of importantAlerts) {
      await channel.send(
        `[Operational Alert] ${alert.message} (logged ${alert.timestamp}). Admin review recommended.`
      );
    }
    
    // Log rate limit alerts but don't spam Discord - these are normal
    const rateLimitAlerts = opsAlerts.filter(alert => {
      const msg = alert.message.toLowerCase();
      const src = alert.source.toLowerCase();
      return src.includes('rate-limit') || 
             src.includes('kalshi-fallback') ||
             msg.includes('rate limited') ||
             msg.includes('429') ||
             msg.includes('503') ||
             msg.includes('too many requests') ||
             msg.includes('request failed with status code 429') ||
             msg.includes('request failed with status code 503');
    });
    if (rateLimitAlerts.length > 0) {
      logger.debug(`Suppressed ${rateLimitAlerts.length} rate limit alerts from Discord (normal behavior without API keys).`);
    }
  }

    // Process markets with intelligence layer
    const marketsWithIntelligence = [];
    for (const market of markets) {
      // Get market intelligence (trend, anomalies, urgency)
      const insights = marketIntelligence.getInsights(market);
      market.intelligence = insights;
      
      const scoreResult = calculateConfidenceScore(
        market,
        config.scoringOverrides
      );
      market.confidence = scoreResult.total;
      market.scoreBreakdown = scoreResult.breakdown;
      market.explanations = scoreResult.explanations;
      market.bucket = bucketMarket(market.timeToResolveMs);
      market.urgency = insights.urgency;

      // Record market for health monitoring
      healthMonitor.recordMarket(market.source, market.bucket);

      if (!isMarketEligible(market, config.thresholds)) {
        // Log why market was filtered (only for first few to avoid spam)
        if (stats.eligible < 5) {
          const reasons = [];
          if (safeNumber(market.confidence) < config.thresholds.minConfidence) {
            reasons.push(`confidence ${market.confidence} < ${config.thresholds.minConfidence}`);
          }
          if (safeNumber(market.liquidity) < config.thresholds.minLiquidity) {
            reasons.push(`liquidity $${market.liquidity} < $${config.thresholds.minLiquidity}`);
          }
          if (market.timeToResolveMs > config.thresholds.maxResolutionMs) {
            reasons.push(`resolution ${Math.round(market.timeToResolveMs / (24*60*60*1000))}d > ${Math.round(config.thresholds.maxResolutionMs / (24*60*60*1000))}d`);
          }
          if (!market.bucket) {
            reasons.push('no bucket assigned');
          }
          logger.debug(`Market ${market.marketId} not eligible: ${reasons.join(', ')}`, {
            confidence: market.confidence,
            liquidity: market.liquidity,
            bucket: market.bucket,
            timeToResolve: Math.round(market.timeToResolveMs / (60*60*1000)) + 'h'
          });
        }
        continue;
      }
      stats.eligible += 1;
      marketsWithIntelligence.push(market);
    }

    // Add category to each market for diversity tracking
    marketsWithIntelligence.forEach(market => {
      market.category = categorizeMarket(market);
    });

    // Apply diversity selection if enabled, otherwise use simple sort
    let marketsToAlert = [];
    
    // Log category breakdown before filtering
    const categoryBreakdown = {};
    marketsWithIntelligence.forEach(m => {
      const cat = m.category || 'other';
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;
    });
    logger.info(`Market categories: ${Object.entries(categoryBreakdown).map(([cat, count]) => `${cat}: ${count}`).join(', ')}`);
    
    if (config.diversity.enabled && marketsWithIntelligence.length > config.diversity.maxPerCategory) {
      // Use diversity selection to ensure variety - prevents crypto overcrowding
      marketsToAlert = selectMarketsWithDiversity(
        marketsWithIntelligence,
        config.diversity.maxPerCategory,
        config.diversity.maxTotal
      );
      
      // Log diversity results
      const selectedCategories = {};
      marketsToAlert.forEach(m => {
        const cat = m.category || 'other';
        selectedCategories[cat] = (selectedCategories[cat] || 0) + 1;
      });
      logger.info(`✅ Diversity filter applied: ${marketsWithIntelligence.length} eligible → ${marketsToAlert.length} selected (max ${config.diversity.maxPerCategory} per category). Selected: ${Object.entries(selectedCategories).map(([cat, count]) => `${cat}: ${count}`).join(', ')}`);
    } else {
      // Sort by urgency + confidence (highest first) - fallback when diversity disabled or few markets
      marketsWithIntelligence.sort((a, b) => {
        const scoreA = (a.urgency || 0) + a.confidence;
        const scoreB = (b.urgency || 0) + b.confidence;
        return scoreB - scoreA;
      });
      marketsToAlert = marketsWithIntelligence.slice(0, config.diversity.maxTotal);
      logger.info(`No diversity filter (disabled or too few markets): selected top ${marketsToAlert.length} markets`);
    }

    for (const market of marketsToAlert) {
      const cacheKey = `${market.source}:${market.marketId}`;
      const cooldownMs = config.duplicateSuppressionMinutes * 60 * 1000;
      const cachedUntil = duplicateCache.get(cacheKey);
      if (cachedUntil && cachedUntil > now) {
        stats.suppressed += 1;
        continue;
      }

      if (!channel) continue;
      
      try {
        await sendMarketAlert(channel, market, {
          triggeredBy: reason || 'manual',
          commandMessage
        });
        duplicateCache.set(cacheKey, now + cooldownMs);
        stats.alerted += 1;
        healthMonitor.recordAlert(market.source);
      } catch (err) {
        logger.error('Failed to send market alert', { 
          marketId: market.marketId, 
          error: err.message,
          stack: err.stack 
        });
        healthMonitor.recordError('alert_send_failed', err.message);
        
        // Send error alert for repeated alert send failures
        const errorCount = healthMonitor.metrics.errors.byType['alert_send_failed'] || 0;
        if (errorCount > 0 && errorCount % 5 === 0) {
          // Alert every 5 failures to avoid spam
          await sendErrorAlert(
            client,
            'alert_send_failed',
            `Failed to send ${errorCount} market alerts. Last error: ${err.message}`,
            { marketId: market.marketId }
          ).catch(() => {});
        }
      }
    }

    const scanDuration = Date.now() - scanStartTime;
    healthMonitor.recordScan(scanDuration, true, stats);
    
    logger.info(
      `✅ Scan completed: ${stats.considered} considered, ${stats.eligible} eligible, ` +
      `${stats.alerted} alerts sent, ${stats.suppressed} suppressed (${(scanDuration / 1000).toFixed(2)}s)`
    );
    
    // Send diagnostic message if no alerts were sent but markets were found
    if (channel && stats.considered > 0 && stats.alerted === 0 && stats.eligible === 0) {
      logger.warn('No eligible markets found', {
        considered: stats.considered,
        thresholds: {
          minConfidence: config.thresholds.minConfidence,
          minLiquidity: config.thresholds.minLiquidity,
          maxResolutionDays: Math.round(config.thresholds.maxResolutionMs / (24 * 60 * 60 * 1000))
        }
      });
      
      // Send diagnostic message to Discord
      try {
        await channel.send({
          embeds: [new EmbedBuilder()
            .setTitle('⚠️ Scan Completed - No Alerts')
            .setDescription(
              `**Scan Results:**\n` +
              `• Markets Considered: ${stats.considered}\n` +
              `• Eligible Markets: ${stats.eligible}\n` +
              `• Alerts Sent: ${stats.alerted}\n\n` +
              `**Current Thresholds:**\n` +
              `• Min Confidence: ${config.thresholds.minConfidence}\n` +
              `• Min Liquidity: $${config.thresholds.minLiquidity}\n` +
              `• Max Resolution: ${Math.round(config.thresholds.maxResolutionMs / (24 * 60 * 60 * 1000))} days\n\n` +
              `_No markets met the current thresholds. Try lowering thresholds or check API connectivity._`
            )
            .setColor(0xff8800)
            .setTimestamp()
          ]
        });
      } catch (err) {
        logger.error('Failed to send diagnostic message', { error: err.message });
      }
    } else if (channel && stats.considered > 0 && stats.eligible > 0 && stats.alerted === 0) {
      // Markets were eligible but all suppressed
      logger.info('All eligible markets were suppressed by duplicate cache');
    } else if (channel && stats.considered === 0) {
      // No markets fetched at all
      logger.warn('No markets fetched from APIs - check API connectivity');
      try {
        await channel.send({
          embeds: [new EmbedBuilder()
            .setTitle('⚠️ Scan Issue - No Markets Fetched')
            .setDescription(
              `**Scan Results:**\n` +
              `• Markets Considered: ${stats.considered}\n` +
              `• Alerts Sent: ${stats.alerted}\n\n` +
              `_No markets were fetched from Polymarket or Kalshi APIs. This could indicate:\n` +
              `• API rate limiting (normal without API keys)\n` +
              `• API connectivity issues\n` +
              `• No markets available matching criteria_\n\n` +
              `Check logs for more details.`
            )
            .setColor(0xff0000)
            .setTimestamp()
          ]
        });
      } catch (err) {
        logger.error('Failed to send diagnostic message', { error: err.message });
      }
    }
    
    return stats;
  } catch (err) {
    const scanDuration = Date.now() - scanStartTime;
    healthMonitor.recordScan(scanDuration, false);
    healthMonitor.recordError('scan_failed', err.message);
    logger.error('Scan failed', { reason, error: err.message, stack: err.stack });
    
    // Send error alert for scan failures
    if (client) {
      await sendErrorAlert(
        client,
        'scan_failed',
        `Market scan failed: ${err.message}`,
        { reason, scanDuration }
      ).catch(() => {}); // Don't throw if alert fails
    }
    
    throw err;
  }
}

/**
 * Search markets by category
 */
async function runSearch(client, category, options = {}) {
  const { reason, notifyChannel = true, commandMessage } = options;
  const now = Date.now();
  const searchStartTime = Date.now();

  logger.info(`🔍 Starting category search: ${category} (${reason})`);
  
  try {
    const markets = await fetchAllMarkets();
    logger.info(`📦 Total markets collected: ${markets.length}`);
    
    const stats = {
      found: 0,
      eligible: 0,
      alerted: 0,
      suppressed: 0
    };

    const channel = notifyChannel ? await resolveChannel(client) : null;

    // Filter markets by category
    const categoryMarkets = [];
    for (const market of markets) {
      // Get market intelligence
      const insights = marketIntelligence.getInsights(market);
      market.intelligence = insights;
      
      const scoreResult = calculateConfidenceScore(
        market,
        config.scoringOverrides
      );
      market.confidence = scoreResult.total;
      market.scoreBreakdown = scoreResult.breakdown;
      market.explanations = scoreResult.explanations;
      market.bucket = bucketMarket(market.timeToResolveMs);
      market.urgency = insights.urgency;
      market.category = categorizeMarket(market);

      // Check if market matches category
      if (market.category === category) {
        stats.found += 1;
        
        if (isMarketEligible(market, config.thresholds)) {
          stats.eligible += 1;
          categoryMarkets.push(market);
        }
      }
    }

    // Sort by urgency + confidence (highest first)
    categoryMarkets.sort((a, b) => {
      const scoreA = (a.urgency || 0) + a.confidence;
      const scoreB = (b.urgency || 0) + b.confidence;
      return scoreB - scoreA;
    });

    // Limit to top 10 markets
    const marketsToAlert = categoryMarkets.slice(0, 10);

    for (const market of marketsToAlert) {
      const cacheKey = `${market.source}:${market.marketId}`;
      const cooldownMs = config.duplicateSuppressionMinutes * 60 * 1000;
      const cachedUntil = duplicateCache.get(cacheKey);
      if (cachedUntil && cachedUntil > now) {
        stats.suppressed += 1;
        continue;
      }

      if (!channel) {
        logger.warn('No channel available for search alerts');
        continue;
      }
      
      try {
        await sendMarketAlert(channel, market, {
          triggeredBy: reason || 'search',
          commandMessage
        });
        duplicateCache.set(cacheKey, now + cooldownMs);
        stats.alerted += 1;
        healthMonitor.recordAlert(market.source);
      } catch (err) {
        logger.error('Failed to send market alert', { 
          marketId: market.marketId, 
          error: err.message,
          stack: err.stack
        });
        healthMonitor.recordError('alert_send_failed', err.message);
      }
    }

    // If no markets found or no alerts sent, post a message to the channel
    if (channel && stats.found === 0) {
      try {
        await channel.send({
          embeds: [new EmbedBuilder()
            .setTitle(`🔍 Search Results: ${category}`)
            .setDescription(
              `**No markets found** in the **${category}** category.\n\n` +
              `This could mean:\n` +
              `• No markets currently match this category\n` +
              `• Markets may be in different categories\n` +
              `• Try a different category or run \`/scan\` to see all markets`
            )
            .setColor(0xff8800)
            .setTimestamp()
          ]
        });
      } catch (err) {
        logger.error('Failed to send no results message', { error: err.message });
      }
    } else if (channel && stats.found > 0 && stats.alerted === 0) {
      // Found markets but none were eligible or all were suppressed
      try {
        await channel.send({
          embeds: [new EmbedBuilder()
            .setTitle(`🔍 Search Results: ${category}`)
            .setDescription(
              `**Found ${stats.found} markets** in the **${category}** category, but:\n\n` +
              `• **${stats.eligible}** passed eligibility filters\n` +
              `• **${stats.alerted}** alerts sent\n` +
              `• **${stats.suppressed}** suppressed (duplicate cooldown)\n\n` +
              `_Markets may not meet current thresholds or were recently alerted._`
            )
            .setColor(0xff8800)
            .setTimestamp()
          ]
        });
      } catch (err) {
        logger.error('Failed to send search results message', { error: err.message });
      }
    }

    const searchDuration = Date.now() - searchStartTime;
    
    logger.info(
      `✅ Search completed: ${stats.found} found, ${stats.eligible} eligible, ` +
      `${stats.alerted} alerts sent, ${stats.suppressed} suppressed (${(searchDuration / 1000).toFixed(2)}s)`
    );
    
    return stats;
  } catch (err) {
    const searchDuration = Date.now() - searchStartTime;
    healthMonitor.recordError('search_failed', err.message);
    logger.error('Search failed', { category, reason, error: err.message, stack: err.stack });
    throw err;
  }
}

/**
 * Fetches markets from both Polymarket and Kalshi sources
 * Both sources are processed and combined into a single array
 * Kalshi markets are included in all outputs alongside Polymarket markets
 */
async function fetchAllMarkets() {
  const results = await Promise.allSettled([
    fetchPolymarketMarkets(),
    fetchKalshiMarkets()  // Kalshi markets are included in all outputs
  ]);

  const markets = [];
  const fetchErrors = [];
  
  results.forEach((result, idx) => {
    const source = idx === 0 ? 'polymarket' : 'kalshi';
    if (result.status === 'fulfilled') {
      const count = result.value?.length || 0;
      if (count > 0) {
        logger.info(`✅ ${source.charAt(0).toUpperCase() + source.slice(1)}: Successfully fetched ${count} markets`);
      } else {
        logger.warn(`⚠️  ${source.charAt(0).toUpperCase() + source.slice(1)}: No markets returned`);
        fetchErrors.push(`${source}: No markets returned (may be rate limited or API issue)`);
      }
      if (Array.isArray(result.value)) {
        markets.push(...result.value);
      }
    } else {
      const errorMsg = result.reason?.message || 'unknown error';
      logger.error(`❌ ${source.charAt(0).toUpperCase() + source.slice(1)}: Market fetch failed`, {
        error: errorMsg,
        stack: result.reason?.stack
      });
      fetchErrors.push(`${source}: ${errorMsg}`);
    }
  });

  if (markets.length > 0) {
    const sources = {};
    markets.forEach(m => {
      if (m && m.source) {
        sources[m.source] = (sources[m.source] || 0) + 1;
      }
    });
    const sourceBreakdown = Object.entries(sources).map(([source, count]) => `${source}: ${count}`).join(', ');
    logger.info(`📊 Total markets collected: ${markets.length} (${sourceBreakdown})`);
  } else {
    logger.warn(`⚠️  No markets collected from any source`);
    if (fetchErrors.length > 0) {
      logger.warn(`Fetch errors: ${fetchErrors.join('; ')}`);
    }
  }
  
  // Filter out null/undefined markets
  const validMarkets = markets.filter(m => m != null);
  
  // Sort by priority first (accepting orders markets), then by time to resolve
  return validMarkets.sort((a, b) => {
    const priorityDiff = (b._priority || 0) - (a._priority || 0);
    if (priorityDiff !== 0) return priorityDiff;
    return a.timeToResolveMs - b.timeToResolveMs;
  });
}

async function fetchPolymarketMarkets() {
  const now = Date.now();
  if (now < rateLimitState.polymarket) {
    logger.warn('Skipping Polymarket fetch due to cooldown');
    return [];
  }

  // Try multiple pages to find current markets - remove status=open as it seems to cause issues
  const maxPages = 5; // Check up to 5 pages (5000 markets)
  const marketsPerPage = 1000;
  const headers = {
    'User-Agent': config.userAgent,
    Accept: 'application/json'
  };
  if (config.polymarket.apiKey) {
    headers.Authorization = `Bearer ${config.polymarket.apiKey}`;
  }

  // Check cache first
  const cacheKey = `polymarket:all-pages`;
  const cached = requestCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    logger.debug('Using cached Polymarket response');
    healthMonitor.recordApiCall('polymarket', true, 0, false);
    usageMetrics.recordUsage('api_polymarket', {
      success: true,
      responseTime: 0,
      metadata: { cached: true, marketsFetched: cached.data?.length || 0 }
    });
    return cached.data;
  }

  const startTime = Date.now();
  try {
    logger.info(`Fetching Polymarket markets from: ${config.polymarket.apiBase}`);
    const allMarkets = [];
    
    // Try fetching multiple pages to find current markets
    // Use Gamma API with closed=false to get only active markets
    for (let page = 0; page < maxPages; page++) {
      const offset = page * marketsPerPage;
      // Gamma API: order by id descending, filter closed=false for active markets
      const url = `${config.polymarket.apiBase}?order=id&ascending=false&closed=false&limit=${marketsPerPage}&offset=${offset}`;
      logger.debug(`Fetching page ${page + 1}/${maxPages} from Polymarket API`);
      
      try {
        const response = await fetchWithRetry(() =>
          axios.get(url, {
            headers,
            timeout: config.apiTimeoutMs
          })
        );
        
        const payload = response.data;
        // Gamma API returns an array directly, not wrapped in data property
        const pageMarkets = Array.isArray(payload) 
          ? payload 
          : (payload?.data || payload?.events || payload?.markets || payload?.results || []);
        
        if (!Array.isArray(pageMarkets) || pageMarkets.length === 0) {
          logger.debug(`No markets returned from page ${page + 1}, stopping pagination`);
          break;
        }
        
        allMarkets.push(...pageMarkets);
        logger.info(`Page ${page + 1}: Fetched ${pageMarkets.length} markets (total so far: ${allMarkets.length})`);
        
        // Check how many valid markets we have so far
        const validSoFar = allMarkets
          .map(mapPolymarketMarket)
          .filter(Boolean)
          .filter(m => 
            m && 
            Number.isFinite(m.timeToResolveMs) && 
            m.timeToResolveMs > 0 && 
            m.timeToResolveMs <= config.thresholds.maxResolutionMs
          );
        
        if (validSoFar.length > 0 && page === 0) {
          logger.info(`✅ Found ${validSoFar.length} valid markets on first page!`);
        }
        
        // If we got less than the limit, we've reached the end
        if (pageMarkets.length < marketsPerPage) {
          logger.info(`Reached end of results at page ${page + 1}`);
          break;
        }
        
        // If we already have enough valid markets, we can stop early
        if (validSoFar.length >= 100) {
          logger.info(`✅ Found ${validSoFar.length} valid markets, stopping early (enough found)`);
          break;
        }
        
        // Small delay between requests to be respectful
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        const status = err.response?.status;
        const isRateLimited = status === 429 || status === 503;
        logger.warn(
          `⚠️  Failed to fetch page ${page + 1} from Polymarket API: ${err.message}` +
          (status ? ` (HTTP ${status})` : '') +
          (isRateLimited ? ' - Rate limited, stopping pagination' : ' - Continuing with other pages')
        );
        // Continue with other pages even if one fails
        if (isRateLimited) {
          break;
        }
      }
    }
    
    if (allMarkets.length === 0) {
      throw new Error(`No markets returned from Polymarket API at ${config.polymarket.apiBase}`);
    }
    
    const duration = Date.now() - startTime;
    healthMonitor.recordApiCall('polymarket', true, duration, false);
    usageMetrics.recordUsage('api_polymarket', {
      success: true,
      responseTime: duration,
      metadata: { marketsFetched: allMarkets.length }
    });
    logger.info(`✅ Polymarket API: Fetched ${allMarkets.length} total raw markets from ${allMarkets.length / marketsPerPage} pages in ${(duration / 1000).toFixed(2)}s`);
    
    // Map all markets first (filtering will happen based on dates)
    const mapped = allMarkets
      .map(mapPolymarketMarket)
      .filter(Boolean)
      .filter(
        (market) =>
          market &&
          Number.isFinite(market.timeToResolveMs) &&
          market.timeToResolveMs > 0 && // Must be in the future (not expired)
          market.timeToResolveMs <= config.thresholds.maxResolutionMs
      );
    
    if (mapped.length === 0 && allMarkets.length > 0) {
      // Log detailed analysis
      const maxDays = Math.round(config.thresholds.maxResolutionMs / (24*60*60*1000));
      let expiredCount = 0;
      let tooFarCount = 0;
      let noDateCount = 0;
      let validDateCount = 0;
      
      allMarkets.slice(0, 100).forEach(m => {
        // Check both Gamma API (endDate) and CLOB API (end_date_iso) formats
        const endDate = m.endDate || m.end_date_iso || m.closeTime || m.expiresAt;
        if (endDate) {
          const endTime = new Date(endDate).getTime();
          const timeMs = endTime - Date.now();
          if (timeMs <= 0) {
            expiredCount++;
          } else if (timeMs > config.thresholds.maxResolutionMs) {
            tooFarCount++;
          } else {
            validDateCount++;
          }
        } else {
          noDateCount++;
        }
      });
      
      logger.warn(
        `⚠️  POLYMARKET API ISSUE: No valid markets found after checking ${allMarkets.length} markets.\n` +
        `   📊 Analysis of first 100 markets:\n` +
        `      • ${expiredCount} expired (in the past)\n` +
        `      • ${tooFarCount} too far out (>${maxDays} days away)\n` +
        `      • ${noDateCount} missing end dates\n` +
        `      • ${validDateCount} have valid dates but failed other filters\n` +
        `   🔍 API Endpoint: ${config.polymarket.apiBase}\n` +
        `   💡 This usually means the API is returning old/expired markets. Trying fallback scraping...`
      );
      
      // Try scraping as fallback if API returned no valid markets
      try {
        const scrapedMarkets = await scrapePolymarketMarkets();
        if (scrapedMarkets.length > 0) {
          logger.info(`Fallback scraping found ${scrapedMarkets.length} markets`);
          const validScraped = scrapedMarkets.filter(m => 
            m && 
            Number.isFinite(m.timeToResolveMs) && 
            m.timeToResolveMs > 0 && 
            m.timeToResolveMs <= config.thresholds.maxResolutionMs
          );
          if (validScraped.length > 0) {
            logger.info(`Using ${validScraped.length} valid markets from scraping fallback`);
            requestCache.set(cacheKey, {
              data: validScraped,
              expiresAt: now + CACHE_TTL_MS
            });
            return validScraped;
          }
        }
      } catch (scrapeErr) {
        logger.debug('Fallback scraping also failed', { error: scrapeErr.message });
      }
    } else {
      const maxDays = Math.round(config.thresholds.maxResolutionMs / (24*60*60*1000));
      logger.info(
        `✅ Polymarket: Successfully mapped ${mapped.length} valid markets ` +
        `(from ${allMarkets.length} raw markets, resolving within ${maxDays} days)`
      );
    }
    
    // Cache the response
    requestCache.set(cacheKey, {
      data: mapped,
      expiresAt: now + CACHE_TTL_MS
    });
    
    return mapped;
  } catch (err) {
    const duration = Date.now() - (startTime || Date.now());
    const status = err.response?.status;
    const isRateLimited = status === 429 || status === 503;
    
    healthMonitor.recordApiCall('polymarket', false, duration, isRateLimited);
    usageMetrics.recordUsage('api_polymarket', {
      success: false,
      error: err,
      responseTime: duration,
      metadata: { status, isRateLimited }
    });
    
    if (isRateLimited) {
      logger.warn('Polymarket rate limited', { status });
      rateLimitState.polymarket = Date.now() + config.pauseOnRateLimitMs;
      // Don't register operational alert for rate limits - they're normal
      return [];
    }
    
    // Only register operational alerts for non-rate-limit errors
    healthMonitor.recordError('polymarket_api_failed', err.message);
    logger.warn('Polymarket API failed, attempting fallback scrape', {
      error: err.message,
      status
    });
    
    // Only register alert if it's not a rate limit
    if (!isRateLimited) {
      registerOperationalAlert(
        'polymarket-api',
        `Polymarket API request failed (${err.message}). Fallback scrape engaged.`
      );
    }
    
    try {
      const fallbackResults = await scrapePolymarketMarkets();
      if (!fallbackResults.length && !isRateLimited) {
        registerOperationalAlert(
          'polymarket-fallback',
          'Polymarket fallback scraping returned no markets. Check connectivity or schema changes.'
        );
      }
      return fallbackResults;
    } catch (fallbackErr) {
      logger.error('Polymarket fallback also failed', { error: fallbackErr.message });
      // Don't register alert for fallback failures if it's rate limiting
      const fallbackIsRateLimited = fallbackErr.response?.status === 429 || 
                                    fallbackErr.response?.status === 503 ||
                                    fallbackErr.message?.includes('429') ||
                                    fallbackErr.message?.includes('503');
      if (!fallbackIsRateLimited) {
        registerOperationalAlert(
          'polymarket-fallback',
          `Polymarket fallback scraping failed: ${fallbackErr.message}`
        );
      }
      return [];
    }
  }
}

function mapPolymarketMarket(raw) {
  try {
    // Skip archived markets (but allow closed ones - API sometimes returns closed markets even with status=open)
    // We'll filter by date instead which is more reliable
    if (raw.archived) {
      return null;
    }
    
    // Prefer markets that are accepting orders (more likely to be active)
    // But don't skip others as the API might not always have this set correctly
    const isAcceptingOrders = raw.accepting_orders === true;
    
    // Handle different Polymarket API response formats
    // Gamma API uses: id, title, slug, endDate
    // CLOB API uses: question, end_date_iso, market_slug
    const marketId = raw.id || raw.market_id || raw.condition_id || raw.question_id || raw.slug || raw.market_slug;
    const title = raw.title || raw.question || raw.ticker || 'Untitled market';
    const marketSlug = raw.slug || raw.market_slug;
    const permalink =
      raw.url ||
      (marketSlug
        ? `https://polymarket.com/market/${marketSlug}`
        : marketId
        ? `https://polymarket.com/market/${marketId}`
        : 'https://polymarket.com/markets');

    // Handle multiple possible date field names
    // Gamma API uses: endDate
    // CLOB API uses: end_date_iso
    // Also check tokens array for expiration dates
    let closesAt =
      raw.endDate ||        // Gamma API format (priority)
      raw.end_date_iso ||   // CLOB API format
      raw.closeTime ||
      raw.expiresAt ||
      raw.closing_time ||
      raw.end_date ||
      raw.game_start_time;  // Sometimes markets use game_start_time
    
    // If no direct date field, check tokens array for expiration
    if (!closesAt && raw.tokens && Array.isArray(raw.tokens) && raw.tokens.length > 0) {
      const tokenWithDate = raw.tokens.find(t => t.expiration_date || t.expirationDate || t.expiresAt);
      if (tokenWithDate) {
        closesAt = tokenWithDate.expiration_date || tokenWithDate.expirationDate || tokenWithDate.expiresAt;
      }
    }
    
    if (!closesAt) {
      return null; // Skip markets without end dates
    }
    
    const resolvesAt = new Date(closesAt).toISOString();
    const endTime = new Date(resolvesAt).getTime();
    const now = Date.now();
    const timeToResolveMs = endTime - now;
    
    // Skip expired markets (in the past)
    if (timeToResolveMs <= 0) {
      return null;
    }

    const bestBid = safeNumber(raw.bestBid ?? raw.yesBid ?? raw.yes?.bid);
    const bestAsk = safeNumber(raw.bestAsk ?? raw.yesAsk ?? raw.yes?.ask);
    const spread =
      bestBid > 0 && bestAsk > 0 ? Math.max(bestAsk - bestBid, 0) : 0.15;

    const lastPrice = safeNumber(
      raw.lastPrice ?? raw.yesPrice ?? raw.price ?? raw.midPrice,
      bestBid && bestAsk ? (bestBid + bestAsk) / 2 : 0
    );

    const volume24h = safeNumber(
      raw.volume24h ??
        raw.volume_24h ??
        raw.totalVolume24h ??
        raw.lastDayVolume
    );
    const liquidity = safeNumber(
      raw.liquidity ??
        raw.bestBidSize ??
        raw.orderbook?.total_yes ??
        raw.yes?.liquidity
    );
    const change1h = safeNumber(raw.change1h ?? raw.change?.h1 ?? raw.delta1h);
    const change24h = safeNumber(
      raw.change24h ?? raw.change?.h24 ?? raw.delta24h
    );

    // Extract image URL from various possible fields in raw data
    let imageUrl = 
      raw.imageUrl || 
      raw.image_url || 
      raw.image || 
      raw.thumbnail || 
      raw.thumbnailUrl || 
      raw.thumbnail_url ||
      raw.iconUrl ||
      raw.icon_url ||
      raw.bannerUrl ||
      raw.banner_url ||
      raw.coverImage ||
      raw.cover_image ||
      (raw.tokens && Array.isArray(raw.tokens) && raw.tokens.length > 0 && (raw.tokens[0].imageUrl || raw.tokens[0].image_url)) ||
      (raw.condition && raw.condition.imageUrl) ||
      (raw.event && raw.event.imageUrl) ||
      null;
    
    // If no image found and we have a market slug, try to construct from Polymarket CDN
    if (!imageUrl && marketSlug) {
      // Try multiple Polymarket image URL patterns
      const possibleImageUrls = [
        `https://assets.polymarket.com/markets/${marketSlug}.png`,
        `https://polymarket.com/_next/image?url=https%3A%2F%2Fassets.polymarket.com%2Fmarkets%2F${marketSlug}.png&w=1200&q=75`
      ];
      // Store the first as potential fallback - will validate when adding to embed
      imageUrl = possibleImageUrls[0];
    }

    const market = {
      source: 'Polymarket',
      marketId: `polymarket-${marketId}`,
      title,
      url: permalink,
      imageUrl,
      resolvesAt,
      timeToResolveMs,
      lastPrice,
      volume24h,
      liquidity,
      priceChange1h: change1h,
      priceChange24h: change24h,
      spread,
      createdAt:
        raw.createdAt || raw.created_at || raw.opened_at || raw.created_time,
      acceptingOrders: isAcceptingOrders,
      raw
    };
    
    // Add priority boost for accepting orders markets (used in sorting)
    market._priority = isAcceptingOrders ? 1 : 0;
    
    return market;
  } catch (err) {
    logger.warn('Failed to map Polymarket market', { error: err.message });
    return null;
  }
}

async function scrapePolymarketMarkets() {
  try {
    const response = await axios.get('https://polymarket.com/markets', {
      headers: {
        'User-Agent': config.userAgent,
        Accept: 'text/html'
      },
      timeout: config.apiTimeoutMs
    });
    const $ = cheerio.load(response.data);
    const nextData = $('#__NEXT_DATA__').html();
    if (!nextData) return [];
    const parsed = JSON.parse(nextData);
    const markets =
      parsed?.props?.pageProps?.dehydratedState?.queries?.flatMap(
        (query) => query?.state?.data?.markets || []
      ) || [];
    logger.info(
      `Scraped ${markets.length} Polymarket markets via fallback handler`
    );
    return markets.map(mapPolymarketMarket).filter(Boolean);
  } catch (err) {
    logger.error('Polymarket fallback scraping failed', { error: err.message });
    registerOperationalAlert(
      'polymarket-fallback',
      `Polymarket fallback scraping failed (${err.message}). Manual intervention required.`
    );
    return [];
  }
}

function signKalshiRequest(method, path, apiKey, privateKeyPem) {
  try {
    // Kalshi uses milliseconds, not seconds
    const timestamp = Date.now().toString();
    
    // Strip query parameters from path before signing (Kalshi requirement)
    const pathWithoutQuery = path.split('?')[0];
    
    // Message format: timestamp + method + path (Kalshi format - no newlines, just concatenation)
    const message = timestamp + method + pathWithoutQuery;
    logger.debug('Kalshi signing message', { message, timestamp, method, path: pathWithoutQuery });
    
    // Handle private key formatting - normalize whitespace and ensure PEM format
    let pemKey = privateKeyPem.trim();
    
    // Remove surrounding quotes if present
    pemKey = pemKey.replace(/^["']|["']$/g, '');
    
    // Replace literal \n with actual newlines if present
    pemKey = pemKey.replace(/\\n/g, '\n');
    
    // Remove all existing whitespace to get just the base64 content
    let keyContent = pemKey.replace(/\s+/g, '');
    
    // If key doesn't have PEM headers, add them
    if (!pemKey.includes('-----BEGIN')) {
      // Wrap in PEM headers with proper line breaks (64 chars per line)
      pemKey = `-----BEGIN RSA PRIVATE KEY-----\n${keyContent.match(/.{1,64}/g).join('\n')}\n-----END RSA PRIVATE KEY-----`;
    } else {
      // Key already has headers, but might need cleanup
      // Extract just the base64 part and reformat
      const headerMatch = pemKey.match(/-----BEGIN[^-]+-----\s*([\s\S]*?)\s*-----END[^-]+-----/);
      if (headerMatch) {
        keyContent = headerMatch[1].replace(/\s+/g, '');
        pemKey = `-----BEGIN RSA PRIVATE KEY-----\n${keyContent.match(/.{1,64}/g).join('\n')}\n-----END RSA PRIVATE KEY-----`;
      }
    }
    
    // Ensure newlines are consistent
    pemKey = pemKey.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Try RSA-PSS padding first (Kalshi format)
    let signature;
    try {
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(message);
      sign.end();
      
      signature = sign.sign({
        key: pemKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
      }, 'base64');
    } catch (signErr) {
      // If PSS fails, try PKCS1 (fallback)
      logger.warn('RSA-PSS signing failed, trying PKCS1', { error: signErr.message });
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(message);
      signature = sign.sign(pemKey, 'base64');
    }
    
    return {
      'KALSHI-ACCESS-KEY': apiKey,
      'KALSHI-ACCESS-SIGNATURE': signature,
      'KALSHI-ACCESS-TIMESTAMP': timestamp
    };
  } catch (err) {
    logger.error('Failed to sign Kalshi request', { 
      error: err.message, 
      stack: err.stack,
      keyPreview: privateKeyPem?.substring(0, 50) + '...'
    });
    return null;
  }
}

async function fetchKalshiMarkets() {
  const now = Date.now();
  
  // Check rate limit state first - if we're still cooldown, skip entirely
  if (rateLimitState.kalshi > now) {
    const remainingMs = rateLimitState.kalshi - now;
    const remainingMinutes = Math.ceil(remainingMs / 60000);
    // Only log this once per minute to avoid spam
    if (remainingMs % 60000 < 2000 || remainingMs > 570000) {
      logger.info(`Kalshi rate limited. Skipping fetch for ${remainingMinutes} more minute(s).`);
    }
    return [];
  }

  // Check cache first
  const cacheKey = 'kalshi:markets';
  const cached = requestCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    logger.debug('Using cached Kalshi response');
    healthMonitor.recordApiCall('kalshi', true, 0, false);
    usageMetrics.recordUsage('api_kalshi', {
      success: true,
      responseTime: 0,
      metadata: { cached: true, marketsFetched: cached.data?.length || 0 }
    });
    return cached.data;
  }

  // TEMPORARY: Skip Kalshi API auth completely - use fallback scraping only
  // The API authentication requires proper RSA signing which is having issues
  // Fallback scraping works but may be rate limited temporarily
  
  // Use fallback scraping only (no API auth)
  logger.debug('Attempting Kalshi web scraping (API auth disabled)');
  
  try {
    const startTime = Date.now();
    
    // Circuit breaker will return empty array if circuit is open (rate limited)
    // This is normal and expected - handled silently
    const fallbackResults = await kalshiCircuitBreaker.execute(async () => {
      return await scrapeKalshiMarkets();
    }, async () => {
      // Circuit is open - return empty array silently
      return [];
    });
    
    const duration = Date.now() - startTime;
    
    // Handle result from circuit breaker (could be array, null, or empty)
    const results = Array.isArray(fallbackResults) ? fallbackResults : [];
    
    if (results.length > 0) {
      logger.info(`Successfully scraped ${results.length} Kalshi markets`);
      // Clear rate limit on success
      rateLimitState.kalshi = 0;
      healthMonitor.recordApiCall('kalshi', true, duration, false);
      usageMetrics.recordUsage('api_kalshi', {
        success: true,
        responseTime: duration,
        metadata: { marketsFetched: results.length }
      });
      
      // Cache the response
      requestCache.set(cacheKey, {
        data: results,
        expiresAt: now + CACHE_TTL_MS
      });
      
      return results;
    }
    
    // No markets - this is normal when rate limited or circuit is open
    healthMonitor.recordApiCall('kalshi', true, duration, false);
    return [];
  } catch (err) {
    const duration = Date.now() - startTime;
    const status = err.response?.status;
    const isRateLimited = status === 429 || status === 503;
    
    if (isRateLimited) {
      // Rate limited - set longer cooldown (30 minutes to be safe)
      const cooldownMs = 30 * 60 * 1000; // 30 minutes
      const alreadyRateLimited = rateLimitState.kalshi > Date.now();
      rateLimitState.kalshi = Date.now() + cooldownMs;
      
      // Rate limiting is normal without API keys - don't log as error or warn
      // Only log at debug level once when it first happens
      if (!alreadyRateLimited) {
        logger.debug(`Kalshi rate limited (429). Cooldown set for ${cooldownMs / 60000} minutes. This is normal without API keys.`);
      }
      // Don't record as error - rate limiting is expected
      healthMonitor.recordApiCall('kalshi', false, duration, true);
      usageMetrics.recordUsage('api_kalshi', {
        success: false,
        error: err,
        responseTime: duration,
        metadata: { status, isRateLimited: true }
      });
    } else {
      // Non-rate-limit errors - log but don't spam
      logger.debug('Kalshi scraping failed (non-rate-limit)', { error: err.message, status });
      // Set shorter cooldown for other errors (5 minutes)
      rateLimitState.kalshi = Date.now() + 5 * 60 * 1000; // 5 minutes
      healthMonitor.recordApiCall('kalshi', false, duration, false);
      healthMonitor.recordError('kalshi_api_failed', err.message);
      usageMetrics.recordUsage('api_kalshi', {
        success: false,
        error: err,
        responseTime: duration,
        metadata: { status, isRateLimited: false }
      });
    }
    
    return [];
  }
  
  // NOTE: Kalshi API authentication is currently disabled
  // The API requires RSA-PSS signing which is having compatibility issues
  // Using web scraping fallback instead, which works but may be rate limited
  // To re-enable API auth, uncomment the code below and fix RSA signing format
}

function mapKalshiMarket(raw) {
  try {
    const marketId = raw.id || raw.market_id || raw.ticker;
    const title =
      raw.title || raw.question || raw.name || raw.ticker || 'Untitled market';
    const permalink =
      raw.url ||
      (raw.ticker
        ? `https://kalshi.com/market/${raw.ticker}`
        : `https://kalshi.com/event/${marketId}`);

    const closesAt =
      raw.close_time ||
      raw.close_time_iso ||
      raw.expiration_time ||
      raw.end_date ||
      raw.settlement_time;
    const resolvesAt = closesAt ? new Date(closesAt).toISOString() : null;
    const timeToResolveMs = resolvesAt
      ? new Date(resolvesAt).getTime() - Date.now()
      : Number.POSITIVE_INFINITY;

    const yesBid = safeNumber(
      raw.yes_bid ??
        raw.order_book?.yes_bid ??
        raw.orderbook?.yes_bid ??
        raw.bid_yes
    );
    const yesAsk = safeNumber(
      raw.yes_ask ??
        raw.order_book?.yes_ask ??
        raw.orderbook?.yes_ask ??
        raw.ask_yes
    );
    const spread =
      yesBid > 0 && yesAsk > 0 ? Math.max(yesAsk - yesBid, 0) / 100 : 0.1;

    const lastPriceRaw =
      raw.last_price ??
      raw.last_price_cents ??
      raw.yes_price ??
      raw.ticker_price ??
      yesBid ??
      yesAsk;
    const lastPrice = safeNumber(lastPriceRaw, 0) / (lastPriceRaw > 1 ? 100 : 1);

    const volume24h = safeNumber(
      raw.volume_24h ?? raw.volume24h ?? raw.volume?.day ?? raw.total_volume
    );
    const liquidity = safeNumber(
      raw.open_interest ??
        raw.liquidity ??
        raw.order_book?.liquidity ??
        raw.float
    );
    const change1h = safeNumber(raw.price_change_1h ?? raw.change1h) / 100;
    const change24h = safeNumber(raw.price_change_24h ?? raw.change24h) / 100;

    // Extract image URL from various possible fields in Kalshi data
    let imageUrl = 
      raw.imageUrl || 
      raw.image_url || 
      raw.image || 
      raw.thumbnail || 
      raw.thumbnailUrl || 
      raw.thumbnail_url ||
      raw.iconUrl ||
      raw.icon_url ||
      raw.bannerUrl ||
      raw.banner_url ||
      raw.coverImage ||
      raw.cover_image ||
      (raw.event && raw.event.imageUrl) ||
      null;
    
    // If no image found and we have a market identifier, try to construct Kalshi image URL
    if (!imageUrl && raw.ticker) {
      // Kalshi images might be available at this pattern (if they use images)
      imageUrl = `https://kalshi.com/images/markets/${raw.ticker}.png`;
    }

    return {
      source: 'Kalshi',
      marketId: `kalshi-${marketId}`,
      title,
      url: permalink,
      imageUrl,
      resolvesAt,
      timeToResolveMs,
      lastPrice,
      volume24h,
      liquidity,
      priceChange1h: change1h,
      priceChange24h: change24h,
      spread,
      createdAt: raw.listed_time || raw.created_time || raw.open_time,
      raw
    };
  } catch (err) {
    logger.warn('Failed to map Kalshi market', { error: err.message });
    return null;
  }
}

async function scrapeKalshiMarkets() {
  try {
    const response = await axios.get(config.kalshi.fallbackUrl, {
      headers: {
        'User-Agent': config.userAgent,
        Accept: 'text/html'
      },
      timeout: config.apiTimeoutMs
    });
    const $ = cheerio.load(response.data);
    const nextData = $('#__NEXT_DATA__').html();
    if (!nextData) return [];
    const parsed = JSON.parse(nextData);
    const markets =
      parsed?.props?.pageProps?.dehydratedState?.queries?.flatMap(
        (query) => query?.state?.data?.markets || []
      ) || [];
    logger.info(
      `Scraped ${markets.length} Kalshi markets via fallback handler`
    );
    return markets.map(mapKalshiMarket).filter(Boolean);
  } catch (err) {
    const status = err.response?.status;
    const errorMessage = err.message || '';
    const isRateLimited = status === 429 || status === 503 || 
                         errorMessage.includes('429') || 
                         errorMessage.includes('503') ||
                         errorMessage.includes('rate limit') ||
                         errorMessage.includes('Too Many Requests');
    
    // Don't spam alerts for rate limiting - handled at higher level
    if (isRateLimited) {
      // Rate limiting is expected and normal - log at debug level
      logger.debug('Kalshi scraping rate limited (429/503). This is normal without API keys.', { status });
      throw err; // Re-throw to be handled by caller
    }
    // Only log non-rate-limit errors as actual errors
    logger.warn('Kalshi fallback scraping failed (non-rate-limit error)', { error: err.message, status });
    // Don't register operational alerts for rate limits - they're normal
    if (!isRateLimited) {
      registerOperationalAlert(
        'kalshi-fallback',
        `Kalshi fallback scraping failed (${err.message}). Manual intervention required.`
      );
    }
    throw err; // Re-throw so circuit breaker can handle it
  }
}

async function fetchWithRetry(fetchFn, options = {}) {
  const retries = options.retries || 3;
  const baseDelay = options.baseDelayMs || 750;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchFn();
    } catch (err) {
      const status = err.response?.status;
      if (status === 429 || status === 503) {
        const pauseMs =
          (err.response?.headers?.['retry-after']
            ? Number(err.response.headers['retry-after']) * 1000
            : config.pauseOnRateLimitMs) || config.pauseOnRateLimitMs;
        logger.warn('Hit rate limit', { status, pauseMs });
        await delay(pauseMs);
        continue;
      }
      if (attempt === retries) {
        throw err;
      }
      const delayMs = baseDelay * Math.pow(2, attempt);
      logger.warn('Request failed, retrying', {
        attempt,
        delayMs,
        error: err.message
      });
      await delay(delayMs);
    }
  }
  throw new Error('fetchWithRetry exhausted retries');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function registerOperationalAlert(source, message, customTTL = null) {
  // NEVER register alerts for rate limiting - they're normal and expected
  const msg = message.toLowerCase();
  const src = source.toLowerCase();
  if (src.includes('rate-limit') || 
      src.includes('kalshi-fallback') || // Kalshi fallback errors are usually rate limits
      msg.includes('429') ||
      msg.includes('503') ||
      msg.includes('rate limited') ||
      msg.includes('too many requests') ||
      msg.includes('request failed with status code 429') ||
      msg.includes('request failed with status code 503')) {
    // Don't register rate limit alerts at all - they're normal
    logger.debug(`Suppressed rate limit operational alert: ${message}`);
    return;
  }
  
  const key = `${source}:${message}`;
  const now = Date.now();
  const existingExpiry = operationalAlertCache.get(key);
  
  // Use longer TTL for similar alerts to prevent spam
  const ttl = customTTL || OP_ALERT_TTL_MS;
  
  if (existingExpiry && existingExpiry > now) {
    return; // Already alerted recently
  }
  
  operationalAlertCache.set(key, now + ttl);
  operationalAlerts.push({ source, message, timestamp: new Date().toISOString() });
}

function drainOperationalAlerts() {
  const alerts = operationalAlerts.splice(0, operationalAlerts.length);
  const now = Date.now();
  for (const [key, expiry] of operationalAlertCache.entries()) {
    if (expiry <= now) {
      operationalAlertCache.delete(key);
    }
  }
  return alerts;
}

/**
 * Send error alert to Discord channel
 * Throttles alerts to prevent spam (15 min cooldown per error type)
 */
async function sendErrorAlert(client, errorType, errorMessage, errorDetails = {}) {
  try {
    // Check if this error type was recently alerted
    const cacheKey = `error:${errorType}`;
    const lastAlertTime = errorAlertCache.get(cacheKey) || 0;
    const now = Date.now();
    
    if (now - lastAlertTime < ERROR_ALERT_COOLDOWN_MS) {
      const remainingMinutes = Math.ceil((ERROR_ALERT_COOLDOWN_MS - (now - lastAlertTime)) / 60000);
      logger.debug(`Error alert throttled for ${errorType} (${remainingMinutes}m remaining)`);
      return;
    }
    
    // Update cache
    errorAlertCache.set(cacheKey, now);
    
    const channel = await resolveChannel(client).catch(() => null);
    if (!channel) {
      logger.warn('Cannot send error alert: channel not available');
      return;
    }
    
    const isCritical = CRITICAL_ERROR_TYPES.includes(errorType);
    const embed = new EmbedBuilder()
      .setTitle(isCritical ? '🚨 Critical Error Alert' : '⚠️ Error Alert')
      .setColor(isCritical ? 0xff0000 : 0xff8800)
      .setDescription(`**Error Type:** ${errorType}\n**Message:** ${errorMessage}`)
      .addFields({
        name: 'Timestamp',
        value: new Date().toISOString(),
        inline: true
      })
      .setTimestamp();
    
    if (Object.keys(errorDetails).length > 0) {
      const detailsStr = JSON.stringify(errorDetails, null, 2).substring(0, 1000);
      embed.addFields({
        name: 'Details',
        value: `\`\`\`json\n${detailsStr}\n\`\`\``,
        inline: false
      });
    }
    
    if (isCritical) {
      embed.addFields({
        name: 'Action Required',
        value: 'This is a critical error. Please check logs and bot status immediately.',
        inline: false
      });
    }
    
    await channel.send({ embeds: [embed] });
    logger.info(`Error alert sent to Discord: ${errorType}`, { errorMessage });
  } catch (err) {
    logger.error('Failed to send error alert to Discord', { 
      errorType, 
      error: err.message,
      originalError: errorMessage 
    });
  }
}

async function sendMarketAlert(channel, market) {
  const startTime = Date.now();
  try {
    // Enhanced embed with intelligence data
    const intelligence = market.intelligence || {};
    const trend = intelligence.trend || {};
    const anomalies = intelligence.anomalies || [];
    const urgency = market.urgency || 0;
  
  // Determine color based on urgency and confidence
  let embedColor = selectColorByConfidence(market.confidence);
  if (urgency > 70) embedColor = 0xff0000; // Red for high urgency
  else if (urgency > 50) embedColor = 0xff8800; // Orange for moderate urgency
  
  // Build premium embed with clear source identification
  const sourceName = market.source || 'Unknown';
  const sourceIcon = market.source === 'Polymarket'
    ? 'https://polymarket.com/favicon.ico'
    : market.source === 'Kalshi'
    ? 'https://kalshi.com/favicon.ico'
    : undefined;
  
  // Build premium embed
  const embed = new EmbedBuilder()
    .setTitle(`${bucketEmoji(market.bucket)} ${market.title}`)
    .setURL(market.url)
    .setColor(embedColor)
    .setAuthor({
      name: sourceName,
      iconURL: sourceIcon
    });
  
  // Core metrics - organized in clean rows
  const timeRemaining = formatDuration(market.timeToResolveMs);
  const bucketLabel = market.bucket || 'N/A';
  const urgencyIndicator = urgency > 70 ? ' 🔥 URGENT' : urgency > 50 ? ' ⚡ HIGH' : '';
  
  embed.addFields(
    {
      name: '⏰ Resolution Timeline',
      value: `**${timeRemaining}**\n\`${formatUtc(market.resolvesAt)}\`\n**Bucket:** ${bucketLabel} ${urgencyIndicator}`,
      inline: false
    }
  );
  
  // Market metrics in a clean grid
  const liquidityInfo = liquidityLabel(market.liquidity);
  const volume24h = market.volume24h ? formatCurrency(market.volume24h) : 'N/A';
  const spreadPct = market.spread ? `${(market.spread * 100).toFixed(2)}%` : 'N/A';
  
  embed.addFields(
    {
      name: '💰 Liquidity',
      value: `**${liquidityInfo}**`,
      inline: true
    },
    {
      name: '📊 24h Volume',
      value: `**${volume24h}**`,
      inline: true
    },
    {
      name: '📏 Spread',
      value: `**${spreadPct}**`,
      inline: true
    }
  );
  
  // Price movement indicators
  const priceChange1h = market.priceChange1h ? (market.priceChange1h * 100).toFixed(2) : null;
  const priceChange24h = market.priceChange24h ? (market.priceChange24h * 100).toFixed(2) : null;
  
  if (priceChange1h || priceChange24h) {
    const priceMovements = [];
    if (priceChange1h) {
      const emoji1h = parseFloat(priceChange1h) > 0 ? '📈' : '📉';
      priceMovements.push(`${emoji1h} **1h:** ${priceChange1h > 0 ? '+' : ''}${priceChange1h}%`);
    }
    if (priceChange24h) {
      const emoji24h = parseFloat(priceChange24h) > 0 ? '📈' : '📉';
      priceMovements.push(`${emoji24h} **24h:** ${priceChange24h > 0 ? '+' : ''}${priceChange24h}%`);
    }
    
    if (priceMovements.length > 0) {
      embed.addFields({
        name: '📈 Price Movement',
        value: priceMovements.join(' | '),
        inline: false
      });
    }
  }
  
  // Trend analysis (only if significant)
  if (trend.trend && trend.trend !== 'neutral' && trend.confidence > 50) {
    const trendEmoji = trend.trend.includes('up') ? '🟢' : trend.trend.includes('down') ? '🔴' : '🟡';
    const trendText = trend.trend === 'strong_up' ? 'Strong Uptrend ▲▲' :
                      trend.trend === 'up' ? 'Uptrend ▲' :
                      trend.trend === 'strong_down' ? 'Strong Downtrend ▼▼' :
                      trend.trend === 'down' ? 'Downtrend ▼' : 'Neutral →';
    const trendConf = trend.confidence ? Math.round(trend.confidence) : 0;
    const priceChange = trend.priceChangePercent ? 
      `${trend.priceChangePercent > 0 ? '+' : ''}${trend.priceChangePercent.toFixed(1)}%` : 'N/A';
    
    embed.addFields({
      name: `${trendEmoji} Market Trend`,
      value: `**${trendText}**\nConfidence: ${trendConf}% | Change: ${priceChange}`,
      inline: false
    });
  }
  
  // Anomalies (only high severity shown prominently)
  if (anomalies.length > 0) {
    const highSeverity = anomalies.filter(a => a.severity === 'high');
    if (highSeverity.length > 0) {
      embed.addFields({
        name: '⚠️ Alert: Market Anomaly Detected',
        value: `**${highSeverity[0].message}**`,
        inline: false
      });
    }
  }
  
  // Rationale - clean and concise (placed before intelligence for quick understanding)
  const rationale = buildRationaleText(market);
  embed.addFields({
    name: '💡 Why This Market?',
    value: rationale,
    inline: false
  });
  
  // Specific drivers for the market (enhanced formatting - deeper analysis)
  const drivers = buildMarketDrivers(market, intelligence);
  if (drivers) {
    embed.addFields({
      name: '🚀 Specific Drivers for This Market',
      value: drivers,
      inline: false
    });
  }
  
  // Score breakdown (if available - shows the technical scoring)
  if (market.scoreBreakdown) {
    const breakdown = market.scoreBreakdown;
    const breakdownParts = [];
    if (breakdown.liquidity > 0) breakdownParts.push(`Liquidity: ${breakdown.liquidity.toFixed(1)}`);
    if (breakdown.volume > 0) breakdownParts.push(`Volume: ${breakdown.volume.toFixed(1)}`);
    if (breakdown.price > 0) breakdownParts.push(`Price: ${breakdown.price.toFixed(1)}`);
    if (breakdown.time > 0) breakdownParts.push(`Time: ${breakdown.time.toFixed(1)}`);
    if (breakdown.spread > 0) breakdownParts.push(`Spread: ${breakdown.spread.toFixed(1)}`);
    
    if (breakdownParts.length > 0) {
      embed.addFields({
        name: '📋 Score Breakdown',
        value: breakdownParts.join(' • '),
        inline: false
      });
    }
  }
  
  // Add market image if available - try multiple sources
  if (market.imageUrl) {
    // Use image URL from market data
    embed.setImage(market.imageUrl);
  } else if (market.url && market.source === 'Polymarket') {
    // Try to extract market slug from URL and construct image URL for Polymarket
    const urlMatch = market.url.match(/\/market\/([^\/\?]+)/);
    if (urlMatch && urlMatch[1]) {
      const marketSlug = urlMatch[1];
      // Try Polymarket CDN image URL pattern
      const constructedImageUrl = `https://assets.polymarket.com/markets/${marketSlug}.png`;
      embed.setImage(constructedImageUrl);
    }
  } else if (market.url && market.source === 'Kalshi') {
    // Try to extract market identifier from URL and construct image URL for Kalshi
    const urlMatch = market.url.match(/\/(market|event)\/([^\/\?]+)/);
    if (urlMatch && urlMatch[2]) {
      const marketIdentifier = urlMatch[2];
      // Try Kalshi image URL patterns (if they use images)
      const constructedImageUrl = `https://kalshi.com/images/markets/${marketIdentifier}.png`;
      embed.setImage(constructedImageUrl);
    }
  } else if (market.raw) {
    // Last resort: check raw data for any image fields we might have missed
    const rawImageUrl = 
      market.raw.imageUrl || 
      market.raw.image_url || 
      market.raw.image || 
      market.raw.thumbnail || 
      market.raw.thumbnailUrl ||
      market.raw.iconUrl ||
      market.raw.icon_url;
    if (rawImageUrl) {
      embed.setImage(rawImageUrl);
    }
  }

  // Premium footer
  embed.setFooter({
    text: '⚠️ Not financial advice. Verify all data before acting. Use at your own risk.',
    iconURL: undefined
  })
  .setTimestamp(new Date());

    await channel.send({
      embeds: [embed]
    });
    
    // Track metrics for market alert
    const responseTime = Date.now() - startTime;
    usageMetrics.recordUsage('market_alert', {
      success: true,
      responseTime,
      metadata: { 
        source: market.source,
        marketId: market.marketId,
        confidence: market.confidence 
      }
    });
  } catch (err) {
    const responseTime = Date.now() - startTime;
    usageMetrics.recordUsage('market_alert', {
      success: false,
      error: err,
      responseTime,
      metadata: { 
        source: market.source,
        marketId: market.marketId 
      }
    });
    throw err;
  }
}

function buildFallbackText(market) {
  const emoji = bucketEmoji(market.bucket);
  const rationale = buildRationaleText(market);
  const confidence = Math.round(market.confidence || 0);
  const probability = formatProbability(market.lastPrice);
  const timeRemaining = formatDuration(market.timeToResolveMs);
  
  return `${emoji} **${market.source}** • ${market.title}\n\n` +
    `**Confidence:** ${confidence}% | **Probability:** ${probability}\n` +
    `**Expires:** ${timeRemaining} | **Bucket:** ${market.bucket || 'N/A'}\n\n` +
    `**Why?** ${rationale}\n\n` +
    `${market.url}\n\n` +
    `⚠️ Not financial advice. Verify before acting.`;
}

function buildRationaleText(market) {
  const segments = market.explanations || [];
  // Clean up segments - remove duplicates and make them more polished
  const uniqueSegments = [...new Set(segments)];
  const trimmed = uniqueSegments.slice(0, 3)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1)) // Capitalize first letter
    .join(' • ');
  return trimmed || 'Meets configured thresholds; monitor closely.';
}

function buildMarketDrivers(market, intelligence) {
  const drivers = [];
  const breakdown = market.scoreBreakdown || {};
  const trend = intelligence.trend || {};
  const anomalies = intelligence.anomalies || [];
  
  // Liquidity driver
  if (breakdown.liquidity > 20) {
    const liquidity = safeNumber(market.liquidity, 0);
    if (liquidity >= 25000) {
      drivers.push(`💰 **High liquidity** (${formatCurrency(liquidity)}) - Strong market depth and trading interest`);
    } else if (liquidity >= 5000) {
      drivers.push(`💰 **Solid liquidity** (${formatCurrency(liquidity)}) - Good market depth`);
    }
  }
  
  // Volume momentum driver
  if (breakdown.volume > 15) {
    const volume24h = safeNumber(market.volume24h, 0);
    const volumeChange = market.priceChange24h ? (market.priceChange24h * 100).toFixed(1) : null;
    if (volume24h > 10000) {
      drivers.push(`📊 **Strong volume** (${formatCurrency(volume24h)} 24h) - High trading activity`);
    } else if (volume24h > 0) {
      drivers.push(`📊 **Active trading** (${formatCurrency(volume24h)} 24h)`);
    }
    if (volumeChange && Math.abs(parseFloat(volumeChange)) > 10) {
      drivers.push(`📈 **Volume momentum** (${volumeChange > 0 ? '+' : ''}${volumeChange}% change)`);
    }
  }
  
  // Price movement driver
  if (breakdown.price > 10) {
    const priceChange1h = market.priceChange1h ? (market.priceChange1h * 100).toFixed(1) : null;
    const priceChange24h = market.priceChange24h ? (market.priceChange24h * 100).toFixed(1) : null;
    if (priceChange1h && Math.abs(parseFloat(priceChange1h)) > 5) {
      drivers.push(`📈 **Price movement** (${priceChange1h > 0 ? '+' : ''}${priceChange1h}% in 1h) - Recent momentum shift`);
    } else if (priceChange24h && Math.abs(parseFloat(priceChange24h)) > 10) {
      drivers.push(`📈 **Price trend** (${priceChange24h > 0 ? '+' : ''}${priceChange24h}% in 24h) - Sustained movement`);
    }
  }
  
  // Time pressure driver
  if (breakdown.time > 10) {
    const hoursToResolve = market.timeToResolveMs / (1000 * 60 * 60);
    if (hoursToResolve < 1) {
      drivers.push(`⏰ **Imminent resolution** (<1 hour) - Time pressure creating urgency`);
    } else if (hoursToResolve < 6) {
      drivers.push(`⏰ **Approaching resolution** (${hoursToResolve.toFixed(1)}h) - Time-sensitive opportunity`);
    } else if (hoursToResolve < 24) {
      drivers.push(`⏰ **Near-term resolution** (${hoursToResolve.toFixed(1)}h) - Short time window`);
    }
  }
  
  // Spread efficiency driver
  if (breakdown.spread > 5) {
    const spreadPct = market.spread ? (market.spread * 100).toFixed(2) : null;
    if (spreadPct && parseFloat(spreadPct) < 3) {
      drivers.push(`📏 **Tight spread** (${spreadPct}%) - Efficient pricing, low slippage risk`);
    }
  }
  
  // Trend driver
  if (trend && trend.trend !== 'neutral' && trend.confidence > 50) {
    const trendText = trend.trend === 'strong_up' ? 'Strong uptrend' :
                     trend.trend === 'up' ? 'Uptrend' :
                     trend.trend === 'strong_down' ? 'Strong downtrend' :
                     trend.trend === 'down' ? 'Downtrend' : 'Neutral';
    drivers.push(`📊 **${trendText}** (${trend.confidence.toFixed(0)}% confidence) - Clear directional momentum`);
  }
  
  // Anomaly drivers
  if (anomalies.length > 0) {
    const highSeverity = anomalies.filter(a => a.severity === 'high');
    if (highSeverity.length > 0) {
      highSeverity.forEach(anomaly => {
        drivers.push(`⚠️ **${anomaly.message}** - Unusual market activity`);
      });
    }
  }
  
  // Confidence driver
  const confidence = Math.round(market.confidence || 0);
  if (confidence >= 75) {
    drivers.push(`⭐ **High confidence score** (${confidence}%) - Strong overall market signals`);
  } else if (confidence >= 50) {
    drivers.push(`✓ **Moderate confidence** (${confidence}%) - Good market indicators`);
  }
  
  return drivers.length > 0 ? drivers.join('\n\n') : 'Standard market conditions with baseline indicators.';
}

function bucketEmoji(bucket) {
  switch (bucket) {
    case '1H':
      return '⚡';
    case '24H':
      return '🔥';
    case '7D':
      return '⏳';
    default:
      return '📈';
  }
}

async function sendTestAlert(channel) {
  const mockMarket = {
    source: 'Polymarket',
    marketId: 'sample-123',
    title: 'Sample Market: Will This Premium Alert Format Impress Clients?',
    url: 'https://polymarket.com/market/sample',
    imageUrl: 'https://assets.polymarket.com/markets/sample.png', // Example image URL
    resolvesAt: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
    timeToResolveMs: 45 * 60 * 1000,
    lastPrice: 0.72,
    volume24h: 42000,
    liquidity: 55000,
    priceChange1h: 0.18,
    priceChange24h: 0.25,
    spread: 0.04,
    confidence: 87,
    bucket: '1H',
    urgency: 75,
    explanations: ['solid liquidity', 'notable volume momentum', 'upward price drift'],
    scoreBreakdown: {
      liquidity: 28.5,
      volume: 22.3,
      price: 18.7,
      time: 15.0,
      spread: 8.5
    },
    intelligence: {
      summary: 'Strong market signals with high confidence indicators. Excellent liquidity and momentum suggest active trading interest.',
      trend: {
        trend: 'strong_up',
        confidence: 82,
        priceChangePercent: 25.5
      }
    }
  };
  await sendMarketAlert(channel, mockMarket, { reason: 'test' });
}

function checkAuthorization(member) {
  if (!member) return false;
  if (config.discord.ownerId && member.id === config.discord.ownerId) {
    return true;
  }
  if (
    config.discord.adminRoleId &&
    member.roles?.cache?.has(config.discord.adminRoleId)
  ) {
    return true;
  }
  if (!config.discord.adminRoleId && !config.discord.ownerId) {
    // default to allowing server admins (Manage Guild permission)
    return member.permissions?.has(PermissionsBitField.Flags.ManageGuild);
  }
  return false;
}

function formatConfigSummary() {
  const lines = [
    '**Current configuration**',
    `Scan interval: ${config.scanIntervalMinutes} minute(s)`,
    `Duplicate suppression: ${config.duplicateSuppressionMinutes} minute(s)`,
    `Thresholds: minConfidence=${config.thresholds.minConfidence}, minLiquidity=$${config.thresholds.minLiquidity}, maxMarketAge=${config.thresholds.maxMarketAgeMinutes} min`,
    `Channels: ${config.discord.alertChannelId}`,
    '',
    '_Not financial advice. Ensure compliance with exchange ToS._'
  ];
  return lines.join('\n');
}

function formatStatsSummary() {
  const stats = healthMonitor.getStatsSummary();
  const health = healthMonitor.getHealth();
  
  const lines = [
    '**📊 Bot Statistics & Performance**',
    '',
    `**Uptime:** ${stats.uptime}`,
    `**Status:** ${health.status === 'healthy' ? '✅ Healthy' : health.status === 'degraded' ? '⚠️ Degraded' : '❌ Unhealthy'}`,
    '',
    '**Scans:**',
    `  Total: ${stats.scans.total}`,
    `  Successful: ${stats.scans.successful}`,
    `  Failed: ${stats.scans.failed}`,
    `  Success Rate: ${stats.scans.successRate}`,
    `  Avg Duration: ${stats.scans.avgDuration}`,
    '',
    '**Markets:**',
    `  Processed: ${stats.markets.processed}`,
    `  Alerts Sent: ${stats.markets.totalAlerts}`,
    `  Polymarket: ${stats.markets.bySource.polymarket.fetched} (${stats.markets.bySource.polymarket.alerts} alerts)`,
    `  Kalshi: ${stats.markets.bySource.kalshi.fetched} (${stats.markets.bySource.kalshi.alerts} alerts)`,
    '',
    '**API Health:**',
    `  Polymarket: ${stats.apiHealth.polymarket.status}`,
    `    Success Rate: ${stats.apiHealth.polymarket.successRate}`,
    `    Avg Response: ${stats.apiHealth.polymarket.avgResponseTime}`,
    `    Rate Limited: ${stats.apiHealth.polymarket.rateLimited}`,
    `  Kalshi: ${stats.apiHealth.kalshi.status}`,
    `    Success Rate: ${stats.apiHealth.kalshi.successRate}`,
    `    Avg Response: ${stats.apiHealth.kalshi.avgResponseTime}`,
    `    Rate Limited: ${stats.apiHealth.kalshi.rateLimited}`,
    '',
    `**Errors:** ${stats.errors.total} total`,
    stats.errors.byType && Object.keys(stats.errors.byType).length > 0
      ? `  Types: ${Object.entries(stats.errors.byType).map(([type, count]) => `${type}(${count})`).join(', ')}`
      : '  None',
    '',
    '_Enhanced monitoring enabled. Circuit breakers active._'
  ];
  return lines.join('\n');
}

function formatHealthStatus() {
  const health = healthMonitor.getHealth();
  const stats = healthMonitor.getStatsSummary();
  
  const statusEmoji = health.status === 'healthy' ? '✅' : health.status === 'degraded' ? '⚠️' : '❌';
  
  const lines = [
    `**${statusEmoji} Bot Health Status: ${health.status.toUpperCase()}**`,
    '',
    `**Uptime:** ${stats.uptime}`,
    '',
    '**System Status:**',
    `  Polymarket API: ${stats.apiHealth.polymarket.status}`,
    `  Kalshi API: ${stats.apiHealth.kalshi.status}`,
    `  Circuit Breakers: Active`,
    `  Intelligence Layer: Active`,
    `  Health Monitoring: Active`,
    '',
    '**Recent Performance:**',
    `  Scans: ${stats.scans.successRate} success rate`,
    `  API Response Times: ${stats.apiHealth.polymarket.avgResponseTime} (Poly), ${stats.apiHealth.kalshi.avgResponseTime} (Kalshi)`,
    '',
    health.status === 'healthy'
      ? '_All systems operational_ ✅'
      : health.status === 'degraded'
      ? '_Bot operational but some features limited. Check stats for details._ ⚠️'
      : '_Critical issues detected. Check logs immediately._ ❌'
  ];
  return lines.join('\n');
}

/**
 * Format usage metrics report for display
 */
function formatMetricsReport(report) {
  if (!report || !report.tools) {
    return 'No metrics data available.';
  }
  
  const { summary, topFeatures, tools } = report;
  
  const lines = [
    `**📊 Usage Metrics Report - ${report.period === 'today' ? 'Today' : 'All Time'}**`,
    report.period === 'today' ? `**Date:** ${report.date}` : '',
    '',
    '**📈 Summary:**',
    `  Total Queries: ${summary.totalQueries}`,
    `  Total Cost: $${summary.totalCost}`,
    `  Active Users: ${summary.activeUsers}`,
    `  Error Rate: ${summary.errorRate}`,
    `  Avg Response Time: ${summary.avgResponseTime}`,
    `  Tools Used: ${summary.toolsUsed}`,
    '',
    '**🔥 Top Features:**'
  ];
  
  if (topFeatures && topFeatures.length > 0) {
    topFeatures.slice(0, 5).forEach((tool, idx) => {
      lines.push(
        `  ${idx + 1}. **${tool.toolName}** - ${tool.queries} queries (${tool.errorRate} error rate)`
      );
    });
  } else {
    lines.push('  No usage data yet.');
  }
  
  lines.push('');
  lines.push('**🛠️ Tool Details:**');
  
  // Show details for each tool
  const toolEntries = Object.entries(tools).sort((a, b) => b[1].queries - a[1].queries);
  for (const [toolName, metrics] of toolEntries.slice(0, 10)) {
    lines.push(`\n**${toolName}:**`);
    lines.push(`  Queries: ${metrics.queries}`);
    lines.push(`  Cost/Query: $${metrics.costPerQuery}`);
    lines.push(`  Total Cost: $${parseFloat(metrics.totalCost).toFixed(4)}`);
    lines.push(`  Active Users: ${metrics.activeUsers}`);
    lines.push(`  Error Rate: ${metrics.errorRate}`);
    lines.push(`  Avg Response: ${metrics.avgResponseTime}`);
  }
  
  if (toolEntries.length > 10) {
    lines.push(`\n_... and ${toolEntries.length - 10} more tools_`);
  }
  
  lines.push('');
  lines.push('_Use `/metrics` to view detailed analytics. Metrics are tracked for pricing and growth analysis._');
  
  return lines.join('\n');
}

// Global error handlers
let discordClient = null; // Will be set when client is ready

process.on('uncaughtException', async (error) => {
  logger.error('Uncaught Exception - Critical Error', { 
    error: error.message, 
    stack: error.stack 
  });
  
  if (discordClient) {
    await sendErrorAlert(
      discordClient,
      'uncaught_exception',
      `Uncaught exception: ${error.message}`,
      { stack: error.stack?.substring(0, 500) }
    ).catch(() => {}); // Don't throw if alert fails
  }
  
  // Give time for error alert to send, then exit
  setTimeout(() => {
    process.exit(1);
  }, 2000);
});

process.on('unhandledRejection', async (reason, promise) => {
  const errorMessage = reason instanceof Error ? reason.message : String(reason);
  logger.error('Unhandled Rejection - Critical Error', { 
    error: errorMessage,
    reason: reason instanceof Error ? reason.stack : reason
  });
  
  if (discordClient) {
    await sendErrorAlert(
      discordClient,
      'unhandled_rejection',
      `Unhandled promise rejection: ${errorMessage}`,
      { reason: reason instanceof Error ? reason.stack?.substring(0, 500) : String(reason) }
    ).catch(() => {}); // Don't throw if alert fails
  }
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  if (discordClient) {
    try {
      const channel = await resolveChannel(discordClient).catch(() => null);
      if (channel) {
        await channel.send({
          embeds: [new EmbedBuilder()
            .setTitle('🛑 Bot Shutting Down')
            .setDescription('Bot received SIGINT signal and is shutting down gracefully.')
            .setColor(0xff8800)
            .setTimestamp()
          ]
        }).catch(() => {});
      }
    } catch (err) {
      logger.warn('Failed to send shutdown notification', { error: err.message });
    }
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  if (discordClient) {
    try {
      const channel = await resolveChannel(discordClient).catch(() => null);
      if (channel) {
        await channel.send({
          embeds: [new EmbedBuilder()
            .setTitle('🛑 Bot Shutting Down')
            .setDescription('Bot received SIGTERM signal and is shutting down gracefully.')
            .setColor(0xff8800)
            .setTimestamp()
          ]
        }).catch(() => {});
      }
    } catch (err) {
      logger.warn('Failed to send shutdown notification', { error: err.message });
    }
  }
  process.exit(0);
});

if (require.main === module) {
  main().catch(async (err) => {
    logger.error('Fatal error in main', { error: err.message, stack: err.stack });
    if (discordClient) {
      await sendErrorAlert(
        discordClient,
        'fatal_error',
        `Fatal error in main: ${err.message}`,
        { stack: err.stack?.substring(0, 500) }
      ).catch(() => {});
    }
    process.exit(1);
  });
}

module.exports = { main };