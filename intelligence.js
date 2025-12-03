'use strict';

/**
 * Intelligence layer for market analysis
 * Trend detection, anomaly detection, and pattern recognition
 */

class MarketIntelligence {
  constructor() {
    this.priceHistory = new Map(); // marketId -> [prices...]
    this.volumeHistory = new Map(); // marketId -> [volumes...]
    this.alertHistory = new Map(); // marketId -> [alerts...]
    this.maxHistoryLength = 50; // Keep last 50 data points
  }

  /**
   * Detect price trend momentum
   */
  detectTrend(market) {
    const marketId = market.marketId;
    const currentPrice = market.lastPrice;
    
    if (!this.priceHistory.has(marketId)) {
      this.priceHistory.set(marketId, []);
    }
    
    const history = this.priceHistory.get(marketId);
    history.push({
      price: currentPrice,
      time: Date.now(),
      volume: market.volume24h || 0,
      liquidity: market.liquidity || 0
    });
    
    // Keep only recent history
    if (history.length > this.maxHistoryLength) {
      history.shift();
    }

    if (history.length < 3) {
      return { trend: 'unknown', strength: 0, confidence: 0 };
    }

    // Calculate trend
    const recent = history.slice(-5); // Last 5 points
    const older = history.slice(-10, -5); // Previous 5 points
    
    if (older.length === 0) {
      return { trend: 'unknown', strength: 0, confidence: 0 };
    }

    const recentAvg = recent.reduce((sum, h) => sum + h.price, 0) / recent.length;
    const olderAvg = older.reduce((sum, h) => sum + h.price, 0) / older.length;
    const priceChange = recentAvg - olderAvg;
    const priceChangePercent = olderAvg > 0 ? (priceChange / olderAvg) * 100 : 0;

    // Volume trend
    const recentVolume = recent.reduce((sum, h) => sum + h.volume, 0) / recent.length;
    const olderVolume = older.reduce((sum, h) => sum + h.volume, 0) / older.length;
    const volumeChangePercent = olderVolume > 0 
      ? ((recentVolume - olderVolume) / olderVolume) * 100 
      : 0;

    let trend = 'neutral';
    let strength = Math.abs(priceChangePercent);
    let confidence = 0;

    if (priceChangePercent > 2) {
      trend = volumeChangePercent > 10 ? 'strong_up' : 'up';
      confidence = Math.min(90, 50 + strength + (volumeChangePercent > 0 ? 20 : 0));
    } else if (priceChangePercent < -2) {
      trend = volumeChangePercent > 10 ? 'strong_down' : 'down';
      confidence = Math.min(90, 50 + strength + (volumeChangePercent > 0 ? 20 : 0));
    }

    return {
      trend,
      strength: Math.min(100, strength),
      confidence: Math.min(100, confidence),
      priceChangePercent: priceChangePercent.toFixed(2),
      volumeChangePercent: volumeChangePercent.toFixed(2)
    };
  }

  /**
   * Detect anomalies in market behavior
   */
  detectAnomalies(market, trend) {
    const anomalies = [];
    
    // Unusual volume spike
    const avgVolume = this.getAverageVolume(market.marketId);
    if (avgVolume > 0 && market.volume24h > avgVolume * 3) {
      anomalies.push({
        type: 'volume_spike',
        severity: 'high',
        message: `Volume spike: ${((market.volume24h / avgVolume) * 100).toFixed(0)}% above average`,
        value: market.volume24h,
        average: avgVolume
      });
    }

    // Unusual price movement
    if (trend && Math.abs(parseFloat(trend.priceChangePercent)) > 15) {
      anomalies.push({
        type: 'price_volatility',
        severity: 'medium',
        message: `Large price movement: ${trend.priceChangePercent}%`,
        value: parseFloat(trend.priceChangePercent)
      });
    }

    // Tight spread with high liquidity (potential arbitrage)
    if (market.spread < 0.02 && market.liquidity > 10000) {
      anomalies.push({
        type: 'tight_spread',
        severity: 'low',
        message: 'Very tight spread with high liquidity',
        spread: market.spread,
        liquidity: market.liquidity
      });
    }

    // Approaching resolution with high activity
    if (market.timeToResolveMs < 60 * 60 * 1000 && market.volume24h > 5000) {
      anomalies.push({
        type: 'resolution_rush',
        severity: 'medium',
        message: 'High activity approaching resolution',
        timeToResolve: market.timeToResolveMs,
        volume: market.volume24h
      });
    }

    return anomalies;
  }

  /**
   * Calculate market urgency score
   */
  calculateUrgency(market, trend, anomalies) {
    let urgency = 0;

    // Time-based urgency
    const hoursToResolve = market.timeToResolveMs / (1000 * 60 * 60);
    if (hoursToResolve < 1) urgency += 40;
    else if (hoursToResolve < 6) urgency += 30;
    else if (hoursToResolve < 24) urgency += 20;

    // Trend urgency
    if (trend && trend.trend === 'strong_up') urgency += 20;
    else if (trend && trend.trend === 'strong_down') urgency += 15;
    else if (trend && trend.trend !== 'neutral') urgency += 10;

    // Anomaly urgency
    const highSeverityAnomalies = anomalies.filter(a => a.severity === 'high').length;
    const mediumSeverityAnomalies = anomalies.filter(a => a.severity === 'medium').length;
    urgency += highSeverityAnomalies * 15;
    urgency += mediumSeverityAnomalies * 5;

    // Liquidity urgency (high liquidity = more reliable)
    if (market.liquidity > 20000) urgency += 10;
    else if (market.liquidity > 10000) urgency += 5;

    return Math.min(100, urgency);
  }

  /**
   * Get average volume for a market
   */
  getAverageVolume(marketId) {
    const history = this.volumeHistory.get(marketId) || [];
    if (history.length === 0) return 0;
    return history.reduce((sum, v) => sum + v, 0) / history.length;
  }

  /**
   * Update volume history
   */
  updateVolumeHistory(marketId, volume) {
    if (!this.volumeHistory.has(marketId)) {
      this.volumeHistory.set(marketId, []);
    }
    const history = this.volumeHistory.get(marketId);
    history.push(volume);
    if (history.length > this.maxHistoryLength) {
      history.shift();
    }
  }

  /**
   * Clean up old data
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    // Clean price history
    for (const [marketId, history] of this.priceHistory.entries()) {
      const filtered = history.filter(h => (now - h.time) < maxAge);
      if (filtered.length === 0) {
        this.priceHistory.delete(marketId);
      } else {
        this.priceHistory.set(marketId, filtered);
      }
    }

    // Clean volume history (keep last 100 entries max)
    for (const [marketId, history] of this.volumeHistory.entries()) {
      if (history.length > 100) {
        this.volumeHistory.set(marketId, history.slice(-100));
      }
    }
  }

  /**
   * Get market insights
   */
  getInsights(market) {
    const trend = this.detectTrend(market);
    const anomalies = this.detectAnomalies(market, trend);
    const urgency = this.calculateUrgency(market, trend, anomalies);

    this.updateVolumeHistory(market.marketId, market.volume24h || 0);

    return {
      trend,
      anomalies,
      urgency,
      summary: this.generateSummary(market, trend, anomalies, urgency)
    };
  }

  generateSummary(market, trend, anomalies, urgency) {
    const parts = [];
    
    if (trend && trend.trend !== 'neutral' && trend.confidence > 50) {
      parts.push(`${trend.trend === 'strong_up' || trend.trend === 'up' ? '📈' : '📉'} ${trend.trend.replace('_', ' ')} trend (${trend.confidence.toFixed(0)}% confidence)`);
    }
    
    if (anomalies.length > 0) {
      const highSeverity = anomalies.filter(a => a.severity === 'high');
      if (highSeverity.length > 0) {
        parts.push(`⚠️ ${highSeverity.length} high-priority anomaly(ies)`);
      }
    }
    
    if (urgency > 70) {
      parts.push('🔥 High urgency - monitor closely');
    } else if (urgency > 50) {
      parts.push('⚡ Moderate urgency');
    }

    return parts.join(' • ') || 'Standard market conditions';
  }
}

module.exports = { MarketIntelligence };











