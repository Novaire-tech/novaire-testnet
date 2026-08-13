import { describe, it, expect, vi, beforeEach } from 'vitest';

// protocolService dynamically imports these by relative path — mock each one so
// getProtocolState never touches the network in tests.
vi.mock('../../../../packages/bindings/pt_token/src/index', () => ({
  Client: function () {
    return { total_supply: () => Promise.resolve({ result: { unwrap: () => 1000000000n } }) };
  },
}));
vi.mock('../../../../packages/bindings/yt_token/src/index', () => ({
  Client: function () {
    return { total_supply: () => Promise.resolve({ result: { unwrap: () => 1000000000n } }) };
  },
}));
vi.mock('../../../../packages/bindings/sy_wrapper/src/index', () => ({
  Client: function () {
    return {
      total_supply: () => Promise.resolve({ result: { unwrap: () => 5000000000n } }),
      exchange_rate: () => Promise.resolve({ result: { unwrap: () => 1000000000000000000n } }),
    };
  },
}));

let twapImpl: () => Promise<{ result: { unwrap: () => bigint } }> = () => Promise.resolve({ result: { unwrap: () => 9000000000000000n } });
vi.mock('../../../../packages/bindings/amm/src/index', () => ({
  Client: function () {
    return {
      reserve_pt: () => Promise.resolve({ result: { unwrap: () => 1000000000n } }),
      reserve_sy: () => Promise.resolve({ result: { unwrap: () => 2000000000n } }),
      spot_apy: () => Promise.resolve({ result: { unwrap: () => 9000000000000000n } }),
      twap_apy: () => twapImpl(),
      quote_pt_for_sy: () => Promise.resolve({ result: { unwrap: () => 9000000n } }),
    };
  },
}));
vi.mock('../config/contracts', () => ({
  CONTRACTS: { PT_TOKEN: 'a', YT_TOKEN: 'b', SY_WRAPPER: 'c', AMM: 'd', TOKENIZER: 'e' },
  RPC_URL: 'http://localhost',
  NETWORK_PASSPHRASE: 'test',
}));
vi.mock('./yieldService', () => ({
  YieldService: {
    getActiveMaturityTimestampMs: vi.fn().mockResolvedValue(Date.now() + 30 * 24 * 60 * 60 * 1000),
    getEpochStartIndex: vi.fn().mockResolvedValue(1),
  },
}));

let oracleImpl: () => Promise<{ priceUsd: number } | null> = () => Promise.resolve({ priceUsd: 0.42 });
vi.mock('./priceOracleService', () => ({
  PriceOracleService: {
    getAssetPrice: vi.fn().mockImplementation(() => oracleImpl()),
  },
}));

import { ProtocolService } from './protocolService';

describe('ProtocolService.getProtocolState — price oracle safety', () => {
  beforeEach(() => {
    oracleImpl = () => Promise.resolve({ priceUsd: 0.42 });
    twapImpl = () => Promise.resolve({ result: { unwrap: () => 9000000000000000n } });
  });

  it('never fabricates a price when the oracle throws', async () => {
    oracleImpl = () => Promise.reject(new Error('oracle down'));
    const state = await ProtocolService.getProtocolState();
    expect(state.priceUnavailable).toBe(true);
    expect(state.tvlUsd).toBe(0);
  });

  it('never fabricates a price when the oracle returns null', async () => {
    oracleImpl = () => Promise.resolve(null);
    const state = await ProtocolService.getProtocolState();
    expect(state.priceUnavailable).toBe(true);
    expect(state.tvlUsd).toBe(0);
  });

  it('never fabricates a price when priceUsd is zero/non-positive', async () => {
    oracleImpl = () => Promise.resolve({ priceUsd: 0 });
    const state = await ProtocolService.getProtocolState();
    expect(state.priceUnavailable).toBe(true);
    expect(state.tvlUsd).toBe(0);
  });

  it('computes tvlUsd only when a live price is available', async () => {
    const state = await ProtocolService.getProtocolState();
    expect(state.priceUnavailable).toBe(false);
    expect(state.tvlUsd).toBeGreaterThan(0);
  });
});

describe('ProtocolService.getProtocolState — TWAP freshness safety', () => {
  beforeEach(() => {
    oracleImpl = () => Promise.resolve({ priceUsd: 0.42 });
    twapImpl = () => Promise.resolve({ result: { unwrap: () => 9000000000000000n } });
  });

  it('never derives an implied APY when amm.twap_apy() reverts (stale TWAP)', async () => {
    twapImpl = () => Promise.reject(new Error('HostError: Error(Contract, #InvariantViolated)'));
    const state = await ProtocolService.getProtocolState();
    expect(state.twapStale).toBe(true);
    expect(state.impliedYieldApy).toBe(0);
  });

  it('derives an implied APY when the TWAP checkpoint is fresh', async () => {
    const state = await ProtocolService.getProtocolState();
    expect(state.twapStale).toBe(false);
  });
});
