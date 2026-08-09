import { describe, it, expect } from 'vitest';
import { calculateMarketImpliedApy } from './apy';

describe('calculateMarketImpliedApy', () => {
  it('matches known example: PT=0.95, Face=1.00, 180 days ~= 10.96%', () => {
    const maturityMs = Date.now() + 180 * 24 * 60 * 60 * 1000;
    const apy = calculateMarketImpliedApy(0.95, 1.0, maturityMs);
    expect(apy).toBeCloseTo(10.96, 1);
  });

  it('returns 0 when PT price is non-positive', () => {
    const maturityMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
    expect(calculateMarketImpliedApy(0, 1.0, maturityMs)).toBe(0);
    expect(calculateMarketImpliedApy(-1, 1.0, maturityMs)).toBe(0);
  });

  it('returns 0 past maturity', () => {
    const maturityMs = Date.now() - 1000;
    expect(calculateMarketImpliedApy(0.95, 1.0, maturityMs)).toBe(0);
  });

  it('returns 0 when PT trades above face value', () => {
    const maturityMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
    expect(calculateMarketImpliedApy(1.05, 1.0, maturityMs)).toBe(0);
  });

  it('clamps days remaining to a 1-day minimum to avoid astronomical spikes', () => {
    const maturityMs = Date.now() + 1000; // ~1ms remaining
    const apy = calculateMarketImpliedApy(0.95, 1.0, maturityMs);
    expect(isFinite(apy)).toBe(true);
  });
});
