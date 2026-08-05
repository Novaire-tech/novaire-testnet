import { Vault, YieldHistory } from '../types';
import { ProtocolService } from './protocolService';

export class YieldService {
  /**
   * Helper to unwrap Soroban Result types
   */
  private static unwrapResult(rawResult: any): any {
    if (rawResult !== undefined && typeof rawResult === 'object' && rawResult !== null) {
      if (typeof rawResult.unwrap === 'function') return rawResult.unwrap();
      if ('ok' in rawResult) return rawResult.ok;
      if ('value' in rawResult) return rawResult.value;
    }
    return rawResult;
  }

  static async getActiveMaturityTimestampMs(): Promise<number> {
    // Default to 30 days from now if we can't fetch
    let maturityMs = Date.now() + 30 * 24 * 60 * 60 * 1000;

    try {
      const { Client: TokenizerClient } = await import('../../packages/bindings/tokenizer/src/index');
      const { CONTRACTS, RPC_URL, NETWORK_PASSPHRASE, NETWORK } = await import('../config/contracts');
      
      const IS_DEV = process.env.NODE_ENV !== 'production';
      const isMainnet = NETWORK === 'MAINNET';
      const HORIZON_URL = isMainnet ? 'https://horizon.stellar.org/' : 'https://horizon-testnet.stellar.org/';

      const clientOptions = {
        rpcUrl: RPC_URL,
        networkPassphrase: NETWORK_PASSPHRASE,
      };

      const tokenizerClient = new TokenizerClient({ ...clientOptions, contractId: CONTRACTS.TOKENIZER });
      
      const metaTx = await tokenizerClient.metadata();
      const metadata = this.unwrapResult(metaTx?.result);
      
      if (metadata && typeof metadata === 'object') {
        const maturityLedger = Number(metadata.maturity_ledger || 0);
        
        if (maturityLedger > 0) {
          try {
            const res = await fetch(HORIZON_URL);
            if (res.ok) {
              const horizonData = await res.json();
              const currentLedger = Number(horizonData.history_latest_ledger || horizonData.core_latest_ledger);
              if (!isNaN(currentLedger) && currentLedger > 0) {
                const ledgersRemaining = maturityLedger - currentLedger;
                const secondsRemaining = ledgersRemaining * 5.5;
                maturityMs = Date.now() + secondsRemaining * 1000;
                if (IS_DEV) {
                  console.log(`[Novaire Ledger Debug] 
  Current Ledger: ${currentLedger}
  Maturity Ledger: ${maturityLedger}
  Remaining Ledgers: ${ledgersRemaining}
  Calculated Seconds Remaining: ${secondsRemaining}`);
                }
              }
            }
          } catch (e) {
            if (IS_DEV) console.warn("Failed to fetch horizon ledger for maturity calculation, using approximation");
          }
        }
      }
    } catch (e) {
      console.warn("Could not fetch tokenizer metadata", e);
    }
    return maturityMs;
  }

  static async getActiveMaturityLedger(): Promise<number> {
    try {
      const { Client: TokenizerClient } = await import('../../packages/bindings/tokenizer/src/index');
      const { CONTRACTS, RPC_URL, NETWORK_PASSPHRASE } = await import('../config/contracts');

      const tokenizerClient = new TokenizerClient({ 
        rpcUrl: RPC_URL,
        networkPassphrase: NETWORK_PASSPHRASE,
        contractId: CONTRACTS.TOKENIZER 
      });
      
      const metaTx = await tokenizerClient.metadata();
      const metadata = this.unwrapResult(metaTx?.result);
      
      if (metadata && typeof metadata === 'object') {
        return Number(metadata.maturity_ledger || 0);
      }
    } catch (e) {
      console.warn("Could not fetch tokenizer maturity_ledger", e);
    }
    return 0;
  }

  static async getEpochStartIndex(): Promise<number> {
    try {
      const { Client: TokenizerClient } = await import('../../packages/bindings/tokenizer/src/index');
      const { CONTRACTS, RPC_URL, NETWORK_PASSPHRASE } = await import('../config/contracts');

      const tokenizerClient = new TokenizerClient({ 
        rpcUrl: RPC_URL,
        networkPassphrase: NETWORK_PASSPHRASE,
        contractId: CONTRACTS.TOKENIZER 
      });
      
      const metaTx = await tokenizerClient.metadata();
      const metadata = this.unwrapResult(metaTx?.result);
      
      if (metadata && typeof metadata === 'object') {
        const rawIndex = Number(metadata.epoch_start_index || 1000000000);
        return rawIndex / 1e9;
      }
    } catch (e) {
      console.warn("Could not fetch tokenizer epoch_start_index", e);
    }
    return 1.0;
  }

  static async getVaults(): Promise<Vault[]> {
    let tvlUsd = 0;
    let impliedApy = 0;
    try {
      const state = await ProtocolService.getProtocolState();
      tvlUsd = state.tvlUsd;
      impliedApy = state.impliedYieldApy;
    } catch (e) {
      console.warn("Could not fetch live ProtocolState for Vault page");
    }

    const maturityMs = await this.getActiveMaturityTimestampMs();
    const maturityDate = new Date(maturityMs).toISOString();

    return [
      {
        id: 'vault_xlm_01',
        asset: 'XLM',
        protocol: 'Novaire',
        tvlUsd: tvlUsd,
        fixedApy: impliedApy,
        variableApy: 0, // Protocol is currently fixed-yield only
        capacityUsd: 2000000,
        maturityDate: maturityDate,
      }
    ];
  }

  static async getYieldHistory(vaultId: string): Promise<YieldHistory[]> {
    try {
      const res = await fetch('/api/history');
      if (!res.ok) return [];
      const history = await res.json();
      
      if (!Array.isArray(history)) return [];
      
      return history.map((h: any) => ({
        timestamp: new Date(h.timestamp).toISOString(),
        fixedApy: h.fixedApy || 0,
        variableApy: 0, // Protocol is currently fixed-yield only
      }));
    } catch (e) {
      console.warn("Failed to fetch yield history from indexer", e);
      return [];
    }
  }


}
