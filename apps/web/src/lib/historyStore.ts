/**
 * File-based protocol history store.
 *
 * Replaces Prisma/SQLite for the dev/testnet environment.
 * Stores ProtocolHistory entries as a JSON array on disk.
 * Never throws — always returns safe defaults.
 *
 * Deduplication: consecutive identical snapshots are never written.
 * Balances: every snapshot captures the user's wallet state at that instant.
 */
import fs from 'fs';
import path from 'path';

export interface ProtocolHistoryEntry {
  id: string;
  timestamp: string; // ISO string

  /** Deployment identity — prevents testnet/mainnet and cross-epoch (redeployed SY wrapper) data from mixing. */
  network: string;
  syWrapper: string;

  // Protocol prices
  ptPrice: number;
  ytPrice: number;
  tvl: number;
  fixedApy: number;
  tradingVolume: number;
  /** SY Wrapper's get_exchange_rate() at this instant. 0 means "not captured" — never treat 0 as a real rate. */
  syExchangeRate: number;

  // Wallet state at this instant (0 when wallet not connected during server sync)
  ptBalance: number;
  ytBalance: number;
  xlmBalance: number;
  walletAssetsUsd: number;
  vaultLpUsd: number;
  claimableYield: number;
  portfolioValue: number;
  positionValue: number;

  eventType: string | null;
  txHash: string | null;
}

export interface SyncStateEntry {
  id: string;
  lastLedger: number;
  updatedAt: string;
}

interface StoreData {
  history: ProtocolHistoryEntry[];
  /** Keyed by `${network}:${syWrapper}` — a redeployed SY wrapper must resync from scratch. */
  syncState: Record<string, SyncStateEntry>;
}

function syncStateKey(network: string, syWrapper: string): string {
  return `${network}:${syWrapper}`;
}

// Store alongside the SQLite db file — at project root
// ponytail: single-file local disk store — not safe across multiple/serverless instances
// (each gets its own ephemeral filesystem). Upgrade path: point this at the existing
// Prisma ProtocolHistory model (already includes network/syWrapper-shaped scoping via
// this same interface) once deployed somewhere with a real shared Postgres.
const STORE_PATH = path.join(process.cwd(), 'history-store.json');

// Tolerance for deduplication: consider two values equal if within 0.001% of each other
const DELTA_TOLERANCE = 0.00001;

function numChanged(a: number, b: number): boolean {
  if (a === b) return false;
  const avg = (Math.abs(a) + Math.abs(b)) / 2;
  if (avg === 0) return false;
  return Math.abs(a - b) / avg > DELTA_TOLERANCE;
}

function isDuplicate(prev: ProtocolHistoryEntry, next: Omit<ProtocolHistoryEntry, 'id' | 'timestamp'>): boolean {
  return (
    !numChanged(prev.ptPrice, next.ptPrice) &&
    !numChanged(prev.ytPrice, next.ytPrice) &&
    !numChanged(prev.tvl, next.tvl) &&
    !numChanged(prev.fixedApy, next.fixedApy) &&
    !numChanged(prev.tradingVolume, next.tradingVolume) &&
    !numChanged(prev.syExchangeRate, next.syExchangeRate) &&
    !numChanged(prev.ptBalance, next.ptBalance) &&
    !numChanged(prev.ytBalance, next.ytBalance) &&
    !numChanged(prev.xlmBalance, next.xlmBalance) &&
    !numChanged(prev.walletAssetsUsd, next.walletAssetsUsd) &&
    !numChanged(prev.vaultLpUsd, next.vaultLpUsd) &&
    !numChanged(prev.claimableYield, next.claimableYield) &&
    !numChanged(prev.portfolioValue, next.portfolioValue) &&
    !numChanged(prev.positionValue, next.positionValue)
  );
}

function readStore(): StoreData {
  const defaults: StoreData = { history: [], syncState: {} };
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      // Migrate the old singleton syncState shape ({id, lastLedger, updatedAt}) to
      // an empty scoped map — its unscoped cursor can't be attributed to any one
      // (network, syWrapper) epoch, so it must resync rather than be guessed at.
      const syncState =
        parsed.syncState && typeof parsed.syncState === 'object' && !('lastLedger' in parsed.syncState)
          ? (parsed.syncState as Record<string, SyncStateEntry>)
          : defaults.syncState;
      return {
        history: Array.isArray(parsed.history) ? parsed.history : defaults.history,
        syncState,
      };
    }
  } catch {
    // Corrupt or missing — start fresh
  }
  return defaults;
}

function writeStore(data: StoreData): void {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[HistoryStore] Failed to write store:', err);
  }
}

export const HistoryStore = {
  /** Scoped by (network, syWrapper) so redeployed epochs / testnet / mainnet never mix. */
  getHistory(network: string, syWrapper: string, limit = 5000): ProtocolHistoryEntry[] {
    const data = readStore();
    const scoped = data.history.filter((e) => e.network === network && e.syWrapper === syWrapper);
    // Return oldest-first, capped at limit
    return scoped.slice(-limit);
  },

  /**
   * Append a new entry only if it differs meaningfully from the last snapshot
   * *in the same (network, syWrapper) scope*. Returns the new entry if written,
   * null if deduplicated or rejected as invalid.
   */
  addHistoryEntry(
    entry: Omit<ProtocolHistoryEntry, 'id' | 'timestamp'>
  ): ProtocolHistoryEntry | null {
    if (!entry.network || !entry.syWrapper) {
      console.warn('[HistoryStore] Rejecting entry missing network/syWrapper identity.');
      return null;
    }

    const data = readStore();
    const scopedHistory = data.history.filter(
      (e) => e.network === entry.network && e.syWrapper === entry.syWrapper
    );

    // Deduplication check — skip identical consecutive snapshots within the same scope
    if (scopedHistory.length > 0) {
      const last = scopedHistory[scopedHistory.length - 1];
      if (isDuplicate(last, entry)) {
        console.log('[HistoryStore] Duplicate snapshot — skipping write.');
        return null;
      }
      // Sanity guard: reject an obviously corrupted exchange-rate reading (>2x jump
      // in either direction) rather than let it poison the APY annualization.
      if (last.syExchangeRate > 0 && entry.syExchangeRate > 0) {
        const ratio = entry.syExchangeRate / last.syExchangeRate;
        if (ratio > 2 || ratio < 0.5) {
          console.warn('[HistoryStore] Rejecting implausible syExchangeRate jump:', last.syExchangeRate, '->', entry.syExchangeRate);
          return null;
        }
      }
    }

    const newEntry: ProtocolHistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    data.history.push(newEntry);

    // Keep at most 10000 entries to avoid unbounded growth
    if (data.history.length > 10000) {
      data.history = data.history.slice(-10000);
    }

    writeStore(data);
    return newEntry;
  },

  /** Scoped by (network, syWrapper) — a redeployed wrapper starts its own cursor from 0. */
  getSyncState(network: string, syWrapper: string): SyncStateEntry {
    const key = syncStateKey(network, syWrapper);
    return (
      readStore().syncState[key] ?? { id: key, lastLedger: 0, updatedAt: new Date().toISOString() }
    );
  },

  upsertSyncState(network: string, syWrapper: string, lastLedger: number): SyncStateEntry {
    const data = readStore();
    const key = syncStateKey(network, syWrapper);
    const entry: SyncStateEntry = { id: key, lastLedger, updatedAt: new Date().toISOString() };
    data.syncState[key] = entry;
    writeStore(data);
    return entry;
  },
};
