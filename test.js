'use strict';

const { expect } = require('chai');

const {
  calculateConfidenceScore,
  bucketMarket,
  isMarketEligible,
  SCORING_DEFAULTS
} = require('./utils');

describe('scoring + filtering utilities', () => {
  describe('calculateConfidenceScore', () => {
    it('awards higher score to liquid, imminent markets', () => {
      const imminent = calculateConfidenceScore(
        {
          liquidity: 15000,
          volume24h: 25000,
          priceChange1h: 0.18,
          timeToResolveMs: 30 * 60 * 1000,
          spread: 0.04
        },
        {}
      );

      const distant = calculateConfidenceScore(
        {
          liquidity: 500,
          volume24h: 1200,
          priceChange1h: 0.01,
          timeToResolveMs: 5 * 24 * 60 * 60 * 1000,
          spread: 0.25
        },
        {}
      );

      expect(imminent.total).to.be.greaterThan(distant.total);
      expect(imminent.total).to.be.at.most(100);
      expect(imminent.breakdown.time).to.be.greaterThan(0);
    });

    it('respects scoring overrides', () => {
      const baseline = calculateConfidenceScore(
        {
          liquidity: 2000,
          volume24h: 2000,
          priceChange1h: 0.08,
          timeToResolveMs: 2 * 60 * 60 * 1000,
          spread: 0.08
        },
        {}
      );

      const overrides = calculateConfidenceScore(
        {
          liquidity: 2000,
          volume24h: 2000,
          priceChange1h: 0.08,
          timeToResolveMs: 2 * 60 * 60 * 1000,
          spread: 0.08
        },
        {
          liquidity: { benchmark: 1000 },
          price: { baseline: 0.05 }
        }
      );

      expect(overrides.total).to.be.greaterThan(baseline.total);
    });
  });

  describe('bucketMarket', () => {
    it('classifies 30-minute market as 1H bucket', () => {
      expect(bucketMarket(30 * 60 * 1000)).to.equal('1H');
    });

    it('classifies 6-hour market as 24H bucket', () => {
      expect(bucketMarket(6 * 60 * 60 * 1000)).to.equal('24H');
    });

    it('classifies 5-day market as 7D bucket', () => {
      expect(bucketMarket(5 * 24 * 60 * 60 * 1000)).to.equal('7D');
    });

    it('returns null for markets beyond 7 days', () => {
      expect(bucketMarket(9 * 24 * 60 * 60 * 1000)).to.equal(null);
    });
  });

  describe('isMarketEligible', () => {
    const thresholds = {
      minConfidence: 60,
      minLiquidity: 500,
      maxMarketAgeMinutes: 1440,
      maxResolutionMs: 7 * 24 * 60 * 60 * 1000
    };

    it('accepts markets meeting all thresholds', () => {
      const market = {
        confidence: 75,
        liquidity: 600,
        bucket: '24H',
        timeToResolveMs: 12 * 60 * 60 * 1000,
        createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString()
      };
      expect(isMarketEligible(market, thresholds)).to.equal(true);
    });

    it('rejects markets below liquidity', () => {
      const market = {
        confidence: 80,
        liquidity: 100,
        bucket: '24H',
        timeToResolveMs: 12 * 60 * 60 * 1000
      };
      expect(isMarketEligible(market, thresholds)).to.equal(false);
    });

    it('rejects markets outside max resolution window', () => {
      const market = {
        confidence: 90,
        liquidity: 800,
        bucket: null,
        timeToResolveMs: 10 * 24 * 60 * 60 * 1000
      };
      expect(isMarketEligible(market, thresholds)).to.equal(false);
    });
  });
});