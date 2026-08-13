import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { HistoryStore } from './historyStore';

const STORE_PATH = path.join(process.cwd(), 'history-store.json');

function baseEntry(overrides: Partial<Parameters<typeof HistoryStore.addHistoryEntry>[0]> = {}) {
  return {
    network: 'TESTNET',
    syWrapper: 'SY_A',
    ptPrice: 0.5,
    ytPrice: 0.5,
    tvl: 1000,
    fixedApy: 5,
    tradingVolume: 0,
    syExchangeRate: 1.0,
    ptBalance: 0,
    ytBalance: 0,
    xlmBalance: 0,
    walletAssetsUsd: 0,
    vaultLpUsd: 0,
    claimableYield: 0,
    portfolioValue: 0,
    positionValue: 0,
    eventType: null,
    txHash: null,
    ...overrides,
  };
}

beforeEach(() => {
  if (fs.existsSync(STORE_PATH)) fs.unlinkSync(STORE_PATH);
});

afterEach(() => {
  if (fs.existsSync(STORE_PATH)) fs.unlinkSync(STORE_PATH);
});

describe('HistoryStore scoping and validation', () => {
  it('rejects entries missing network/syWrapper identity', () => {
    const result = HistoryStore.addHistoryEntry(baseEntry({ network: '', syWrapper: '' }));
    expect(result).toBeNull();
  });

  it('never mixes different networks', () => {
    HistoryStore.addHistoryEntry(baseEntry({ network: 'TESTNET' }));
    HistoryStore.addHistoryEntry(baseEntry({ network: 'MAINNET', syExchangeRate: 1.1 }));
    expect(HistoryStore.getHistory('TESTNET', 'SY_A')).toHaveLength(1);
    expect(HistoryStore.getHistory('MAINNET', 'SY_A')).toHaveLength(1);
  });

  it('never mixes different SY wrappers (redeployed epochs)', () => {
    HistoryStore.addHistoryEntry(baseEntry({ syWrapper: 'SY_OLD_EPOCH' }));
    HistoryStore.addHistoryEntry(baseEntry({ syWrapper: 'SY_NEW_EPOCH', syExchangeRate: 1.2 }));
    expect(HistoryStore.getHistory('TESTNET', 'SY_OLD_EPOCH')).toHaveLength(1);
    expect(HistoryStore.getHistory('TESTNET', 'SY_NEW_EPOCH')).toHaveLength(1);
  });

  it('deduplicates identical consecutive snapshots within a scope', () => {
    HistoryStore.addHistoryEntry(baseEntry());
    const second = HistoryStore.addHistoryEntry(baseEntry());
    expect(second).toBeNull();
    expect(HistoryStore.getHistory('TESTNET', 'SY_A')).toHaveLength(1);
  });

  it('rejects implausible exchange-rate jumps as corrupted data', () => {
    HistoryStore.addHistoryEntry(baseEntry({ syExchangeRate: 1.0 }));
    const jumped = HistoryStore.addHistoryEntry(baseEntry({ syExchangeRate: 3.0, portfolioValue: 1 }));
    expect(jumped).toBeNull();
    expect(HistoryStore.getHistory('TESTNET', 'SY_A')).toHaveLength(1);
  });

  it('accepts a legitimate rate change within a scope', () => {
    HistoryStore.addHistoryEntry(baseEntry({ syExchangeRate: 1.0 }));
    const grown = HistoryStore.addHistoryEntry(baseEntry({ syExchangeRate: 1.02, portfolioValue: 1 }));
    expect(grown).not.toBeNull();
    expect(HistoryStore.getHistory('TESTNET', 'SY_A')).toHaveLength(2);
  });
});

describe('HistoryStore sync-state scoping', () => {
  it('defaults an unseen (network, syWrapper) scope to ledger 0', () => {
    const state = HistoryStore.getSyncState('TESTNET', 'SY_A');
    expect(state.lastLedger).toBe(0);
  });

  it('never mixes sync cursors across networks', () => {
    HistoryStore.upsertSyncState('TESTNET', 'SY_A', 100);
    HistoryStore.upsertSyncState('MAINNET', 'SY_A', 500);
    expect(HistoryStore.getSyncState('TESTNET', 'SY_A').lastLedger).toBe(100);
    expect(HistoryStore.getSyncState('MAINNET', 'SY_A').lastLedger).toBe(500);
  });

  it('gives a redeployed SY wrapper its own cursor instead of inheriting the old epoch', () => {
    HistoryStore.upsertSyncState('TESTNET', 'SY_OLD_EPOCH', 9000);
    expect(HistoryStore.getSyncState('TESTNET', 'SY_NEW_EPOCH').lastLedger).toBe(0);
    expect(HistoryStore.getSyncState('TESTNET', 'SY_OLD_EPOCH').lastLedger).toBe(9000);
  });
});
