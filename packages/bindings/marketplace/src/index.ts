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
  unknown: {
    networkPassphrase: "Public Global Stellar Network ; September 2015",
    contractId: "CDU3YFWCPBPZN6SYWKIP6TCFNGZ3G4MJWNLBB2RVNZGBUJR6HGZXPZKD",
  }
} as const

export type DataKey = {tag: "Admin", values: void} | {tag: "PtToken", values: void} | {tag: "YtToken", values: void} | {tag: "Underlying", values: void} | {tag: "SyWrapper", values: void} | {tag: "Tokenizer", values: void} | {tag: "MaturityLedger", values: void} | {tag: "CreatedLedger", values: void} | {tag: "PtReserves", values: void} | {tag: "UnderlyingReserves", values: void} | {tag: "YtReserves", values: void} | {tag: "TotalLpShares", values: void} | {tag: "ImpliedRateTwap", values: void} | {tag: "LastTwapLedger", values: void} | {tag: "LpBalance", values: readonly [string]};

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
  11: {message:"MathOverflow"}
}

export interface Client {
  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin, pt_token, yt_token, underlying, sy_wrapper, tokenizer, maturity_ledger}: {admin: string, pt_token: string, yt_token: string, underlying: string, sy_wrapper: string, tokenizer: string, maturity_ledger: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_pt_price transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_pt_price: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a get_reserves transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_reserves: (options?: MethodOptions) => Promise<AssembledTransaction<Result<readonly [i128, i128, i128]>>>

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
   * Construct and simulate a remove_liquidity transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  remove_liquidity: ({provider, lp_shares}: {provider: string, lp_shares: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<readonly [i128, i128, i128]>>>

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
      new ContractSpec([ "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAADwAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAHUHRUb2tlbgAAAAAAAAAAAAAAAAdZdFRva2VuAAAAAAAAAAAAAAAAClVuZGVybHlpbmcAAAAAAAAAAAAAAAAACVN5V3JhcHBlcgAAAAAAAAAAAAAAAAAACVRva2VuaXplcgAAAAAAAAAAAAAAAAAADk1hdHVyaXR5TGVkZ2VyAAAAAAAAAAAAAAAAAA1DcmVhdGVkTGVkZ2VyAAAAAAAAAAAAAAAAAAAKUHRSZXNlcnZlcwAAAAAAAAAAAAAAAAASVW5kZXJseWluZ1Jlc2VydmVzAAAAAAAAAAAAAAAAAApZdFJlc2VydmVzAAAAAAAAAAAAAAAAAA1Ub3RhbExwU2hhcmVzAAAAAAAAAAAAAAAAAAAPSW1wbGllZFJhdGVUd2FwAAAAAAAAAAAAAAAADkxhc3RUd2FwTGVkZ2VyAAAAAAABAAAAAAAAAAlMcEJhbGFuY2UAAAAAAAABAAAAEw==",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAABwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAhwdF90b2tlbgAAABMAAAAAAAAACHl0X3Rva2VuAAAAEwAAAAAAAAAKdW5kZXJseWluZwAAAAAAEwAAAAAAAAAKc3lfd3JhcHBlcgAAAAAAEwAAAAAAAAAJdG9rZW5pemVyAAAAAAAAEwAAAAAAAAAPbWF0dXJpdHlfbGVkZ2VyAAAAAAQAAAABAAAD6QAAA+0AAAAAAAAH0AAAABJOb3ZhaXJlTWFya2V0RXJyb3IAAA==",
        "AAAAAAAAAAAAAAAMZ2V0X3B0X3ByaWNlAAAAAAAAAAEAAAPpAAAACwAAB9AAAAASTm92YWlyZU1hcmtldEVycm9yAAA=",
        "AAAAAAAAAAAAAAAMZ2V0X3Jlc2VydmVzAAAAAAAAAAEAAAPpAAAD7QAAAAMAAAALAAAACwAAAAsAAAfQAAAAEk5vdmFpcmVNYXJrZXRFcnJvcgAA",
        "AAAAAAAAAAAAAAANYWRkX2xpcXVpZGl0eQAAAAAAAAMAAAAAAAAACHByb3ZpZGVyAAAAEwAAAAAAAAAJcHRfYW1vdW50AAAAAAAACwAAAAAAAAARdW5kZXJseWluZ19hbW91bnQAAAAAAAALAAAAAQAAA+kAAAALAAAH0AAAABJOb3ZhaXJlTWFya2V0RXJyb3IAAA==",
        "AAAAAAAAAAAAAAANZ2V0X3R3YXBfcmF0ZQAAAAAAAAAAAAABAAAD6QAAAAsAAAfQAAAAEk5vdmFpcmVNYXJrZXRFcnJvcgAA",
        "AAAAAAAAAAAAAAAPY2xhaW1fYW1tX3lpZWxkAAAAAAAAAAABAAAD6QAAAAsAAAfQAAAAEk5vdmFpcmVNYXJrZXRFcnJvcgAA",
        "AAAAAAAAAAAAAAAQcmVtb3ZlX2xpcXVpZGl0eQAAAAIAAAAAAAAACHByb3ZpZGVyAAAAEwAAAAAAAAAJbHBfc2hhcmVzAAAAAAAACwAAAAEAAAPpAAAD7QAAAAMAAAALAAAACwAAAAsAAAfQAAAAEk5vdmFpcmVNYXJrZXRFcnJvcgAA",
        "AAAABAAAAAAAAAAAAAAAEk5vdmFpcmVNYXJrZXRFcnJvcgAAAAAACwAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAgAAAAAAAAAMVW5hdXRob3JpemVkAAAAAwAAAAAAAAAMRXBvY2hFeHBpcmVkAAAABAAAAAAAAAAVSW5zdWZmaWNpZW50TGlxdWlkaXR5AAAAAAAABQAAAAAAAAAQU2xpcHBhZ2VFeGNlZWRlZAAAAAYAAAAAAAAACVplcm9JbnB1dAAAAAAAAAcAAAAAAAAAFUJlbG93TWluaW11bUxpcXVpZGl0eQAAAAAAAAgAAAAAAAAADlN0b3JhZ2VNaXNzaW5nAAAAAAAJAAAAAAAAABFJbnZhcmlhbnRWaW9sYXRlZAAAAAAAAAoAAAAAAAAADE1hdGhPdmVyZmxvdwAAAAs=",
        "AAAAAAAAAAAAAAAWc3dhcF9wdF9mb3JfdW5kZXJseWluZwAAAAAAAwAAAAAAAAAGc2VsbGVyAAAAAAATAAAAAAAAAAVwdF9pbgAAAAAAAAsAAAAAAAAAEm1pbl91bmRlcmx5aW5nX291dAAAAAAACwAAAAEAAAPpAAAACwAAB9AAAAASTm92YWlyZU1hcmtldEVycm9yAAA=",
        "AAAAAAAAAAAAAAAWc3dhcF91bmRlcmx5aW5nX2Zvcl9wdAAAAAAAAwAAAAAAAAAFYnV5ZXIAAAAAAAATAAAAAAAAAA11bmRlcmx5aW5nX2luAAAAAAAACwAAAAAAAAAKbWluX3B0X291dAAAAAAACwAAAAEAAAPpAAAACwAAB9AAAAASTm92YWlyZU1hcmtldEVycm9yAAA=",
        "AAAAAAAAAAAAAAAWc3dhcF91bmRlcmx5aW5nX2Zvcl95dAAAAAAAAwAAAAAAAAAFYnV5ZXIAAAAAAAATAAAAAAAAAA11bmRlcmx5aW5nX2luAAAAAAAACwAAAAAAAAAKbWluX3l0X291dAAAAAAACwAAAAEAAAPpAAAACwAAB9AAAAASTm92YWlyZU1hcmtldEVycm9yAAA=",
        "AAAAAAAAAAAAAAAWc3dhcF95dF9mb3JfdW5kZXJseWluZwAAAAAAAwAAAAAAAAAGc2VsbGVyAAAAAAATAAAAAAAAAAV5dF9pbgAAAAAAAAsAAAAAAAAAEm1pbl91bmRlcmx5aW5nX291dAAAAAAACwAAAAEAAAPpAAAACwAAB9AAAAASTm92YWlyZU1hcmtldEVycm9yAAA=" ]),
      options
    )
  }
  public readonly fromJSON = {
    initialize: this.txFromJSON<Result<void>>,
        get_pt_price: this.txFromJSON<Result<i128>>,
        get_reserves: this.txFromJSON<Result<readonly [i128, i128, i128]>>,
        add_liquidity: this.txFromJSON<Result<i128>>,
        get_twap_rate: this.txFromJSON<Result<i128>>,
        claim_amm_yield: this.txFromJSON<Result<i128>>,
        remove_liquidity: this.txFromJSON<Result<readonly [i128, i128, i128]>>,
        swap_pt_for_underlying: this.txFromJSON<Result<i128>>,
        swap_underlying_for_pt: this.txFromJSON<Result<i128>>,
        swap_underlying_for_yt: this.txFromJSON<Result<i128>>,
        swap_yt_for_underlying: this.txFromJSON<Result<i128>>
  }
}