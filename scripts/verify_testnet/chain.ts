// Real-testnet helpers for scripts/verify-testnet.ts. No mocks: real
// Friendbot funding, real signed transactions against the deployed Novaire
// contracts, via basicNodeSigner + a raw Keypair — the same pattern used
// throughout scripts/ (see scripts/bootstrap_liquidity.ts) and in
// apps/web/e2e/_seed-deposits.local.mjs.
import { Keypair, rpc } from '@stellar/stellar-sdk';
import { basicNodeSigner } from '@stellar/stellar-sdk/contract';
import { Client as VaultClient } from '../../packages/bindings/vault/src/index';
import { Client as TokenizerClient } from '../../packages/bindings/tokenizer/src/index';
import { Client as MarketplaceClient } from '../../packages/bindings/marketplace/src/index';
import { Client as PtClient } from '../../packages/bindings/pt_token/src/index';
import { Client as YtClient } from '../../packages/bindings/yt_token/src/index';
import deployments from '../deployments.testnet.json';

export const RPC_URL = 'https://soroban-testnet.stellar.org';
export const HORIZON_URL = 'https://horizon-testnet.stellar.org';
export const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
export const FRIENDBOT_URL = 'https://friendbot.stellar.org';
export const STROOP = 10_000_000;

// The Soroban RPC client's fetch adapter intermittently throws a bare
// "fetch failed" on some networks even when the endpoint is reachable
// (verified: plain `fetch()` to the same URL succeeds on the same retry
// where the SDK's axios-based adapter doesn't) — transient, not a code bug.
// Wraps read-only/pre-submission calls so a single flaky attempt doesn't
// fail the whole run. Not applied after a transaction is already
// broadcast (see signAndReport) to avoid retrying into a double-submit.
export async function withRetry<T>(fn: () => Promise<T>, retries = 4, label = 'RPC call'): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
  throw new Error(`${label} failed after ${retries} attempts: ${(lastErr as any)?.message || lastErr}`);
}

export const CONTRACTS = {
  VAULT: deployments.vault,
  PT_TOKEN: deployments.pt_token,
  YT_TOKEN: deployments.yt_token,
  MARKETPLACE: deployments.marketplace,
  TOKENIZER: deployments.tokenizer,
};

export interface Wallet {
  keypair: Keypair;
  publicKey: string;
}

export function createWallet(): Wallet {
  const keypair = Keypair.random();
  return { keypair, publicKey: keypair.publicKey() };
}

/** Deterministic wallet derived from a fixed seed string, for reproducible local runs. */
export function deterministicWallet(seed: string): Wallet {
  // Keypair has no seed-phrase constructor; derive 32 raw bytes from the seed
  // string via a simple stable hash so the same seed always yields the same
  // keypair without pulling in a KDF dependency.
  const bytes = Buffer.alloc(32);
  for (let i = 0; i < seed.length; i++) bytes[i % 32] ^= seed.charCodeAt(i) + i;
  const keypair = Keypair.fromRawEd25519Seed(bytes);
  return { keypair, publicKey: keypair.publicKey() };
}

export async function fundWallet(wallet: Wallet, retries = 5): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(wallet.publicKey)}`);
      if (res.ok || res.status === 400) {
        await waitForAccountReady(wallet.publicKey);
        return;
      }
      if (attempt === retries) throw new Error(`Friendbot funding failed for ${wallet.publicKey}: ${res.status} ${await res.text()}`);
    } catch (e) {
      if (attempt === retries) throw e;
    }
    // Backs off for any failure — HTTP 429/5xx, transient DNS/fetch errors under
    // burst load from funding several wallets back-to-back — not just 429.
    await new Promise((r) => setTimeout(r, attempt * 2000));
  }
  throw new Error(`Friendbot funding exhausted retries for ${wallet.publicKey}`);
}

// Friendbot funding is visible on Horizon within ~1-2s, but the Soroban RPC
// node (used for every contract call/tx submission below) can lag behind it
// by a few more seconds since they're independently-indexed backends against
// the same ledger. Waiting on Horizon alone caused "Account not found" when
// the very next call was a contract invocation through RPC — so this checks
// RPC's own view of the account, which is what actually matters here.
async function waitForAccountReady(publicKey: string, timeoutMs = 45_000): Promise<void> {
  const server = getServer();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await server.getAccount(publicKey);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error(`Timed out waiting for account ${publicKey} to be visible on Soroban RPC`);
}

export function getServer(): rpc.Server {
  return new rpc.Server(RPC_URL, { allowHttp: true });
}

export async function assertNotMatured(server: rpc.Server): Promise<void> {
  const latest = await withRetry(() => server.getLatestLedger(), 4, 'getLatestLedger');
  const maturity = Number(deployments.maturity_ledger);
  if (latest.sequence >= maturity) {
    throw new Error(
      `Testnet fixture matured (ledger ${latest.sequence} >= maturity_ledger ${maturity}) — redeploy before running verify-testnet.`,
    );
  }
}

export async function waitForTransaction(hash: string, server: rpc.Server, timeoutMs = 60_000): Promise<rpc.Api.GetTransactionResponse> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const result = await server.getTransaction(hash);
      if (result.status !== 'NOT_FOUND') return result;
    } catch {
      // transient fetch error — keep polling until timeout
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Timed out waiting for transaction ${hash}`);
}

function clientFor<T>(Ctor: new (opts: any) => T, contractId: string, wallet: Wallet): T {
  const signer = basicNodeSigner(wallet.keypair, NETWORK_PASSPHRASE);
  return new Ctor({ contractId, rpcUrl: RPC_URL, networkPassphrase: NETWORK_PASSPHRASE, publicKey: wallet.publicKey, ...signer });
}

export interface TxOutcome {
  hash?: string;
  status: string;
}

async function signAndReport(tx: { signAndSend: () => Promise<any> }): Promise<TxOutcome> {
  const result: any = await tx.signAndSend();
  return {
    hash: result?.sendTransactionResponse?.hash,
    status: result?.getTransactionResponse?.status ?? 'submitted',
  };
}

/**
 * A tx reaching SUCCESS via getTransaction() doesn't guarantee the RPC
 * node's own account/contract-state view (used by the next simulate() call)
 * has caught up yet — observed "Account not found" on a state read
 * immediately following a confirmed deposit even though Horizon already
 * showed the account funded. Call after waitForTransaction() before reading
 * state that depends on the just-confirmed tx's effects.
 */
export async function settleAfterConfirmation(ms = 3000): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export async function depositVault(wallet: Wallet, amountXlm: number): Promise<TxOutcome> {
  const client = clientFor(VaultClient, CONTRACTS.VAULT, wallet);
  const amount = BigInt(Math.floor(amountXlm * STROOP));
  const tx = await client.deposit({ depositor: wallet.publicKey, amount });
  return signAndReport(tx);
}

export async function mintPTYT(wallet: Wallet, syShares: number): Promise<TxOutcome> {
  const client = clientFor(TokenizerClient, CONTRACTS.TOKENIZER, wallet);
  const shares = BigInt(Math.floor(syShares * STROOP));
  const tx = await client.mint_pt_yt({ user: wallet.publicKey, sy_shares: shares });
  return signAndReport(tx);
}

/** Buys PT the way an end user would on the secondary market — independent of any Vault deposit the same wallet holds. */
export async function buyPT(wallet: Wallet, underlyingInXlm: number): Promise<TxOutcome> {
  const client = clientFor(MarketplaceClient, CONTRACTS.MARKETPLACE, wallet);
  const underlying_in = BigInt(Math.floor(underlyingInXlm * STROOP));
  const tx = await client.swap_underlying_for_pt({ buyer: wallet.publicKey, underlying_in, min_pt_out: 0n });
  return signAndReport(tx);
}

/**
 * KNOWN LIMITATION: yt_token has no user-callable claim-and-pay-out
 * transaction in this contract version — claimable_yield() is read-only,
 * and accrual (add_accrued_yield/update_yield_index) is admin/epoch-driven.
 * This script therefore cannot manufacture nonzero claimable yield for a
 * fresh wallet; the Claimable Yield scenario verifies the safe-math
 * (no Infinity/NaN) path unconditionally, and additionally checks the
 * nonzero-conversion path if VERIFY_YIELD_WALLET_SECRET points at a wallet
 * that already has accrued yield.
 */
export async function readClaimableYield(publicKey: string): Promise<number> {
  const readonly: Wallet = { keypair: Keypair.random(), publicKey };
  const ytClient = clientFor(YtClient, CONTRACTS.YT_TOKEN, readonly);
  const tx = await withRetry(() => ytClient.claimable_yield({ user: publicKey }), 4, 'claimable_yield');
  return unwrapI128(tx?.result) / STROOP;
}

function unwrapI128(v: any): number {
  if (v && typeof v === 'object') {
    if (typeof v.unwrap === 'function') v = v.unwrap();
    else if ('ok' in v) v = v.ok;
    else if ('value' in v) v = v.value;
  }
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

export interface OnChainState {
  vaultLp: number;
  ptBalance: number;
  ytBalance: number;
  claimableYield: number;
  ptPriceUnderlying: number;
}

/** Reads every balance directly from the deployed contracts — never from the app. */
export async function readOnChainState(publicKey: string): Promise<OnChainState> {
  const readonly: Wallet = { keypair: Keypair.random(), publicKey };
  const vaultClient = clientFor(VaultClient, CONTRACTS.VAULT, readonly);
  const ptClient = clientFor(PtClient, CONTRACTS.PT_TOKEN, readonly);
  const ytClient = clientFor(YtClient, CONTRACTS.YT_TOKEN, readonly);
  const marketplaceClient = clientFor(MarketplaceClient, CONTRACTS.MARKETPLACE, readonly);

  const [vaultTx, ptTx, ytTx, claimableTx, ptPriceTx] = await Promise.all([
    withRetry(() => vaultClient.balance_of({ user: publicKey }), 4, 'vault.balance_of'),
    withRetry(() => ptClient.balance({ id: publicKey }), 4, 'pt.balance'),
    withRetry(() => ytClient.balance({ id: publicKey }), 4, 'yt.balance'),
    withRetry(() => ytClient.claimable_yield({ user: publicKey }), 4, 'yt.claimable_yield'),
    withRetry(() => marketplaceClient.get_pt_price(), 4, 'marketplace.get_pt_price'),
  ]);

  return {
    vaultLp: unwrapI128(vaultTx?.result) / STROOP,
    ptBalance: unwrapI128(ptTx?.result) / STROOP,
    ytBalance: unwrapI128(ytTx?.result) / STROOP,
    claimableYield: unwrapI128(claimableTx?.result) / STROOP,
    ptPriceUnderlying: unwrapI128(ptPriceTx?.result) / 1_000_000_000,
  };
}
