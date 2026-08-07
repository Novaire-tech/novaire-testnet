import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CCTSO5FM2LOSHNH4VMMUKBHT4273KDXB4LKGHVXC6AYEZKTZ4VSH5NBZ",
  }
} as const

export type DataKey = {tag: "Admin", values: void} | {tag: "PtToken", values: void} | {tag: "YtToken", values: void} | {tag: "Underlying", values: void} | {tag: "SyWrapper", values: void} | {tag: "Tokenizer", values: void} | {tag: "MaturityLedger", values: void} | {tag: "MaturityEngine", values: void} | {tag: "MaturityEngineEpochId", values: void} | {tag: "CreatedLedger", values: void} | {tag: "PtReserves", values: void} | {tag: "UnderlyingReserves", values: void} | {tag: "YtReserves", values: void} | {tag: "TotalLpShares", values: void} | {tag: "ImpliedRateTwap", values: void} | {tag: "LastTwapLedger", values: void} | {tag: "LpBalance", values: readonly [string]} | {tag: "Paused", values: void};

export const NovaireMarketError = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  3: {message:"Unauthorized"},
  4: {message:"EpochExpired"},
  5: {message:"InsufficientLiquidity"},
  6: {message:"SlippageExceeded"},
  7: {message:"ZeroInput"},
  8: {message:"BelowMinimumLiquidity"},
  9: {message:"StorageMissing"},
  10: {message:"InvariantViolated"},
  11: {message:"MathOverflow"},
  12: {message:"Paused"}
}

export interface Client {
  /**
   * Construct and simulate a pause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pauses the marketplace, blocking swaps and new-liquidity deposits.
   * `remove_liquidity` stays available so LPs/admins can always recover
   * funds even while paused.
   */
  pause: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a unpause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Unpauses the marketplace, restoring normal operations.
   */
  unpause: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a is_paused transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns true if the marketplace is currently paused.
   */
  is_paused: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin, pt_token, yt_token, underlying, sy_wrapper, tokenizer, maturity_ledger, maturity_engine, maturity_engine_epoch_id}: {admin: string, pt_token: string, yt_token: string, underlying: string, sy_wrapper: string, tokenizer: string, maturity_ledger: u32, maturity_engine: string, maturity_engine_epoch_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_pt_price transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_pt_price: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a get_reserves transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_reserves: (options?: MethodOptions) => Promise<AssembledTransaction<Result<readonly [i128, i128, i128]>>>

  /**
   * Construct and simulate a get_twap_age transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Ledger-age of the stored TWAP checkpoint. Callers that need a
   * freshness guarantee (analytics dashboards, off-chain keepers) should
   * use `get_twap_rate_checked` instead of raw `get_twap_rate`.
   */
  get_twap_age: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_yt_price transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Instantaneous (zero-size) YT spot price, derived from the live curve:
   * `1 - PT_spot_price`. This is the correct *marginal* reference price
   * for UI quoting; actual execution against nonzero size must go through
   * `swap_underlying_for_yt`/`swap_yt_for_underlying`, which price the
   * full trade against curve slippage rather than this single point.
   */
  get_yt_price: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a add_liquidity transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  add_liquidity: ({provider, pt_amount, underlying_amount}: {provider: string, pt_amount: i128, underlying_amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a get_twap_rate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_twap_rate: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a claim_amm_yield transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  claim_amm_yield: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a add_yt_liquidity transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Funds the YT side of the pool so `swap_underlying_for_yt` has real liquidity to
   * sell against. Without this, `YtReserves` can only ever be decremented (by YT
   * purchases) or incremented (by YT sales / proportional `remove_liquidity`), with no
   * legitimate entrypoint to seed it in the first place, so YT purchases always revert
   * with `InsufficientLiquidity` on a fresh deployment.
   * 
   * Contributed YT does not mint new LP shares (it isn't priced against PT/underlying
   * reserves by the AMM curve), so this is intentionally a one-way top-up: contributors
   * donate YT depth to the pool. It mirrors `add_liquidity`'s minimum-liquidity floor to
   * keep `swap_yt_for_underlying`'s downstream math (which assumes reserves stay above
   * dust) safe.
   * 
   * Sizing note for LPs: on a near-par pool (real PT discount much smaller than
   * `SWAP_FEE_NUM`/`SWAP_FEE_DEN`), the fee dominates the tiny genuine YT price and any
   * fee-based AMM quotes thin YT depth for a given contribution — this isn't fixable by
   * changing this function, it's inherent to trading a near
   */
  add_yt_liquidity: ({provider, yt_amount}: {provider: string, yt_amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a remove_liquidity transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  remove_liquidity: ({provider, lp_shares}: {provider: string, lp_shares: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<readonly [i128, i128, i128]>>>

  /**
   * Construct and simulate a get_twap_rate_checked transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Oracle-safe TWAP accessor: reverts with `InvariantViolated` if the
   * checkpoint is older than `MAX_TWAP_AGE_LEDGERS` (i.e. the market has
   * gone quiet long enough that the EMA is no longer representative).
   * Intentionally a *separate* function from `get_twap_rate` so existing
   * callers (e.g. Intent Engine's slippage gate) are unaffected — this is
   * additive oracle-safety tooling, not a behavior change to the existing
   * TWAP consumer. Not used by the PT or YT swap execution paths, which
   * price entirely off live curve state and have no staleness exposure.
   */
  get_twap_rate_checked: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a swap_pt_for_underlying transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  swap_pt_for_underlying: ({seller, pt_in, min_underlying_out}: {seller: string, pt_in: i128, min_underlying_out: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a swap_underlying_for_pt transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  swap_underlying_for_pt: ({buyer, underlying_in, min_pt_out}: {buyer: string, underlying_in: i128, min_pt_out: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a swap_underlying_for_yt transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  swap_underlying_for_yt: ({buyer, underlying_in, min_yt_out}: {buyer: string, underlying_in: i128, min_yt_out: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a swap_yt_for_underlying transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  swap_yt_for_underlying: ({seller, yt_in, min_underlying_out}: {seller: string, yt_in: i128, min_underlying_out: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a quote_underlying_for_yt transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Read-only quote for a prospective YT purchase of `underlying_in`,
   * useful for frontends/routers to preview size-dependent slippage
   * before submitting a swap. Mirrors `swap_underlying_for_yt`'s pricing
   * exactly (same curve, same fee), but touches no state.
   */
  quote_underlying_for_yt: ({underlying_in}: {underlying_in: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a quote_yt_for_underlying transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Read-only quote for a prospective YT sale of `yt_in`. Mirrors
   * `swap_yt_for_underlying`'s pricing exactly; touches no state.
   */
  quote_yt_for_underlying: ({yt_in}: {yt_in: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAAJ9QYXVzZXMgdGhlIG1hcmtldHBsYWNlLCBibG9ja2luZyBzd2FwcyBhbmQgbmV3LWxpcXVpZGl0eSBkZXBvc2l0cy4KYHJlbW92ZV9saXF1aWRpdHlgIHN0YXlzIGF2YWlsYWJsZSBzbyBMUHMvYWRtaW5zIGNhbiBhbHdheXMgcmVjb3ZlcgpmdW5kcyBldmVuIHdoaWxlIHBhdXNlZC4AAAAABXBhdXNlAAAAAAAAAAAAAAEAAAPpAAAD7QAAAAAAAAfQAAAAEk5vdmFpcmVNYXJrZXRFcnJvcgAA",
        "AAAAAAAAADZVbnBhdXNlcyB0aGUgbWFya2V0cGxhY2UsIHJlc3RvcmluZyBub3JtYWwgb3BlcmF0aW9ucy4AAAAAAAd1bnBhdXNlAAAAAAAAAAABAAAD6QAAA+0AAAAAAAAH0AAAABJOb3ZhaXJlTWFya2V0RXJyb3IAAA==",
        "AAAAAAAAADRSZXR1cm5zIHRydWUgaWYgdGhlIG1hcmtldHBsYWNlIGlzIGN1cnJlbnRseSBwYXVzZWQuAAAACWlzX3BhdXNlZAAAAAAAAAAAAAABAAAAAQ==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAEgAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAHUHRUb2tlbgAAAAAAAAAAAAAAAAdZdFRva2VuAAAAAAAAAAAAAAAAClVuZGVybHlpbmcAAAAAAAAAAAAAAAAACVN5V3JhcHBlcgAAAAAAAAAAAAAAAAAACVRva2VuaXplcgAAAAAAAAAAAAAAAAAADk1hdHVyaXR5TGVkZ2VyAAAAAAAAAAAAhUNhbm9uaWNhbCBlcG9jaC1jbG9jayBjb250cmFjdC4gU291cmNlIG9mIHRydXRoIGZvciBgRXBvY2hFeHBpcmVkYApjaGVja3M7IGBNYXR1cml0eUxlZGdlcmAgaXMgcmV0YWluZWQgb25seSBhcyBhIGRpc3BsYXktb25seSB2YWx1ZS4AAAAAAAAOTWF0dXJpdHlFbmdpbmUAAAAAAAAAAABHVGhlIGVwb2NoX2lkIGBNYXR1cml0eUVuZ2luZTo6b3Blbl9lcG9jaGAgcmV0dXJuZWQgZm9yIHRoaXMgZGVwbG95bWVudC4AAAAAFU1hdHVyaXR5RW5naW5lRXBvY2hJZAAAAAAAAAAAAAAAAAAADUNyZWF0ZWRMZWRnZXIAAAAAAAAAAAAAAAAAAApQdFJlc2VydmVzAAAAAAAAAAAAAAAAABJVbmRlcmx5aW5nUmVzZXJ2ZXMAAAAAAAAAAAAAAAAACll0UmVzZXJ2ZXMAAAAAAAAAAAAAAAAADVRvdGFsTHBTaGFyZXMAAAAAAAAAAAAAAAAAAA9JbXBsaWVkUmF0ZVR3YXAAAAAAAAAAAAAAAAAOTGFzdFR3YXBMZWRnZXIAAAAAAAEAAAAAAAAACUxwQmFsYW5jZQAAAAAAAAEAAAATAAAAAAAAAAAAAAAGUGF1c2VkAAA=",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAACQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAhwdF90b2tlbgAAABMAAAAAAAAACHl0X3Rva2VuAAAAEwAAAAAAAAAKdW5kZXJseWluZwAAAAAAEwAAAAAAAAAKc3lfd3JhcHBlcgAAAAAAEwAAAAAAAAAJdG9rZW5pemVyAAAAAAAAEwAAAAAAAAAPbWF0dXJpdHlfbGVkZ2VyAAAAAAQAAAAAAAAAD21hdHVyaXR5X2VuZ2luZQAAAAATAAAAAAAAABhtYXR1cml0eV9lbmdpbmVfZXBvY2hfaWQAAAAEAAAAAQAAA+kAAAPtAAAAAAAAB9AAAAASTm92YWlyZU1hcmtldEVycm9yAAA=",
        "AAAAAAAAAAAAAAAMZ2V0X3B0X3ByaWNlAAAAAAAAAAEAAAPpAAAACwAAB9AAAAASTm92YWlyZU1hcmtldEVycm9yAAA=",
        "AAAAAAAAAAAAAAAMZ2V0X3Jlc2VydmVzAAAAAAAAAAEAAAPpAAAD7QAAAAMAAAALAAAACwAAAAsAAAfQAAAAEk5vdmFpcmVNYXJrZXRFcnJvcgAA",
        "AAAAAAAAAL5MZWRnZXItYWdlIG9mIHRoZSBzdG9yZWQgVFdBUCBjaGVja3BvaW50LiBDYWxsZXJzIHRoYXQgbmVlZCBhCmZyZXNobmVzcyBndWFyYW50ZWUgKGFuYWx5dGljcyBkYXNoYm9hcmRzLCBvZmYtY2hhaW4ga2VlcGVycykgc2hvdWxkCnVzZSBgZ2V0X3R3YXBfcmF0ZV9jaGVja2VkYCBpbnN0ZWFkIG9mIHJhdyBgZ2V0X3R3YXBfcmF0ZWAuAAAAAAAMZ2V0X3R3YXBfYWdlAAAAAAAAAAEAAAAE",
        "AAAAAAAAAVNJbnN0YW50YW5lb3VzICh6ZXJvLXNpemUpIFlUIHNwb3QgcHJpY2UsIGRlcml2ZWQgZnJvbSB0aGUgbGl2ZSBjdXJ2ZToKYDEgLSBQVF9zcG90X3ByaWNlYC4gVGhpcyBpcyB0aGUgY29ycmVjdCAqbWFyZ2luYWwqIHJlZmVyZW5jZSBwcmljZQpmb3IgVUkgcXVvdGluZzsgYWN0dWFsIGV4ZWN1dGlvbiBhZ2FpbnN0IG5vbnplcm8gc2l6ZSBtdXN0IGdvIHRocm91Z2gKYHN3YXBfdW5kZXJseWluZ19mb3JfeXRgL2Bzd2FwX3l0X2Zvcl91bmRlcmx5aW5nYCwgd2hpY2ggcHJpY2UgdGhlCmZ1bGwgdHJhZGUgYWdhaW5zdCBjdXJ2ZSBzbGlwcGFnZSByYXRoZXIgdGhhbiB0aGlzIHNpbmdsZSBwb2ludC4AAAAADGdldF95dF9wcmljZQAAAAAAAAABAAAD6QAAAAsAAAfQAAAAEk5vdmFpcmVNYXJrZXRFcnJvcgAA",
        "AAAAAAAAAAAAAAANYWRkX2xpcXVpZGl0eQAAAAAAAAMAAAAAAAAACHByb3ZpZGVyAAAAEwAAAAAAAAAJcHRfYW1vdW50AAAAAAAACwAAAAAAAAARdW5kZXJseWluZ19hbW91bnQAAAAAAAALAAAAAQAAA+kAAAALAAAH0AAAABJOb3ZhaXJlTWFya2V0RXJyb3IAAA==",
        "AAAAAAAAAAAAAAANZ2V0X3R3YXBfcmF0ZQAAAAAAAAAAAAABAAAD6QAAAAsAAAfQAAAAEk5vdmFpcmVNYXJrZXRFcnJvcgAA",
        "AAAAAAAAAAAAAAAPY2xhaW1fYW1tX3lpZWxkAAAAAAAAAAABAAAD6QAAAAsAAAfQAAAAEk5vdmFpcmVNYXJrZXRFcnJvcgAA",
        "AAAAAAAABABGdW5kcyB0aGUgWVQgc2lkZSBvZiB0aGUgcG9vbCBzbyBgc3dhcF91bmRlcmx5aW5nX2Zvcl95dGAgaGFzIHJlYWwgbGlxdWlkaXR5IHRvCnNlbGwgYWdhaW5zdC4gV2l0aG91dCB0aGlzLCBgWXRSZXNlcnZlc2AgY2FuIG9ubHkgZXZlciBiZSBkZWNyZW1lbnRlZCAoYnkgWVQKcHVyY2hhc2VzKSBvciBpbmNyZW1lbnRlZCAoYnkgWVQgc2FsZXMgLyBwcm9wb3J0aW9uYWwgYHJlbW92ZV9saXF1aWRpdHlgKSwgd2l0aCBubwpsZWdpdGltYXRlIGVudHJ5cG9pbnQgdG8gc2VlZCBpdCBpbiB0aGUgZmlyc3QgcGxhY2UsIHNvIFlUIHB1cmNoYXNlcyBhbHdheXMgcmV2ZXJ0CndpdGggYEluc3VmZmljaWVudExpcXVpZGl0eWAgb24gYSBmcmVzaCBkZXBsb3ltZW50LgoKQ29udHJpYnV0ZWQgWVQgZG9lcyBub3QgbWludCBuZXcgTFAgc2hhcmVzIChpdCBpc24ndCBwcmljZWQgYWdhaW5zdCBQVC91bmRlcmx5aW5nCnJlc2VydmVzIGJ5IHRoZSBBTU0gY3VydmUpLCBzbyB0aGlzIGlzIGludGVudGlvbmFsbHkgYSBvbmUtd2F5IHRvcC11cDogY29udHJpYnV0b3JzCmRvbmF0ZSBZVCBkZXB0aCB0byB0aGUgcG9vbC4gSXQgbWlycm9ycyBgYWRkX2xpcXVpZGl0eWAncyBtaW5pbXVtLWxpcXVpZGl0eSBmbG9vciB0bwprZWVwIGBzd2FwX3l0X2Zvcl91bmRlcmx5aW5nYCdzIGRvd25zdHJlYW0gbWF0aCAod2hpY2ggYXNzdW1lcyByZXNlcnZlcyBzdGF5IGFib3ZlCmR1c3QpIHNhZmUuCgpTaXppbmcgbm90ZSBmb3IgTFBzOiBvbiBhIG5lYXItcGFyIHBvb2wgKHJlYWwgUFQgZGlzY291bnQgbXVjaCBzbWFsbGVyIHRoYW4KYFNXQVBfRkVFX05VTWAvYFNXQVBfRkVFX0RFTmApLCB0aGUgZmVlIGRvbWluYXRlcyB0aGUgdGlueSBnZW51aW5lIFlUIHByaWNlIGFuZCBhbnkKZmVlLWJhc2VkIEFNTSBxdW90ZXMgdGhpbiBZVCBkZXB0aCBmb3IgYSBnaXZlbiBjb250cmlidXRpb24g4oCUIHRoaXMgaXNuJ3QgZml4YWJsZSBieQpjaGFuZ2luZyB0aGlzIGZ1bmN0aW9uLCBpdCdzIGluaGVyZW50IHRvIHRyYWRpbmcgYSBuZWFyAAAAEGFkZF95dF9saXF1aWRpdHkAAAACAAAAAAAAAAhwcm92aWRlcgAAABMAAAAAAAAACXl0X2Ftb3VudAAAAAAAAAsAAAABAAAD6QAAAAsAAAfQAAAAEk5vdmFpcmVNYXJrZXRFcnJvcgAA",
        "AAAAAAAAAAAAAAAQcmVtb3ZlX2xpcXVpZGl0eQAAAAIAAAAAAAAACHByb3ZpZGVyAAAAEwAAAAAAAAAJbHBfc2hhcmVzAAAAAAAACwAAAAEAAAPpAAAD7QAAAAMAAAALAAAACwAAAAsAAAfQAAAAEk5vdmFpcmVNYXJrZXRFcnJvcgAA",
        "AAAABAAAAAAAAAAAAAAAEk5vdmFpcmVNYXJrZXRFcnJvcgAAAAAADAAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAgAAAAAAAAAMVW5hdXRob3JpemVkAAAAAwAAAAAAAAAMRXBvY2hFeHBpcmVkAAAABAAAAAAAAAAVSW5zdWZmaWNpZW50TGlxdWlkaXR5AAAAAAAABQAAAAAAAAAQU2xpcHBhZ2VFeGNlZWRlZAAAAAYAAAAAAAAACVplcm9JbnB1dAAAAAAAAAcAAAAAAAAAFUJlbG93TWluaW11bUxpcXVpZGl0eQAAAAAAAAgAAAAAAAAADlN0b3JhZ2VNaXNzaW5nAAAAAAAJAAAAAAAAABFJbnZhcmlhbnRWaW9sYXRlZAAAAAAAAAoAAAAAAAAADE1hdGhPdmVyZmxvdwAAAAsAAAAAAAAABlBhdXNlZAAAAAAADA==",
        "AAAAAAAAAiRPcmFjbGUtc2FmZSBUV0FQIGFjY2Vzc29yOiByZXZlcnRzIHdpdGggYEludmFyaWFudFZpb2xhdGVkYCBpZiB0aGUKY2hlY2twb2ludCBpcyBvbGRlciB0aGFuIGBNQVhfVFdBUF9BR0VfTEVER0VSU2AgKGkuZS4gdGhlIG1hcmtldCBoYXMKZ29uZSBxdWlldCBsb25nIGVub3VnaCB0aGF0IHRoZSBFTUEgaXMgbm8gbG9uZ2VyIHJlcHJlc2VudGF0aXZlKS4KSW50ZW50aW9uYWxseSBhICpzZXBhcmF0ZSogZnVuY3Rpb24gZnJvbSBgZ2V0X3R3YXBfcmF0ZWAgc28gZXhpc3RpbmcKY2FsbGVycyAoZS5nLiBJbnRlbnQgRW5naW5lJ3Mgc2xpcHBhZ2UgZ2F0ZSkgYXJlIHVuYWZmZWN0ZWQg4oCUIHRoaXMgaXMKYWRkaXRpdmUgb3JhY2xlLXNhZmV0eSB0b29saW5nLCBub3QgYSBiZWhhdmlvciBjaGFuZ2UgdG8gdGhlIGV4aXN0aW5nClRXQVAgY29uc3VtZXIuIE5vdCB1c2VkIGJ5IHRoZSBQVCBvciBZVCBzd2FwIGV4ZWN1dGlvbiBwYXRocywgd2hpY2gKcHJpY2UgZW50aXJlbHkgb2ZmIGxpdmUgY3VydmUgc3RhdGUgYW5kIGhhdmUgbm8gc3RhbGVuZXNzIGV4cG9zdXJlLgAAABVnZXRfdHdhcF9yYXRlX2NoZWNrZWQAAAAAAAAAAAAAAQAAA+kAAAALAAAH0AAAABJOb3ZhaXJlTWFya2V0RXJyb3IAAA==",
        "AAAAAAAAAAAAAAAWc3dhcF9wdF9mb3JfdW5kZXJseWluZwAAAAAAAwAAAAAAAAAGc2VsbGVyAAAAAAATAAAAAAAAAAVwdF9pbgAAAAAAAAsAAAAAAAAAEm1pbl91bmRlcmx5aW5nX291dAAAAAAACwAAAAEAAAPpAAAACwAAB9AAAAASTm92YWlyZU1hcmtldEVycm9yAAA=",
        "AAAAAAAAAAAAAAAWc3dhcF91bmRlcmx5aW5nX2Zvcl9wdAAAAAAAAwAAAAAAAAAFYnV5ZXIAAAAAAAATAAAAAAAAAA11bmRlcmx5aW5nX2luAAAAAAAACwAAAAAAAAAKbWluX3B0X291dAAAAAAACwAAAAEAAAPpAAAACwAAB9AAAAASTm92YWlyZU1hcmtldEVycm9yAAA=",
        "AAAAAAAAAAAAAAAWc3dhcF91bmRlcmx5aW5nX2Zvcl95dAAAAAAAAwAAAAAAAAAFYnV5ZXIAAAAAAAATAAAAAAAAAA11bmRlcmx5aW5nX2luAAAAAAAACwAAAAAAAAAKbWluX3l0X291dAAAAAAACwAAAAEAAAPpAAAACwAAB9AAAAASTm92YWlyZU1hcmtldEVycm9yAAA=",
        "AAAAAAAAAAAAAAAWc3dhcF95dF9mb3JfdW5kZXJseWluZwAAAAAAAwAAAAAAAAAGc2VsbGVyAAAAAAATAAAAAAAAAAV5dF9pbgAAAAAAAAsAAAAAAAAAEm1pbl91bmRlcmx5aW5nX291dAAAAAAACwAAAAEAAAPpAAAACwAAB9AAAAASTm92YWlyZU1hcmtldEVycm9yAAA=",
        "AAAAAAAAAPxSZWFkLW9ubHkgcXVvdGUgZm9yIGEgcHJvc3BlY3RpdmUgWVQgcHVyY2hhc2Ugb2YgYHVuZGVybHlpbmdfaW5gLAp1c2VmdWwgZm9yIGZyb250ZW5kcy9yb3V0ZXJzIHRvIHByZXZpZXcgc2l6ZS1kZXBlbmRlbnQgc2xpcHBhZ2UKYmVmb3JlIHN1Ym1pdHRpbmcgYSBzd2FwLiBNaXJyb3JzIGBzd2FwX3VuZGVybHlpbmdfZm9yX3l0YCdzIHByaWNpbmcKZXhhY3RseSAoc2FtZSBjdXJ2ZSwgc2FtZSBmZWUpLCBidXQgdG91Y2hlcyBubyBzdGF0ZS4AAAAXcXVvdGVfdW5kZXJseWluZ19mb3JfeXQAAAAAAQAAAAAAAAANdW5kZXJseWluZ19pbgAAAAAAAAsAAAABAAAD6QAAAAsAAAfQAAAAEk5vdmFpcmVNYXJrZXRFcnJvcgAA",
        "AAAAAAAAAHtSZWFkLW9ubHkgcXVvdGUgZm9yIGEgcHJvc3BlY3RpdmUgWVQgc2FsZSBvZiBgeXRfaW5gLiBNaXJyb3JzCmBzd2FwX3l0X2Zvcl91bmRlcmx5aW5nYCdzIHByaWNpbmcgZXhhY3RseTsgdG91Y2hlcyBubyBzdGF0ZS4AAAAAF3F1b3RlX3l0X2Zvcl91bmRlcmx5aW5nAAAAAAEAAAAAAAAABXl0X2luAAAAAAAACwAAAAEAAAPpAAAACwAAB9AAAAASTm92YWlyZU1hcmtldEVycm9yAAA=" ]),
      options
    )
  }
  public readonly fromJSON = {
    pause: this.txFromJSON<Result<void>>,
        unpause: this.txFromJSON<Result<void>>,
        is_paused: this.txFromJSON<boolean>,
        initialize: this.txFromJSON<Result<void>>,
        get_pt_price: this.txFromJSON<Result<i128>>,
        get_reserves: this.txFromJSON<Result<readonly [i128, i128, i128]>>,
        get_twap_age: this.txFromJSON<u32>,
        get_yt_price: this.txFromJSON<Result<i128>>,
        add_liquidity: this.txFromJSON<Result<i128>>,
        get_twap_rate: this.txFromJSON<Result<i128>>,
        claim_amm_yield: this.txFromJSON<Result<i128>>,
        add_yt_liquidity: this.txFromJSON<Result<i128>>,
        remove_liquidity: this.txFromJSON<Result<readonly [i128, i128, i128]>>,
        get_twap_rate_checked: this.txFromJSON<Result<i128>>,
        swap_pt_for_underlying: this.txFromJSON<Result<i128>>,
        swap_underlying_for_pt: this.txFromJSON<Result<i128>>,
        swap_underlying_for_yt: this.txFromJSON<Result<i128>>,
        swap_yt_for_underlying: this.txFromJSON<Result<i128>>,
        quote_underlying_for_yt: this.txFromJSON<Result<i128>>,
        quote_yt_for_underlying: this.txFromJSON<Result<i128>>
  }
}