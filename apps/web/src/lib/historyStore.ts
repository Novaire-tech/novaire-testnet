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

  // Protocol prices
  ptPrice: number;
  ytPrice: number;
  tvl: number;
  fixedApy: number;
  tradingVolume: number;

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
  syncState: SyncStateEntry;
}

// Store alongside the SQLite db file — at project root
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
  const defaults: StoreData = {
    history: [],
    syncState: { id: 'singleton', lastLedger: 0, updatedAt: new Date().toISOString() },
  };
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        history: Array.isArray(parsed.history) ? parsed.history : defaults.history,
        syncState: parsed.syncState && typeof parsed.syncState === 'object'
          ? parsed.syncState
          : defaults.syncState,
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
  getHistory(limit = 5000): ProtocolHistoryEntry[] {
    const data = readStore();
    // Return oldest-first, capped at limit
    return data.history.slice(-limit);
  },

  /**
   * Append a new entry only if it differs meaningfully from the last snapshot.
   * Returns the new entry if written, null if deduplicated.
   */
  addHistoryEntry(
    entry: Omit<ProtocolHistoryEntry, 'id' | 'timestamp'>
  ): ProtocolHistoryEntry | null {
    const data = readStore();

    // Deduplication check — skip identical consecutive snapshots
    if (data.history.length > 0) {
      const last = data.history[data.history.length - 1];
      if (isDuplicate(last, entry)) {
        console.log('[HistoryStore] Duplicate snapshot — skipping write.');
        return null;
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

  getSyncState(): SyncStateEntry {
    return readStore().syncState;
  },

  upsertSyncState(lastLedger: number): SyncStateEntry {
    const data = readStore();
    data.syncState = {
      id: 'singleton',
      lastLedger,
      updatedAt: new Date().toISOString(),
    };
    writeStore(data);
    return data.syncState;
  },
};
