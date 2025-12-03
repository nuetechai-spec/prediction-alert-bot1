'use strict';

/**
 * Debug script to analyze why markets aren't passing filters
 */

require('dotenv').config();
const axios = require('axios');
const { calculateConfidenceScore, bucketMarket, isMarketEligible, safeNumber } = require('./utils');

const config = {
  thresholds: {
    minConfidence: safeNumber(process.env.MIN_CONFIDENCE, 35),
    minLiquidity: safeNumber(process.env.MIN_LIQUIDITY, 500),
    maxResolutionMs: safeNumber(process.env.MAX_RESOLUTION_MS, 30 * 24 * 60 * 60 * 1000),
    maxMarketAgeMinutes: safeNumber(process.env.MAX_MARKET_AGE_MINUTES, 4 * 24 * 60)
  }
};

async function testMarketScoring() {
  console.log('\n=== Market Scoring Analysis ===\n');
  console.log('Thresholds:', config.thresholds);
  
  // Fetch a sample of markets
  try {
    const url = process.env.POLY_API_URL || 'https://gamma-api.polymarket.com/events';
    console.log(`\nFetching markets from: ${url}`);
    
    const response = await axios.get(`${url}?order=id&ascending=false&closed=false&limit=50&offset=0`, {
      headers: {
        'User-Agent': process.env.USER_AGENT || 'PredictionAlertBot/1.0',
        Accept: 'application/json'
      },
      timeout: 10000
    });
    
    const rawMarkets = Array.isArray(response.data) ? response.data : (response.data?.data || response.data?.events || []);
    console.log(`\nFetched ${rawMarkets.length} raw markets\n`);
    
    if (rawMarkets.length === 0) {
      console.log('❌ No markets fetched from API');
      return;
    }
    
    // Analyze first 20 markets
    const sampleMarkets = rawMarkets.slice(0, 20);
    let eligibleCount = 0;
    let analyzedCount = 0;
    
    for (const raw of sampleMarkets) {
      // Map to market format
      const endDate = raw.endDate || raw.end_date_iso || raw.closeTime;
      if (!endDate) continue;
      
      const endTime = new Date(endDate).getTime();
      const timeToResolveMs = endTime - Date.now();
      
      if (timeToResolveMs <= 0 || timeToResolveMs > config.thresholds.maxResolutionMs) {
        continue;
      }
      
      const market = {
        source: 'Polymarket',
        marketId: raw.id || raw.slug,
        title: raw.title || raw.question || 'Unknown',
        timeToResolveMs,
        liquidity: safeNumber(raw.liquidity || raw.bestBidSize || 0),
        volume24h: safeNumber(raw.volume24h || raw.volume_24h || 0),
        priceChange1h: safeNumber(raw.change1h || 0),
        priceChange24h: safeNumber(raw.change24h || 0),
        spread: safeNumber(raw.bestBid && raw.bestAsk ? raw.bestAsk - raw.bestBid : 0.15),
        lastPrice: safeNumber(raw.lastPrice || raw.yesPrice || 0.5),
        createdAt: raw.createdAt || raw.created_at
      };
      
      // Score the market
      const scoreResult = calculateConfidenceScore(market, {});
      market.confidence = scoreResult.total;
      market.bucket = bucketMarket(market.timeToResolveMs);
      market.scoreBreakdown = scoreResult.breakdown;
      
      analyzedCount++;
      
      // Check eligibility
      const eligible = isMarketEligible(market, config.thresholds);
      
      console.log(`\n${analyzedCount}. "${market.title.substring(0, 60)}..."`);
      console.log(`   Confidence: ${market.confidence}/100`);
      console.log(`   Liquidity: $${market.liquidity.toFixed(2)}`);
      console.log(`   Bucket: ${market.bucket || 'NONE'}`);
      console.log(`   Time to resolve: ${Math.round(timeToResolveMs / (60*60*1000))}h`);
      console.log(`   Score breakdown:`, market.scoreBreakdown);
      console.log(`   Eligible: ${eligible ? '✅ YES' : '❌ NO'}`);
      
      if (!eligible) {
        const reasons = [];
        if (market.confidence < config.thresholds.minConfidence) {
          reasons.push(`Confidence ${market.confidence} < ${config.thresholds.minConfidence}`);
        }
        if (market.liquidity < config.thresholds.minLiquidity) {
          reasons.push(`Liquidity $${market.liquidity} < $${config.thresholds.minLiquidity}`);
        }
        if (!market.bucket) {
          reasons.push('No bucket assigned');
        }
        console.log(`   Reasons: ${reasons.join(', ')}`);
      }
      
      if (eligible) eligibleCount++;
    }
    
    console.log(`\n\n=== Summary ===`);
    console.log(`Analyzed: ${analyzedCount} markets`);
    console.log(`Eligible: ${eligibleCount} markets`);
    console.log(`Eligibility Rate: ${((eligibleCount / analyzedCount) * 100).toFixed(1)}%`);
    console.log(`\nIf 0 markets are eligible, consider lowering thresholds:`);
    console.log(`  MIN_CONFIDENCE=${Math.max(config.thresholds.minConfidence - 10, 20)}`);
    console.log(`  MIN_LIQUIDITY=${Math.max(config.thresholds.minLiquidity - 100, 200)}`);
    
  } catch (err) {
    console.error('Error:', err.message);
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Response:', err.response.data);
    }
  }
}

testMarketScoring().catch(console.error);
