// Real-testnet helpers for scripts/verify-testnet.ts. Thin wrapper around
// apps/web/e2e/lib/chain.ts — the single source of truth for real-testnet
// transaction helpers against the current architecture (SY Wrapper ->
// Tokenizer -> PT/YT -> AMM). Adds only the pieces verify-testnet.ts needs
// that the E2E lib doesn't already provide (retry/backoff wrappers,
// deterministic wallets for reproducible local runs, network constants).
import { Keypair, rpc } from '@stellar/stellar-sdk';
import {
  createWallet,
  fundWallet,
  getServer,
  waitForTransaction,
  assertNotMatured as assertNotMaturedBase,
  depositVault as depositVaultBase,
  mintPTYT as mintPTYTBase,
  buyPT as buyPTBase,
  addLiquidity as addLiquidityBase,
  redeem as redeemBase,
  readOnChainState as readOnChainStateBase,
  type Wallet,
} from '../../apps/web/e2e/lib/chain';
import { RPC_URL, NETWORK_PASSPHRASE } from '../../apps/web/src/config/contracts';

export { RPC_URL, NETWORK_PASSPHRASE };
export const HORIZON_URL = 'https://horizon-testnet.stellar.org';
export const FRIENDBOT_URL = 'https://friendbot.stellar.org';
export const STROOP = 10_000_000;

export type { Wallet };
export { createWallet, fundWallet, getServer, waitForTransaction };

export interface TxOutcome {
  hash?: string;
  status: string;
}

function normalize(result: { sendTransactionResponse?: { hash?: string }; getTransactionResponse?: { status?: string } }): TxOutcome {
  return {
    hash: result?.sendTransactionResponse?.hash,
    status: result?.getTransactionResponse?.status ?? 'submitted',
  };
}

export async function depositVault(wallet: Wallet, amountXlm: number): Promise<TxOutcome> {
  return normalize(await depositVaultBase(wallet, amountXlm));
}

export async function mintPTYT(wallet: Wallet, syShares: number): Promise<TxOutcome> {
  return normalize(await mintPTYTBase(wallet, syShares));
}

export async function buyPT(wallet: Wallet, underlyingInXlm: number): Promise<TxOutcome> {
  return normalize(await buyPTBase(wallet, underlyingInXlm));
}

export async function addLiquidity(wallet: Wallet, ptIn: number, syIn: number): Promise<TxOutcome> {
  return normalize(await addLiquidityBase(wallet, ptIn, syIn));
}

export async function redeem(wallet: Wallet, shares: number): Promise<TxOutcome> {
  return normalize(await redeemBase(wallet, shares));
}

// The Soroban RPC client's fetch adapter intermittently throws a bare
// "fetch failed" on some networks even when the endpoint is reachable
// (verified: plain `fetch()` to the same URL succeeds on the same retry
// where the SDK's axios-based adapter doesn't) — transient, not a code bug.
// Wraps read-only/pre-submission calls so a single flaky attempt doesn't
// fail the whole run. Not applied after a transaction is already
// broadcast, to avoid retrying into a double-submit.
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

/** Deterministic wallet derived from a fixed seed string, for reproducible local runs. */
export function deterministicWallet(seed: string): Wallet {
  const bytes = Buffer.alloc(32);
  for (let i = 0; i < seed.length; i++) bytes[i % 32] ^= seed.charCodeAt(i) + i;
  const keypair = Keypair.fromRawEd25519Seed(bytes);
  return { keypair, publicKey: keypair.publicKey() };
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

export async function assertNotMatured(server: rpc.Server): Promise<void> {
  await assertNotMaturedBase(server);
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
  return withRetry(() => readOnChainStateBase(publicKey), 4, 'readOnChainState');
}

/**
 * KNOWN LIMITATION: yt_token has no user-callable claim-and-pay-out
 * transaction in this contract version — accrued_yield() is read-only, and
 * accrual is admin/epoch-driven. This script therefore cannot manufacture
 * nonzero claimable yield for a fresh wallet; the Claimable Yield scenario
 * verifies the safe-math (no Infinity/NaN) path unconditionally, and
 * additionally checks the nonzero-conversion path if
 * VERIFY_YIELD_WALLET_SECRET points at a wallet that already has accrued
 * yield.
 */
export async function readClaimableYield(publicKey: string): Promise<number> {
  const state = await readOnChainState(publicKey);
  return state.claimableYield;
}
