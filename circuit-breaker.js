'use strict';

/**
 * Circuit Breaker pattern for resilient API calls
 * Prevents cascading failures and allows quick recovery
 */

class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'unknown';
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.monitoringWindow = options.monitoringWindow || 60000; // 1 minute
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.successCount = 0;
    this.recentFailures = [];
  }

  async execute(fn, fallback = null) {
    // Clean old failures outside monitoring window
    const now = Date.now();
    this.recentFailures = this.recentFailures.filter(
      f => (now - f.time) < this.monitoringWindow
    );

    // Check if we should attempt
    if (this.state === 'OPEN') {
      if (now < this.nextAttemptTime) {
        // Circuit is open - use fallback if available, don't throw error
        if (fallback) {
          try {
            return await fallback();
          } catch (fallbackError) {
            // Fallback failed too, return empty (don't throw)
            return null;
          }
        }
        return null; // Return null instead of throwing
      }
      // Try half-open
      this.state = 'HALF_OPEN';
      this.successCount = 0;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      
      // If we have a fallback, use it (don't throw error)
      if (fallback) {
        try {
          return await fallback();
        } catch (fallbackError) {
          // Fallback failed too, return empty array (expected behavior)
          return [];
        }
      }
      
      // No fallback - return empty array instead of throwing
      return [];
    }
  }

  onSuccess() {
    this.failures = 0;
    this.recentFailures = [];
    
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 2) {
        // Need 2 successes to fully close
        this.state = 'CLOSED';
        this.successCount = 0;
      }
    } else {
      this.state = 'CLOSED';
    }
  }

  onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    this.recentFailures.push({ time: Date.now() });
    
    // Check if we should open the circuit
    const recentFailureCount = this.recentFailures.length;
    if (recentFailureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.resetTimeout;
    }
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      recentFailures: this.recentFailures.length,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime
    };
  }

  reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.recentFailures = [];
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }
}

module.exports = { CircuitBreaker };

