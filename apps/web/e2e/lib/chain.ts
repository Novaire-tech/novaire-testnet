// Reusable, headless (no Freighter) real-testnet transaction helpers for the
// portfolio E2E suite. Uses basicNodeSigner + a raw Keypair, matching the
// established pattern in e2e/_seed-deposits.local.mjs — real Soroban RPC,
// real Friendbot, real contracts. No mocks.
import { Keypair, rpc } from '@stellar/stellar-sdk';
import { basicNodeSigner } from '@stellar/stellar-sdk/contract';
import { Client as VaultClient } from '../../../../packages/bindings/vault/src/index';
import { Client as TokenizerClient } from '../../../../packages/bindings/tokenizer/src/index';
import { Client as MarketplaceClient } from '../../../../packages/bindings/marketplace/src/index';
import { Client as PtClient } from '../../../../packages/bindings/pt_token/src/index';
import { Client as YtClient } from '../../../../packages/bindings/yt_token/src/index';
import { Client as IntentClient } from '../../../../packages/bindings/intent_engine/src/index';
import { CONTRACTS, RPC_URL, NETWORK_PASSPHRASE } from '../../src/config/contracts';
import deployments from '../../src/config/deployments.testnet.json';

export const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const FRIENDBOT_URL = 'https://friendbot.stellar.org';
export const STROOP = 10_000_000;

export interface Wallet {
  keypair: Keypair;
  publicKey: string;
}

export function createWallet(): Wallet {
  const keypair = Keypair.random();
  return { keypair, publicKey: keypair.publicKey() };
}

// Friendbot rate-limits aggressively under burst load (5 wallets funded
// back-to-back) — retry with backoff rather than fail the whole run.
export async function fundWallet(wallet: Wallet, retries = 5): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(wallet.publicKey)}`);
    if (res.ok || res.status === 400) {
      // 400 = already funded, treat as success.
      await waitForAccountOnHorizon(wallet.publicKey);
      return;
    }
    if (res.status === 429 && attempt < retries) {
      await new Promise((r) => setTimeout(r, attempt * 2000));
      continue;
    }
    throw new Error(`Friendbot funding failed for ${wallet.publicKey}: ${res.status} ${await res.text()}`);
  }
  throw new Error(`Friendbot funding exhausted retries for ${wallet.publicKey}`);
}

async function waitForAccountOnHorizon(publicKey: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${HORIZON_URL}/accounts/${publicKey}`);
    if (res.ok) return;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Timed out waiting for account ${publicKey} to appear on Horizon`);
}

export async function waitForLedger(targetSequence: number, server: rpc.Server, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const latest = await server.getLatestLedger();
    if (latest.sequence >= targetSequence) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Timed out waiting for ledger ${targetSequence}`);
}

export async function waitForTransaction(hash: string, server: rpc.Server, timeoutMs = 60_000): Promise<rpc.Api.GetTransactionResponse> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await server.getTransaction(hash);
    if (result.status !== 'NOT_FOUND') return result;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Timed out waiting for transaction ${hash}`);
}

function clientFor<T extends { new (opts: any): any }>(Ctor: T, contractId: string, wallet: Wallet) {
  const signer = basicNodeSigner(wallet.keypair, NETWORK_PASSPHRASE);
  return new Ctor({
    contractId,
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    publicKey: wallet.publicKey,
    ...signer,
  });
}

export function getServer(): rpc.Server {
  return new rpc.Server(RPC_URL, { allowHttp: true });
}

export function assertNotMatured(server: rpc.Server) {
  return server.getLatestLedger().then((l) => {
    const maturity = Number(deployments.maturity_ledger);
    if (l.sequence >= maturity) {
      throw new Error(
        `Testnet fixture matured (ledger ${l.sequence} >= maturity_ledger ${maturity}) — redeploy before running portfolio E2E.`,
      );
    }
    return { latestLedger: l.sequence, maturity };
  });
}

/** Deposits `amountXlm` directly into the Vault, minting raw (untokenized) LP shares. */
export async function depositVault(wallet: Wallet, amountXlm: number) {
  const client = clientFor(VaultClient, CONTRACTS.VAULT, wallet);
  const amount = BigInt(Math.floor(amountXlm * STROOP));
  const tx = await client.deposit({ depositor: wallet.publicKey, amount });
  return tx.signAndSend();
}

/** Converts `syShares` of a user's Vault LP into PT + YT via the Tokenizer. */
export async function mintPTYT(wallet: Wallet, syShares: number) {
  const client = clientFor(TokenizerClient, CONTRACTS.TOKENIZER, wallet);
  const shares = BigInt(Math.floor(syShares * STROOP));
  const tx = await client.mint_pt_yt({ user: wallet.publicKey, sy_shares: shares });
  return tx.signAndSend();
}

/**
 * Acquires PT the same way an end user buying on the secondary market would:
 * swaps underlying (XLM) for PT against the Marketplace AMM. This is
 * economically independent of any Vault deposit/mint the same wallet may
 * also hold — see the P1 precedence fix in portfolioService.ts.
 */
export async function buyPT(wallet: Wallet, underlyingInXlm: number, minPtOut = 0n) {
  const client = clientFor(MarketplaceClient, CONTRACTS.MARKETPLACE, wallet);
  const underlying_in = BigInt(Math.floor(underlyingInXlm * STROOP));
  const tx = await client.swap_underlying_for_pt({ buyer: wallet.publicKey, underlying_in, min_pt_out: minPtOut });
  return tx.signAndSend();
}

/** Withdraws raw Vault LP shares back to underlying. */
export async function redeem(wallet: Wallet, shares: number) {
  const client = clientFor(VaultClient, CONTRACTS.VAULT, wallet);
  const sharesAmount = BigInt(Math.floor(shares * STROOP));
  const tx = await client.withdraw({ withdrawer: wallet.publicKey, shares: sharesAmount });
  return tx.signAndSend();
}

/**
 * NOTE / KNOWN LIMITATION: yt_token exposes no user-callable "claim and pay
 * out" transaction — claimable_yield() is a read, and the only mutator,
 * reset_claimable(), is not exposed as a user action in the current app (it
 * zeroes the counter without a corresponding payout transfer in this
 * contract version). Real yield accrual is driven by admin/epoch calls to
 * add_accrued_yield / update_yield_index, not by the wallet under test. This
 * helper therefore only reads the current claimable balance; it cannot
 * itself manufacture nonzero claimable yield for a fresh wallet. Scenario E
 * must seed a wallet with prior activity (e.g. reuse a matured/harvested
 * testnet fixture) rather than create the state from scratch — see the
 * skip logic in portfolio.e2e.spec.ts.
 */
export async function claimYield(wallet: Wallet) {
  const client = clientFor(YtClient, CONTRACTS.YT_TOKEN, wallet);
  const tx = await client.claimable_yield({ user: wallet.publicKey });
  return tx.simulate ? tx : tx; // read-only simulate call; see NOTE above
}

export async function readOnChainState(publicKey: string) {
  const readOnlyWallet: Wallet = { keypair: Keypair.random(), publicKey };
  const vaultClient = clientFor(VaultClient, CONTRACTS.VAULT, readOnlyWallet);
  const ptClient = clientFor(PtClient, CONTRACTS.PT_TOKEN, readOnlyWallet);
  const ytClient = clientFor(YtClient, CONTRACTS.YT_TOKEN, readOnlyWallet);
  const marketplaceClient = clientFor(MarketplaceClient, CONTRACTS.MARKETPLACE, readOnlyWallet);

  const [vaultTx, ptTx, ytTx, claimableTx, ptPriceTx] = await Promise.all([
    vaultClient.balance_of({ user: publicKey }),
    ptClient.balance({ id: publicKey }),
    ytClient.balance({ id: publicKey }),
    ytClient.claimable_yield({ user: publicKey }),
    marketplaceClient.get_pt_price(),
  ]);

  const unwrap = (r: any) => {
    let v = r?.result;
    if (v && typeof v === 'object') {
      if (typeof v.unwrap === 'function') v = v.unwrap();
      else if ('ok' in v) v = v.ok;
      else if ('value' in v) v = v.value;
    }
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  };

  return {
    vaultLp: unwrap(vaultTx) / STROOP,
    ptBalance: unwrap(ptTx) / STROOP,
    ytBalance: unwrap(ytTx) / STROOP,
    claimableYield: unwrap(claimableTx) / STROOP,
    ptPriceUnderlying: unwrap(ptPriceTx) / 1_000_000_000,
  };
}

export { deployments };
export type IntentEngineClient = InstanceType<typeof IntentClient>;
