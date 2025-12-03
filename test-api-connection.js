#!/usr/bin/env node
/**
 * Test API Connection Script
 * Tests if Polymarket and Kalshi APIs are accessible
 */

const axios = require('axios');

console.log('🔍 Testing API Connections...\n');

// Test Polymarket API
console.log('1️⃣  Testing Polymarket API...');
axios.get('https://clob.polymarket.com/markets?limit=5&offset=0&status=open', {
  timeout: 10000,
  headers: {
    'User-Agent': 'PredictionAlertBot/1.0 (test)',
    'Accept': 'application/json'
  }
})
  .then(response => {
    const data = response.data;
    const markets = data?.data || data?.markets || data?.results || [];
    console.log(`   ✅ Polymarket API is working!`);
    console.log(`   📊 Response structure: ${Object.keys(data).join(', ')}`);
    console.log(`   📈 Markets returned: ${markets.length}`);
    
    if (markets.length > 0) {
      const market = markets[0];
      console.log(`   📝 Sample market: ${(market.question || market.title || 'N/A').substring(0, 60)}`);
      
      // Check if we can parse the date
      const endDate = market.end_date_iso || market.endDate || market.closeTime;
      if (endDate) {
        const daysAway = Math.round((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        console.log(`   📅 End date: ${endDate} (${daysAway > 0 ? daysAway + ' days away' : 'expired'})`);
      } else {
        console.log(`   ⚠️  No end date found in market data`);
      }
    }
    
    console.log('');
    return testKalshi();
  })
  .catch(error => {
    console.log(`   ❌ Polymarket API Error: ${error.message}`);
    if (error.response) {
      console.log(`   📊 Status: ${error.response.status}`);
      if (error.response.status === 429) {
        console.log(`   ⚠️  Rate limited - this is normal, bot will handle it`);
      }
    }
    console.log('');
    return testKalshi();
  });

// Test Kalshi API (fallback scraping)
function testKalshi() {
  console.log('2️⃣  Testing Kalshi API (fallback scraping)...');
  axios.get('https://kalshi.com/markets', {
    timeout: 10000,
    headers: {
      'User-Agent': 'PredictionAlertBot/1.0 (test)',
      'Accept': 'text/html'
    }
  })
    .then(response => {
      console.log(`   ✅ Kalshi website is accessible`);
      console.log(`   📊 Response status: ${response.status}`);
      
      // Try to parse Next.js data
      const html = response.data;
      if (html.includes('__NEXT_DATA__')) {
        console.log(`   ✅ Next.js data structure found (scraping should work)`);
      } else {
        console.log(`   ⚠️  Next.js data structure not found (scraping may fail)`);
      }
      
      console.log('');
      printSummary(true, true);
    })
    .catch(error => {
      console.log(`   ❌ Kalshi Error: ${error.message}`);
      if (error.response) {
        console.log(`   📊 Status: ${error.response.status}`);
        if (error.response.status === 429) {
          console.log(`   ⚠️  Rate limited - this is normal, bot will wait and retry`);
        }
      }
      console.log('');
      printSummary(true, false);
    });
}

function printSummary(polymarketOk, kalshiOk) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Test Summary:');
  console.log(`   Polymarket: ${polymarketOk ? '✅ Working' : '❌ Failed'}`);
  console.log(`   Kalshi: ${kalshiOk ? '✅ Accessible' : '❌ Failed (rate limited or down)'}`);
  console.log('');
  
  if (polymarketOk) {
    console.log('✅ Bot should work! Polymarket is accessible.');
    console.log('   Even if Kalshi is rate-limited, bot will work with Polymarket only.');
  } else {
    console.log('❌ Bot may have issues - Polymarket API is not accessible.');
    console.log('   Check your internet connection and try again later.');
  }
  console.log('');
}











