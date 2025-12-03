'use strict';

/**
 * Health monitoring and metrics collection
 * Tracks bot performance, API health, and operational stats
 */

class HealthMonitor {
  constructor() {
    this.metrics = {
      startTime: Date.now(),
      scans: {
        total: 0,
        successful: 0,
        failed: 0,
        lastScanTime: null,
        lastScanDuration: null,
        averageDuration: 0
      },
      markets: {
        totalProcessed: 0,
        totalAlerts: 0,
        bySource: {
          polymarket: { fetched: 0, alerts: 0 },
          kalshi: { fetched: 0, alerts: 0 }
        },
        byBucket: {
          '1H': 0,
          '24H': 0,
          '7D': 0
        }
      },
      apiHealth: {
        polymarket: {
          success: 0,
          failures: 0,
          rateLimited: 0,
          lastSuccess: null,
          lastFailure: null,
          avgResponseTime: 0,
          responseTimes: []
        },
        kalshi: {
          success: 0,
          failures: 0,
          rateLimited: 0,
          lastSuccess: null,
          lastFailure: null,
          avgResponseTime: 0,
          responseTimes: []
        }
      },
      errors: {
        total: 0,
        byType: {}
      },
      uptime: {
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        totalMs: 0,
        formatted: '0h 0m'
      }
    };
    this.responseTimeWindow = 100; // Keep last 100 response times
  }

  recordScan(duration, success, stats) {
    this.metrics.scans.total++;
    if (success) {
      this.metrics.scans.successful++;
    } else {
      this.metrics.scans.failed++;
    }
    this.metrics.scans.lastScanTime = Date.now();
    this.metrics.scans.lastScanDuration = duration;
    
    // Calculate rolling average
    const total = this.metrics.scans.successful;
    const currentAvg = this.metrics.scans.averageDuration;
    this.metrics.scans.averageDuration = 
      ((currentAvg * (total - 1)) + duration) / total;

    if (stats) {
      this.metrics.markets.totalProcessed += stats.considered || 0;
      this.metrics.markets.totalAlerts += stats.alerted || 0;
    }
  }

  recordApiCall(source, success, duration, rateLimited = false) {
    const api = this.metrics.apiHealth[source];
    if (!api) return;

    if (rateLimited) {
      api.rateLimited++;
      api.lastFailure = Date.now();
      this.metrics.errors.total++;
    } else if (success) {
      api.success++;
      api.lastSuccess = Date.now();
      
      if (duration) {
        api.responseTimes.push(duration);
        if (api.responseTimes.length > this.responseTimeWindow) {
          api.responseTimes.shift();
        }
        api.avgResponseTime = 
          api.responseTimes.reduce((a, b) => a + b, 0) / api.responseTimes.length;
      }
    } else {
      api.failures++;
      api.lastFailure = Date.now();
      this.metrics.errors.total++;
    }
  }

  recordMarket(source, bucket) {
    if (this.metrics.markets.bySource[source]) {
      this.metrics.markets.bySource[source].fetched++;
    }
    if (bucket && this.metrics.markets.byBucket[bucket]) {
      this.metrics.markets.byBucket[bucket]++;
    }
  }

  recordAlert(source) {
    if (this.metrics.markets.bySource[source]) {
      this.metrics.markets.bySource[source].alerts++;
    }
  }

  recordError(type, message) {
    this.metrics.errors.total++;
    if (!this.metrics.errors.byType[type]) {
      this.metrics.errors.byType[type] = 0;
    }
    this.metrics.errors.byType[type]++;
  }

  updateUptime() {
    const ms = Date.now() - this.metrics.startTime;
    const totalSeconds = Math.floor(ms / 1000);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    const days = Math.floor(totalHours / 24);
    
    this.metrics.uptime = {
      days: days,
      hours: totalHours % 24,
      minutes: totalMinutes % 60,
      seconds: totalSeconds % 60,
      totalMs: ms,
      formatted: days > 0 
        ? `${days}d ${totalHours % 24}h ${totalMinutes % 60}m`
        : `${totalHours % 24}h ${totalMinutes % 60}m`
    };
  }

  getHealth() {
    this.updateUptime();
    return {
      status: this.getOverallStatus(),
      uptime: this.metrics.uptime,
      metrics: { ...this.metrics }
    };
  }

  getOverallStatus() {
    const apiPolymarket = this.metrics.apiHealth.polymarket;
    const apiKalshi = this.metrics.apiHealth.kalshi;
    const recentFailures = apiPolymarket.failures + apiKalshi.failures;
    const totalCalls = apiPolymarket.success + apiPolymarket.failures + 
                       apiKalshi.success + apiKalshi.failures;

    if (recentFailures === 0 && totalCalls > 0) return 'healthy';
    if (apiPolymarket.success > 0) return 'degraded'; // At least one source works
    return 'unhealthy';
  }

  getStatsSummary() {
    this.updateUptime();
    const apiP = this.metrics.apiHealth.polymarket;
    const apiK = this.metrics.apiHealth.kalshi;
    
    return {
      uptime: this.metrics.uptime.formatted || `${this.metrics.uptime.hours || 0}h ${this.metrics.uptime.minutes || 0}m`,
      scans: {
        total: this.metrics.scans.total,
        successful: this.metrics.scans.successful,
        failed: this.metrics.scans.failed,
        successRate: this.metrics.scans.total > 0 
          ? ((this.metrics.scans.successful / this.metrics.scans.total) * 100).toFixed(1) + '%'
          : '0%',
        avgDuration: Math.round(this.metrics.scans.averageDuration) + 'ms'
      },
      markets: {
        processed: this.metrics.markets.totalProcessed,
        alerts: this.metrics.markets.totalAlerts,
        bySource: {
          polymarket: {
            fetched: apiP.success > 0 ? '✅' : '❌',
            alerts: this.metrics.markets.bySource.polymarket.alerts
          },
          kalshi: {
            fetched: apiK.success > 0 ? '✅' : '❌',
            alerts: this.metrics.markets.bySource.kalshi.alerts
          }
        }
      },
      apiHealth: {
        polymarket: {
          status: apiP.lastSuccess && (!apiP.lastFailure || apiP.lastSuccess > apiP.lastFailure) ? '✅ Healthy' : '❌ Down',
          successRate: (apiP.success + apiP.failures) > 0
            ? ((apiP.success / (apiP.success + apiP.failures)) * 100).toFixed(1) + '%'
            : 'N/A',
          avgResponseTime: Math.round(apiP.avgResponseTime) + 'ms',
          rateLimited: apiP.rateLimited > 0 ? `⚠️ ${apiP.rateLimited} times` : '✅ None'
        },
        kalshi: {
          status: apiK.lastSuccess && (!apiK.lastFailure || apiK.lastSuccess > apiK.lastFailure) ? '✅ Healthy' : '❌ Down',
          successRate: (apiK.success + apiK.failures) > 0
            ? ((apiK.success / (apiK.success + apiK.failures)) * 100).toFixed(1) + '%'
            : 'N/A',
          avgResponseTime: Math.round(apiK.avgResponseTime) + 'ms',
          rateLimited: apiK.rateLimited > 0 ? `⚠️ ${apiK.rateLimited} times` : '✅ None'
        }
      },
      errors: {
        total: this.metrics.errors.total,
        byType: this.metrics.errors.byType
      }
    };
  }
}

module.exports = { HealthMonitor };






