'use strict';

/**
 * Usage Metrics Tracker
 * Tracks usage metrics for all bot tools/features for pricing and growth analysis
 * 
 * Metrics tracked per tool:
 * - queries/day
 * - cost/query
 * - active users
 * - error rate
 * - response time
 * - top features used
 */

const fs = require('fs');
const path = require('path');

class UsageMetrics {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(__dirname, 'data');
    this.metricsFile = path.join(this.dataDir, 'usage-metrics.json');
    this.dailyResetHour = options.dailyResetHour || 0; // Midnight UTC
    
    // Initialize data structure
    this.metrics = this.loadMetrics();
    
    // Ensure data directory exists
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    
    // Cost configuration per tool (can be overridden via config)
    this.costConfig = options.costConfig || {
      scan: { costPerQuery: 0.001 }, // $0.001 per scan
      config: { costPerQuery: 0 },
      testalert: { costPerQuery: 0.0001 },
      stats: { costPerQuery: 0 },
      health: { costPerQuery: 0 },
      trends: { costPerQuery: 0 },
      scheduled_scan: { costPerQuery: 0.001 },
      market_alert: { costPerQuery: 0.0005 }, // $0.0005 per alert sent
      api_polymarket: { costPerQuery: 0.0002 }, // $0.0002 per API call
      api_kalshi: { costPerQuery: 0.0002 }
    };
    
    // Initialize today's date key
    this.todayKey = this.getTodayKey();
    
    // Cleanup old data (keep last 90 days)
    this.cleanupOldData();
  }

  /**
   * Get today's date key (YYYY-MM-DD)
   */
  getTodayKey() {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  /**
   * Load metrics from file or initialize
   */
  loadMetrics() {
    if (fs.existsSync(this.metricsFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.metricsFile, 'utf8'));
        return data;
      } catch (err) {
        console.error('Failed to load metrics file, initializing new:', err.message);
      }
    }
    
    return {
      daily: {}, // { '2024-01-01': { toolName: {...} } }
      allTime: {}, // { toolName: {...} }
      lastReset: new Date().toISOString()
    };
  }

  /**
   * Save metrics to file
   */
  saveMetrics() {
    try {
      fs.writeFileSync(this.metricsFile, JSON.stringify(this.metrics, null, 2));
    } catch (err) {
      console.error('Failed to save metrics:', err.message);
    }
  }

  /**
   * Initialize tool metrics structure
   */
  initToolMetrics(toolName) {
    return {
      queries: 0,
      successful: 0,
      failed: 0,
      totalCost: 0,
      totalResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      activeUsers: new Set(),
      errors: [],
      lastUsed: null,
      firstUsed: null
    };
  }

  /**
   * Get or create tool metrics for today
   */
  getTodayToolMetrics(toolName) {
    const today = this.getTodayKey();
    
    if (!this.metrics.daily[today]) {
      this.metrics.daily[today] = {};
    }
    
    if (!this.metrics.daily[today][toolName]) {
      this.metrics.daily[today][toolName] = this.initToolMetrics(toolName);
    }
    
    // Convert Set to Array for JSON serialization
    const metrics = this.metrics.daily[today][toolName];
    if (metrics.activeUsers && !Array.isArray(metrics.activeUsers)) {
      metrics.activeUsers = Array.from(metrics.activeUsers);
    }
    if (Array.isArray(metrics.activeUsers)) {
      metrics.activeUsers = new Set(metrics.activeUsers);
    }
    
    return metrics;
  }

  /**
   * Get or create all-time tool metrics
   */
  getAllTimeToolMetrics(toolName) {
    if (!this.metrics.allTime[toolName]) {
      this.metrics.allTime[toolName] = this.initToolMetrics(toolName);
    }
    
    const metrics = this.metrics.allTime[toolName];
    if (metrics.activeUsers && !Array.isArray(metrics.activeUsers)) {
      metrics.activeUsers = Array.from(metrics.activeUsers);
    }
    if (Array.isArray(metrics.activeUsers)) {
      metrics.activeUsers = new Set(metrics.activeUsers);
    }
    
    return metrics;
  }

  /**
   * Record a tool usage
   */
  recordUsage(toolName, options = {}) {
    const {
      userId = null,
      success = true,
      error = null,
      responseTime = 0,
      metadata = {}
    } = options;

    const today = this.getTodayKey();
    const todayMetrics = this.getTodayToolMetrics(toolName);
    const allTimeMetrics = this.getAllTimeToolMetrics(toolName);
    
    // Get cost per query
    const costConfig = this.costConfig[toolName] || { costPerQuery: 0 };
    const cost = costConfig.costPerQuery || 0;
    
    // Update today's metrics
    todayMetrics.queries++;
    if (success) {
      todayMetrics.successful++;
    } else {
      todayMetrics.failed++;
      if (error) {
        todayMetrics.errors.push({
          timestamp: new Date().toISOString(),
          error: error.message || String(error),
          metadata
        });
        // Keep only last 100 errors
        if (todayMetrics.errors.length > 100) {
          todayMetrics.errors.shift();
        }
      }
    }
    
    todayMetrics.totalCost += cost;
    todayMetrics.totalResponseTime += responseTime;
    todayMetrics.minResponseTime = Math.min(todayMetrics.minResponseTime, responseTime);
    todayMetrics.maxResponseTime = Math.max(todayMetrics.maxResponseTime, responseTime);
    
    if (userId) {
      todayMetrics.activeUsers.add(userId);
    }
    
    const now = new Date().toISOString();
    todayMetrics.lastUsed = now;
    if (!todayMetrics.firstUsed) {
      todayMetrics.firstUsed = now;
    }
    
    // Update all-time metrics
    allTimeMetrics.queries++;
    if (success) {
      allTimeMetrics.successful++;
    } else {
      allTimeMetrics.failed++;
    }
    
    allTimeMetrics.totalCost += cost;
    allTimeMetrics.totalResponseTime += responseTime;
    allTimeMetrics.minResponseTime = Math.min(allTimeMetrics.minResponseTime, responseTime);
    allTimeMetrics.maxResponseTime = Math.max(allTimeMetrics.maxResponseTime, responseTime);
    
    if (userId) {
      allTimeMetrics.activeUsers.add(userId);
    }
    
    allTimeMetrics.lastUsed = now;
    if (!allTimeMetrics.firstUsed) {
      allTimeMetrics.firstUsed = now;
    }
    
    // Save to disk
    this.saveMetrics();
  }

  /**
   * Get today's metrics for a tool
   */
  getTodayMetrics(toolName) {
    const today = this.getTodayKey();
    const toolMetrics = this.metrics.daily[today]?.[toolName];
    
    if (!toolMetrics) {
      return null;
    }
    
    return this.formatToolMetrics(toolMetrics, toolName);
  }

  /**
   * Get all-time metrics for a tool
   */
  getAllTimeMetrics(toolName) {
    const toolMetrics = this.metrics.allTime[toolName];
    
    if (!toolMetrics) {
      return null;
    }
    
    return this.formatToolMetrics(toolMetrics, toolName);
  }

  /**
   * Format tool metrics for display
   */
  formatToolMetrics(metrics, toolName) {
    const costConfig = this.costConfig[toolName] || { costPerQuery: 0 };
    const avgResponseTime = metrics.queries > 0 
      ? metrics.totalResponseTime / metrics.queries 
      : 0;
    const errorRate = metrics.queries > 0
      ? (metrics.failed / metrics.queries) * 100
      : 0;
    const activeUsersCount = metrics.activeUsers instanceof Set
      ? metrics.activeUsers.size
      : (Array.isArray(metrics.activeUsers) ? metrics.activeUsers.length : 0);
    
    return {
      toolName,
      queries: metrics.queries,
      queriesPerDay: metrics.queries, // For today, this is queries today
      costPerQuery: costConfig.costPerQuery,
      totalCost: metrics.totalCost,
      activeUsers: activeUsersCount,
      errorRate: errorRate.toFixed(2) + '%',
      avgResponseTime: Math.round(avgResponseTime) + 'ms',
      minResponseTime: metrics.minResponseTime === Infinity ? 0 : Math.round(metrics.minResponseTime) + 'ms',
      maxResponseTime: Math.round(metrics.maxResponseTime) + 'ms',
      successRate: metrics.queries > 0 
        ? ((metrics.successful / metrics.queries) * 100).toFixed(2) + '%'
        : '0%',
      lastUsed: metrics.lastUsed,
      firstUsed: metrics.firstUsed
    };
  }

  /**
   * Get metrics for all tools for today
   */
  getTodayAllTools() {
    const today = this.getTodayKey();
    const todayData = this.metrics.daily[today] || {};
    const result = {};
    
    for (const [toolName, metrics] of Object.entries(todayData)) {
      result[toolName] = this.formatToolMetrics(metrics, toolName);
    }
    
    return result;
  }

  /**
   * Get metrics for all tools (all-time)
   */
  getAllTimeAllTools() {
    const result = {};
    
    for (const [toolName, metrics] of Object.entries(this.metrics.allTime)) {
      result[toolName] = this.formatToolMetrics(metrics, toolName);
    }
    
    return result;
  }

  /**
   * Get top features by usage (today)
   */
  getTopFeaturesToday(limit = 10) {
    const today = this.getTodayKey();
    const todayData = this.metrics.daily[today] || {};
    const tools = Object.entries(todayData)
      .map(([toolName, metrics]) => ({
        toolName,
        queries: metrics.queries,
        ...this.formatToolMetrics(metrics, toolName)
      }))
      .sort((a, b) => b.queries - a.queries)
      .slice(0, limit);
    
    return tools;
  }

  /**
   * Get top features by usage (all-time)
   */
  getTopFeaturesAllTime(limit = 10) {
    const tools = Object.entries(this.metrics.allTime)
      .map(([toolName, metrics]) => ({
        toolName,
        queries: metrics.queries,
        ...this.formatToolMetrics(metrics, toolName)
      }))
      .sort((a, b) => b.queries - a.queries)
      .slice(0, limit);
    
    return tools;
  }

  /**
   * Get daily summary for a date range
   */
  getDailySummary(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const summary = {};
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().split('T')[0];
      const dayData = this.metrics.daily[dateKey];
      
      if (dayData) {
        let totalQueries = 0;
        let totalCost = 0;
        let totalUsers = new Set();
        
        for (const [toolName, metrics] of Object.entries(dayData)) {
          totalQueries += metrics.queries;
          totalCost += metrics.totalCost;
          if (metrics.activeUsers instanceof Set) {
            metrics.activeUsers.forEach(u => totalUsers.add(u));
          } else if (Array.isArray(metrics.activeUsers)) {
            metrics.activeUsers.forEach(u => totalUsers.add(u));
          }
        }
        
        summary[dateKey] = {
          date: dateKey,
          totalQueries,
          totalCost: totalCost.toFixed(4),
          activeUsers: totalUsers.size,
          tools: Object.keys(dayData).length
        };
      }
    }
    
    return summary;
  }

  /**
   * Cleanup old data (keep last 90 days)
   */
  cleanupOldData() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    
    const datesToRemove = [];
    for (const dateKey of Object.keys(this.metrics.daily)) {
      const date = new Date(dateKey);
      if (date < cutoffDate) {
        datesToRemove.push(dateKey);
      }
    }
    
    for (const dateKey of datesToRemove) {
      delete this.metrics.daily[dateKey];
    }
    
    if (datesToRemove.length > 0) {
      this.saveMetrics();
    }
  }

  /**
   * Get comprehensive metrics report
   */
  getMetricsReport(period = 'today') {
    if (period === 'today') {
      return {
        period: 'today',
        date: this.getTodayKey(),
        tools: this.getTodayAllTools(),
        topFeatures: this.getTopFeaturesToday(),
        summary: this.getTodaySummary()
      };
    } else if (period === 'all-time') {
      return {
        period: 'all-time',
        tools: this.getAllTimeAllTools(),
        topFeatures: this.getTopFeaturesAllTime(),
        summary: this.getAllTimeSummary()
      };
    }
    
    return null;
  }

  /**
   * Get today's summary
   */
  getTodaySummary() {
    const today = this.getTodayKey();
    const todayData = this.metrics.daily[today] || {};
    
    let totalQueries = 0;
    let totalCost = 0;
    let totalUsers = new Set();
    let totalErrors = 0;
    let totalResponseTime = 0;
    
    for (const metrics of Object.values(todayData)) {
      totalQueries += metrics.queries;
      totalCost += metrics.totalCost;
      totalErrors += metrics.failed;
      totalResponseTime += metrics.totalResponseTime;
      
      if (metrics.activeUsers instanceof Set) {
        metrics.activeUsers.forEach(u => totalUsers.add(u));
      } else if (Array.isArray(metrics.activeUsers)) {
        metrics.activeUsers.forEach(u => totalUsers.add(u));
      }
    }
    
    return {
      totalQueries,
      totalCost: totalCost.toFixed(4),
      activeUsers: totalUsers.size,
      totalErrors,
      errorRate: totalQueries > 0 ? ((totalErrors / totalQueries) * 100).toFixed(2) + '%' : '0%',
      avgResponseTime: totalQueries > 0 ? Math.round(totalResponseTime / totalQueries) + 'ms' : '0ms',
      toolsUsed: Object.keys(todayData).length
    };
  }

  /**
   * Get all-time summary
   */
  getAllTimeSummary() {
    let totalQueries = 0;
    let totalCost = 0;
    let totalUsers = new Set();
    let totalErrors = 0;
    let totalResponseTime = 0;
    
    for (const metrics of Object.values(this.metrics.allTime)) {
      totalQueries += metrics.queries;
      totalCost += metrics.totalCost;
      totalErrors += metrics.failed;
      totalResponseTime += metrics.totalResponseTime;
      
      if (metrics.activeUsers instanceof Set) {
        metrics.activeUsers.forEach(u => totalUsers.add(u));
      } else if (Array.isArray(metrics.activeUsers)) {
        metrics.activeUsers.forEach(u => totalUsers.add(u));
      }
    }
    
    return {
      totalQueries,
      totalCost: totalCost.toFixed(4),
      activeUsers: totalUsers.size,
      totalErrors,
      errorRate: totalQueries > 0 ? ((totalErrors / totalQueries) * 100).toFixed(2) + '%' : '0%',
      avgResponseTime: totalQueries > 0 ? Math.round(totalResponseTime / totalQueries) + 'ms' : '0ms',
      toolsUsed: Object.keys(this.metrics.allTime).length
    };
  }

  /**
   * Update cost configuration
   */
  updateCostConfig(toolName, costPerQuery) {
    if (!this.costConfig[toolName]) {
      this.costConfig[toolName] = {};
    }
    this.costConfig[toolName].costPerQuery = costPerQuery;
  }
}

module.exports = { UsageMetrics };

