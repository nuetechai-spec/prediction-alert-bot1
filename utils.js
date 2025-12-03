'use strict';

/**
 * Utilities for scoring, filtering, and presenting prediction markets.
 * The design keeps scoring + formatting logic separate from the Discord glue layer
 * so we can test and tune weights without redeploying the bot.
 */

const MS_IN_MINUTE = 60 * 1000;
const MS_IN_HOUR = 60 * MS_IN_MINUTE;
const MS_IN_DAY = 24 * MS_IN_HOUR;

const SCORING_DEFAULTS = {
  liquidity: { weight: 30, benchmark: 5000 },
  volume: { weight: 25, benchmark: 15000, momentumBaseline: 0.4 },
  price: { weight: 20, baseline: 0.12 },
  time: {
    weight: 15,
    nearResolutionMs: MS_IN_HOUR,
    midResolutionMs: 24 * MS_IN_HOUR,
    farResolutionMs: 7 * MS_IN_DAY
  },
  spread: { weight: 10, baseline: 0.12 }
};

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function mergeScoringDefaults(overrides = {}) {
  const merged = JSON.parse(JSON.stringify(SCORING_DEFAULTS));
  Object.keys(overrides).forEach((key) => {
    if (merged[key] && typeof overrides[key] === 'object') {
      Object.assign(merged[key], overrides[key]);
    }
  });
  return merged;
}

function calculateConfidenceScore(market, scoringOverrides = {}) {
  const scoring = mergeScoringDefaults(scoringOverrides);

  const liquidityNorm = clamp(
    safeNumber(market.liquidity) / Math.max(scoring.liquidity.benchmark, 1),
    0,
    1
  );
  const liquidityScore = liquidityNorm * scoring.liquidity.weight;

  const volumeChangeAbs = Math.abs(
    safeNumber(
      market.volumeChange1h ??
        market.volumeChange24h ??
        market.volumeMomentum ??
        0
    )
  );
  let volumeNorm = 0;
  if (volumeChangeAbs > 0) {
    volumeNorm = clamp(volumeChangeAbs / scoring.volume.momentumBaseline, 0, 1);
  } else {
    // If no volume change data, use volume24h if available
    const volume24h = safeNumber(market.volume24h);
    if (volume24h > 0) {
      volumeNorm = clamp(volume24h / Math.max(scoring.volume.benchmark, 1), 0, 1);
    } else {
      // If no volume data at all, give partial credit for liquidity (markets with high liquidity likely have activity)
      const liquidityNorm = clamp(safeNumber(market.liquidity) / Math.max(scoring.liquidity.benchmark, 1), 0, 1);
      volumeNorm = liquidityNorm * 0.5; // Give 50% of liquidity score as volume proxy
    }
  }
  const volumeScore = volumeNorm * scoring.volume.weight;

  const priceMovementAbs = Math.max(
    Math.abs(safeNumber(market.priceChange1h)),
    Math.abs(safeNumber(market.priceChange24h)) * 0.6,
    Math.abs(safeNumber(market.priceChange)) * 0.4
  );
  let priceNorm = 0;
  if (priceMovementAbs > 0) {
    priceNorm = clamp(priceMovementAbs / scoring.price.baseline, 0, 1);
  } else {
    // If no price movement data, give partial credit based on liquidity and spread
    // Markets with good liquidity and tight spreads are still interesting
    const liquidityNorm = clamp(safeNumber(market.liquidity) / Math.max(scoring.liquidity.benchmark, 1), 0, 1);
    const spreadValue = Math.abs(safeNumber(market.spread, scoring.spread.baseline));
    const spreadNorm = 1 - clamp(spreadValue / Math.max(scoring.spread.baseline, 0.0001), 0, 1);
    priceNorm = (liquidityNorm * 0.3 + spreadNorm * 0.3); // Combine liquidity and spread as proxy
  }
  const priceScore = priceNorm * scoring.price.weight;

  const timeNorm = (() => {
    const timeMs = safeNumber(market.timeToResolveMs, Number.POSITIVE_INFINITY);
    if (!Number.isFinite(timeMs) || timeMs <= 0) return 0;
    if (timeMs <= scoring.time.nearResolutionMs) return 1;
    if (timeMs <= scoring.time.midResolutionMs) return 0.75;
    if (timeMs <= scoring.time.farResolutionMs) return 0.4;
    const over =
      timeMs - scoring.time.farResolutionMs > 0
        ? timeMs - scoring.time.farResolutionMs
        : 0;
    const decay = clamp(1 - over / (7 * MS_IN_DAY), 0, 1);
    return decay * 0.3;
  })();
  const timeScore = timeNorm * scoring.time.weight;

  const spreadValue = Math.abs(
    safeNumber(market.spread, scoring.spread.baseline)
  );
  const spreadNorm =
    1 - clamp(spreadValue / Math.max(scoring.spread.baseline, 0.0001), 0, 1);
  const spreadScore = spreadNorm * scoring.spread.weight;

  const breakdown = {
    liquidity: round2(liquidityScore),
    volume: round2(volumeScore),
    price: round2(priceScore),
    time: round2(timeScore),
    spread: round2(spreadScore)
  };
  const total = Math.round(
    breakdown.liquidity +
      breakdown.volume +
      breakdown.price +
      breakdown.time +
      breakdown.spread
  );

  const explanations = buildRationaleSegments(breakdown, market);

  return {
    total: clamp(total, 0, 100),
    breakdown,
    explanations,
    normalized: {
      liquidity: liquidityNorm,
      volume: volumeNorm,
      price: priceNorm,
      time: timeNorm,
      spread: spreadNorm
    }
  };
}

function buildRationaleSegments(breakdown, market) {
  const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  const segments = [];
  entries.slice(0, 3).forEach(([key, value]) => {
    if (value < 1) return;
    switch (key) {
      case 'liquidity':
        segments.push('solid liquidity');
        break;
      case 'volume':
        segments.push('notable volume momentum');
        break;
      case 'price':
        segments.push('meaningful price movement');
        break;
      case 'time':
        segments.push('approaching resolution');
        break;
      case 'spread':
        segments.push('tight spread');
        break;
      default:
        break;
    }
  });

  if (segments.length === 0) {
    segments.push('meets baseline filters');
  }

  const directionHint = (() => {
    const change = safeNumber(
      market.priceChange1h ?? market.priceChange24h ?? market.priceChange
    );
    if (!change) return '';
    if (change > 0) return 'upward price drift';
    if (change < 0) return 'downward price drift';
    return '';
  })();
  if (directionHint) segments.push(directionHint);

  return segments;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function bucketMarket(timeToResolveMs) {
  if (!Number.isFinite(timeToResolveMs) || timeToResolveMs <= 0) return null;
  if (timeToResolveMs <= MS_IN_HOUR) return '1H';
  if (timeToResolveMs <= MS_IN_DAY) return '24H';
  if (timeToResolveMs <= 7 * MS_IN_DAY) return '7D';
  // Allow markets beyond 7 days but still within reasonable range (up to 30 days)
  // Mark them as 'EXTENDED' bucket so they can still be processed
  if (timeToResolveMs <= 30 * MS_IN_DAY) return 'EXTENDED';
  return null;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'n/a';
  const totalMinutes = Math.floor(ms / MS_IN_MINUTE);
  if (totalMinutes <= 0) return 'under 1m';
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes && parts.length < 2) parts.push(`${minutes}m`);
  return parts.slice(0, 2).join(' ');
}

function formatUtc(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}

function selectColorByConfidence(confidence) {
  if (!Number.isFinite(confidence)) return 0xffa500; // default orange
  if (confidence >= 75) return 0x2ecc71; // green
  if (confidence >= 50) return 0xf1c40f; // yellow
  if (confidence >= 30) return 0xe67e22; // orange
  return 0xe74c3c; // red
}

function formatCurrency(value) {
  const num = safeNumber(value, 0);
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(1)}k`;
  if (num === 0) return '$0';
  return `$${num.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function liquidityLabel(value) {
  const num = safeNumber(value, 0);
  if (num >= 25000) return `High (${formatCurrency(num)})`;
  if (num >= 5000) return `Medium (${formatCurrency(num)})`;
  if (num > 0) return `Low (${formatCurrency(num)})`;
  return 'Unknown';
}

function formatProbability(probability) {
  const num = safeNumber(probability, 0);
  const pct = clamp(num * 100, 0, 100);
  return `${Math.round(pct)}%`;
}

function isMarketEligible(market, thresholds) {
  if (!market) return false;
  if (!thresholds) return true;
  if (!Number.isFinite(market.timeToResolveMs) || market.timeToResolveMs <= 0) {
    return false;
  }
  // Check max resolution first - if within range, allow it even without bucket
  if (
    Number.isFinite(thresholds.maxResolutionMs) &&
    market.timeToResolveMs > thresholds.maxResolutionMs
  ) {
    return false;
  }
  // Allow markets with EXTENDED bucket or within the time window
  if (!market.bucket || market.bucket === null) {
    // Only reject if outside maxResolutionMs (which we already checked above)
    // For markets within maxResolutionMs but no bucket, create one
    if (market.timeToResolveMs <= MS_IN_HOUR) return true;
    if (market.timeToResolveMs <= MS_IN_DAY) return true;
    if (market.timeToResolveMs <= 7 * MS_IN_DAY) return true;
    if (market.timeToResolveMs <= 30 * MS_IN_DAY) return true;
    return false;
  }
  if (
    Number.isFinite(thresholds.minConfidence) &&
    safeNumber(market.confidence) < thresholds.minConfidence
  ) {
    return false;
  }
  if (
    Number.isFinite(thresholds.minLiquidity) &&
    safeNumber(market.liquidity) < thresholds.minLiquidity
  ) {
    return false;
  }
  if (
    thresholds.maxMarketAgeMinutes &&
    market.createdAt &&
    Number.isFinite(new Date(market.createdAt).getTime())
  ) {
    const ageMinutes =
      (Date.now() - new Date(market.createdAt).getTime()) / MS_IN_MINUTE;
    if (ageMinutes > thresholds.maxMarketAgeMinutes) return false;
  }
  return true;
}

/**
 * Categorize market by analyzing its title for keywords
 * Returns category string: 'crypto', 'politics', 'sports', 'entertainment', 'economics', 'technology', 'other'
 */
function categorizeMarket(market) {
  if (!market || !market.title) return 'other';
  
  const title = market.title.toLowerCase();
  
  // Crypto keywords
  const cryptoKeywords = [
    'bitcoin', 'btc', 'ethereum', 'eth', 'solana', 'sol', 'crypto', 'cryptocurrency',
    'dogecoin', 'doge', 'cardano', 'ada', 'polygon', 'matic', 'avalanche', 'avax',
    'chainlink', 'link', 'litecoin', 'ltc', 'xrp', 'ripple', 'usdc', 'usdt', 'stablecoin',
    'defi', 'nft', 'web3', 'blockchain', 'altcoin', 'meme coin', 'shiba', 'token',
    'up or down', 'updown', 'up/down', 'bull', 'bear', 'pump', 'dump'
  ];
  
  // Politics keywords
  const politicsKeywords = [
    'election', 'president', 'senate', 'congress', 'trump', 'biden', 'democrat', 'republican',
    'vote', 'poll', 'polling', 'candidate', 'primary', 'impeachment', 'supreme court',
    'congressional', 'governor', 'mayor', 'political', 'policy', 'legislation', 'bill'
  ];
  
  // Sports keywords
  const sportsKeywords = [
    'nfl', 'nba', 'mlb', 'nhl', 'super bowl', 'world series', 'playoff', 'championship',
    'game', 'match', 'tournament', 'sport', 'team', 'player', 'score', 'win', 'lose',
    'football', 'basketball', 'baseball', 'hockey', 'soccer', 'tennis', 'golf'
  ];
  
  // Entertainment keywords
  const entertainmentKeywords = [
    'oscar', 'grammy', 'emmy', 'award', 'movie', 'film', 'tv show', 'celebrity',
    'actor', 'actress', 'music', 'album', 'song', 'concert', 'box office', 'streaming'
  ];
  
  // Economics keywords
  const economicsKeywords = [
    'gdp', 'inflation', 'unemployment', 'fed', 'federal reserve', 'interest rate',
    'stock market', 'dow', 's&p', 'nasdaq', 'economy', 'recession', 'gdp growth',
    'jobs report', 'cpi', 'ppi', 'retail sales', 'housing'
  ];
  
  // Technology keywords
  const technologyKeywords = [
    'apple', 'microsoft', 'google', 'meta', 'facebook', 'tesla', 'ai', 'artificial intelligence',
    'chatgpt', 'openai', 'nvidia', 'amd', 'intel', 'iphone', 'product launch', 'tech'
  ];
  
  // Check categories in priority order
  if (cryptoKeywords.some(keyword => title.includes(keyword))) {
    return 'crypto';
  }
  if (politicsKeywords.some(keyword => title.includes(keyword))) {
    return 'politics';
  }
  if (sportsKeywords.some(keyword => title.includes(keyword))) {
    return 'sports';
  }
  if (entertainmentKeywords.some(keyword => title.includes(keyword))) {
    return 'entertainment';
  }
  if (economicsKeywords.some(keyword => title.includes(keyword))) {
    return 'economics';
  }
  if (technologyKeywords.some(keyword => title.includes(keyword))) {
    return 'technology';
  }
  
  return 'other';
}

/**
 * Select markets with diversity - ensures different categories are represented
 * Prevents over-crowding by one category (like crypto)
 */
function selectMarketsWithDiversity(markets, maxPerCategory = 3, maxTotal = 10) {
  if (!markets || markets.length === 0) return [];
  
  // Categorize all markets
  const categorized = markets.map(market => ({
    market,
    category: categorizeMarket(market)
  }));
  
  // Group by category
  const byCategory = {};
  categorized.forEach(item => {
    if (!byCategory[item.category]) {
      byCategory[item.category] = [];
    }
    byCategory[item.category].push(item.market);
  });
  
  // Select markets ensuring diversity
  const selected = [];
  const categoryCounts = {};
  
  // Initialize counts
  Object.keys(byCategory).forEach(cat => {
    categoryCounts[cat] = 0;
  });
  
  // First pass: take top markets from each category (up to maxPerCategory)
  const categories = Object.keys(byCategory);
  for (let round = 0; round < maxPerCategory; round++) {
    for (const category of categories) {
      if (categoryCounts[category] < maxPerCategory && byCategory[category].length > 0) {
        const market = byCategory[category].shift();
        selected.push(market);
        categoryCounts[category]++;
        if (selected.length >= maxTotal) break;
      }
    }
    if (selected.length >= maxTotal) break;
  }
  
  // Second pass: fill remaining slots with best remaining markets (if space)
  if (selected.length < maxTotal) {
    const remaining = [];
    Object.values(byCategory).forEach(markets => {
      remaining.push(...markets);
    });
    
    // Sort remaining by score
    remaining.sort((a, b) => {
      const scoreA = (a.urgency || 0) + a.confidence;
      const scoreB = (b.urgency || 0) + b.confidence;
      return scoreB - scoreA;
    });
    
    // Add remaining until we hit maxTotal
    while (selected.length < maxTotal && remaining.length > 0) {
      const market = remaining.shift();
      const category = categorizeMarket(market);
      
      // Only add if we haven't exceeded max for this category
      if (categoryCounts[category] < maxPerCategory * 2) {
        selected.push(market);
        categoryCounts[category]++;
      }
    }
  }
  
  return selected;
}

module.exports = {
  MS_IN_MINUTE,
  MS_IN_HOUR,
  MS_IN_DAY,
  SCORING_DEFAULTS,
  calculateConfidenceScore,
  bucketMarket,
  formatDuration,
  formatUtc,
  selectColorByConfidence,
  formatCurrency,
  liquidityLabel,
  formatProbability,
  isMarketEligible,
  categorizeMarket,
  selectMarketsWithDiversity,
  clamp,
  safeNumber
};