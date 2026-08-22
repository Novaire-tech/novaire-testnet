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
    contractId: "CC4RS662LACJ6JBRJPZGKTVXCOODFGS5MJXKACUCFRFNLZUNMSAWEW5P",
  }
} as const


export const Errors = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  3: {message:"InvalidMaturity"},
  4: {message:"InvalidAmount"},
  5: {message:"InvalidScalarRoot"},
  6: {message:"InvalidAnchor"},
  7: {message:"InvalidFee"},
  8: {message:"InvalidTwapWindow"},
  9: {message:"MarketNotSeeded"},
  10: {message:"MarketMatured"},
  11: {message:"SlippageExceeded"},
  12: {message:"InsufficientLiquidity"},
  13: {message:"MathOverflow"},
  14: {message:"MarketProportionTooHigh"},
  15: {message:"ExchangeRateBelowOne"},
  16: {message:"UnsupportedRoute"},
  17: {message:"TradeNotFound"},
  18: {message:"InputOutOfBounds"},
  19: {message:"InvalidSyRate"}
}


export interface State {
  last_ln_implied_rate: i128;
  last_observation: u64;
  total_lp: i128;
  total_pt: i128;
  total_sy: i128;
  twap_ln_implied_rate: i128;
  warmup_until: u64;
}


export interface Config {
  admin: string;
  fee_bps: i128;
  initial_anchor: i128;
  maturity: u64;
  pt_token: string;
  scalar_root: i128;
  sy_token: string;
  tokenizer: string;
  twap_window: u64;
  yt_token: string;
}



export interface Client {
  /**
   * Construct and simulate a state transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  state: (options?: MethodOptions) => Promise<AssembledTransaction<Result<State>>>

  /**
   * Construct and simulate a config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  config: (options?: MethodOptions) => Promise<AssembledTransaction<Result<Config>>>

  /**
   * Construct and simulate a bump_ttl transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  bump_ttl: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a maturity transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  maturity: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a spot_apy transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  spot_apy: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a total_lp transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  total_lp: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a twap_apy transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  twap_apy: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin, pt_token, sy_token, yt_token, tokenizer, maturity, scalar_root, initial_anchor, fee_bps, twap_window}: {admin: string, pt_token: string, sy_token: string, yt_token: string, tokenizer: string, maturity: u64, scalar_root: i128, initial_anchor: i128, fee_bps: i128, twap_window: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a lp_balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  lp_balance: ({holder}: {holder: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a reserve_pt transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  reserve_pt: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a reserve_sy transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  reserve_sy: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a bump_lp_ttl transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  bump_lp_ttl: ({holder}: {holder: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a implied_apy transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  implied_apy: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a add_liquidity transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  add_liquidity: ({from, pt_in, sy_in, min_lp_out}: {from: string, pt_in: i128, sy_in: i128, min_lp_out: i128}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a swap_pt_for_sy transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  swap_pt_for_sy: ({from, pt_in, min_sy_out}: {from: string, pt_in: i128, min_sy_out: i128}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a swap_sy_for_pt transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  swap_sy_for_pt: ({from, sy_in, min_pt_out}: {from: string, sy_in: i128, min_pt_out: i128}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a swap_sy_for_yt transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  swap_sy_for_yt: ({from, sy_in, min_yt_out}: {from: string, sy_in: i128, min_yt_out: i128}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a swap_yt_for_sy transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  swap_yt_for_sy: ({from, yt_in, min_sy_out}: {from: string, yt_in: i128, min_sy_out: i128}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a quote_pt_for_sy transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  quote_pt_for_sy: ({pt_in}: {pt_in: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a quote_sy_for_pt transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  quote_sy_for_pt: ({sy_in}: {sy_in: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a quote_sy_for_yt transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  quote_sy_for_yt: ({sy_in}: {sy_in: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a quote_yt_for_sy transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  quote_yt_for_sy: ({yt_in}: {yt_in: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a twap_warming_up transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  twap_warming_up: (options?: MethodOptions) => Promise<AssembledTransaction<Result<boolean>>>

  /**
   * Construct and simulate a remove_liquidity transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  remove_liquidity: ({from, lp_in, min_pt_out, min_sy_out}: {from: string, lp_in: i128, min_pt_out: i128, min_sy_out: i128}, options?: MethodOptions) => Promise<AssembledTransaction<readonly [i128, i128]>>

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
      new ContractSpec([ "AAAABQAAAEJFbWl0dGVkIG9uIGFueSBBTU0gc3dhcCAoUFQ8LT5TWSBkaXJlY3QsIFNZPC0+WVQgdmlhIGZsYXNoIHJvdXRlKS4AAAAAAAAAAAAEU3dhcAAAAAEAAAAEc3dhcAAAAAQAAAAAAAAABnRyYWRlcgAAAAAAEwAAAAEAAAAAAAAABXJvdXRlAAAAAAAAEQAAAAEAAAAAAAAACWFtb3VudF9pbgAAAAAAAAsAAAAAAAAAAAAAAAphbW91bnRfb3V0AAAAAAALAAAAAAAAAAI=",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAEwAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAgAAAAAAAAAPSW52YWxpZE1hdHVyaXR5AAAAAAMAAAAAAAAADUludmFsaWRBbW91bnQAAAAAAAAEAAAAAAAAABFJbnZhbGlkU2NhbGFyUm9vdAAAAAAAAAUAAAAAAAAADUludmFsaWRBbmNob3IAAAAAAAAGAAAAAAAAAApJbnZhbGlkRmVlAAAAAAAHAAAAAAAAABFJbnZhbGlkVHdhcFdpbmRvdwAAAAAAAAgAAAAAAAAAD01hcmtldE5vdFNlZWRlZAAAAAAJAAAAAAAAAA1NYXJrZXRNYXR1cmVkAAAAAAAACgAAAAAAAAAQU2xpcHBhZ2VFeGNlZWRlZAAAAAsAAAAAAAAAFUluc3VmZmljaWVudExpcXVpZGl0eQAAAAAAAAwAAAAAAAAADE1hdGhPdmVyZmxvdwAAAA0AAAAAAAAAF01hcmtldFByb3BvcnRpb25Ub29IaWdoAAAAAA4AAAAAAAAAFEV4Y2hhbmdlUmF0ZUJlbG93T25lAAAADwAAAAAAAAAQVW5zdXBwb3J0ZWRSb3V0ZQAAABAAAAAAAAAADVRyYWRlTm90Rm91bmQAAAAAAAARAAAAAAAAABBJbnB1dE91dE9mQm91bmRzAAAAEgAAAAAAAAANSW52YWxpZFN5UmF0ZQAAAAAAABM=",
        "AAAAAQAAAAAAAAAAAAAABVN0YXRlAAAAAAAABwAAAAAAAAAUbGFzdF9sbl9pbXBsaWVkX3JhdGUAAAALAAAAAAAAABBsYXN0X29ic2VydmF0aW9uAAAABgAAAAAAAAAIdG90YWxfbHAAAAALAAAAAAAAAAh0b3RhbF9wdAAAAAsAAAAAAAAACHRvdGFsX3N5AAAACwAAAAAAAAAUdHdhcF9sbl9pbXBsaWVkX3JhdGUAAAALAAAAAAAAAAx3YXJtdXBfdW50aWwAAAAG",
        "AAAAAQAAAAAAAAAAAAAABkNvbmZpZwAAAAAACgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAdmZWVfYnBzAAAAAAsAAAAAAAAADmluaXRpYWxfYW5jaG9yAAAAAAALAAAAAAAAAAhtYXR1cml0eQAAAAYAAAAAAAAACHB0X3Rva2VuAAAAEwAAAAAAAAALc2NhbGFyX3Jvb3QAAAAACwAAAAAAAAAIc3lfdG9rZW4AAAATAAAAAAAAAAl0b2tlbml6ZXIAAAAAAAATAAAAAAAAAAt0d2FwX3dpbmRvdwAAAAAGAAAAAAAAAAh5dF90b2tlbgAAABM=",
        "AAAAAAAAAAAAAAAFc3RhdGUAAAAAAAAAAAAAAQAAA+kAAAfQAAAABVN0YXRlAAAAAAAAAw==",
        "AAAAAAAAAAAAAAAGY29uZmlnAAAAAAAAAAAAAQAAA+kAAAfQAAAABkNvbmZpZwAAAAAAAw==",
        "AAAAAAAAAAAAAAAIYnVtcF90dGwAAAAAAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAAIbWF0dXJpdHkAAAAAAAAAAQAAAAY=",
        "AAAAAAAAAAAAAAAIc3BvdF9hcHkAAAAAAAAAAQAAA+kAAAALAAAAAw==",
        "AAAAAAAAAAAAAAAIdG90YWxfbHAAAAAAAAAAAQAAA+kAAAALAAAAAw==",
        "AAAAAAAAAAAAAAAIdHdhcF9hcHkAAAAAAAAAAQAAA+kAAAALAAAAAw==",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAACgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAhwdF90b2tlbgAAABMAAAAAAAAACHN5X3Rva2VuAAAAEwAAAAAAAAAIeXRfdG9rZW4AAAATAAAAAAAAAAl0b2tlbml6ZXIAAAAAAAATAAAAAAAAAAhtYXR1cml0eQAAAAYAAAAAAAAAC3NjYWxhcl9yb290AAAAAAsAAAAAAAAADmluaXRpYWxfYW5jaG9yAAAAAAALAAAAAAAAAAdmZWVfYnBzAAAAAAsAAAAAAAAAC3R3YXBfd2luZG93AAAAAAYAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAAKbHBfYmFsYW5jZQAAAAAAAQAAAAAAAAAGaG9sZGVyAAAAAAATAAAAAQAAA+kAAAALAAAAAw==",
        "AAAAAAAAAAAAAAAKcmVzZXJ2ZV9wdAAAAAAAAAAAAAEAAAPpAAAACwAAAAM=",
        "AAAAAAAAAAAAAAAKcmVzZXJ2ZV9zeQAAAAAAAAAAAAEAAAPpAAAACwAAAAM=",
        "AAAABQAAACxFbWl0dGVkIHdoZW4gbGlxdWlkaXR5IGlzIGFkZGVkIHRvIHRoZSBwb29sLgAAAAAAAAAMQWRkTGlxdWlkaXR5AAAAAQAAAA1hZGRfbGlxdWlkaXR5AAAAAAAABAAAAAAAAAAIcHJvdmlkZXIAAAATAAAAAQAAAAAAAAAFcHRfaW4AAAAAAAALAAAAAAAAAAAAAAAFc3lfaW4AAAAAAAALAAAAAAAAAAAAAAAGbHBfb3V0AAAAAAALAAAAAAAAAAI=",
        "AAAAAAAAAAAAAAALYnVtcF9scF90dGwAAAAAAQAAAAAAAAAGaG9sZGVyAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAALaW1wbGllZF9hcHkAAAAAAAAAAAEAAAAL",
        "AAAAAAAAAAAAAAANYWRkX2xpcXVpZGl0eQAAAAAAAAQAAAAAAAAABGZyb20AAAATAAAAAAAAAAVwdF9pbgAAAAAAAAsAAAAAAAAABXN5X2luAAAAAAAACwAAAAAAAAAKbWluX2xwX291dAAAAAAACwAAAAEAAAAL",
        "AAAABQAAADBFbWl0dGVkIHdoZW4gbGlxdWlkaXR5IGlzIHJlbW92ZWQgZnJvbSB0aGUgcG9vbC4AAAAAAAAAD1JlbW92ZUxpcXVpZGl0eQAAAAABAAAAEHJlbW92ZV9saXF1aWRpdHkAAAAEAAAAAAAAAAhwcm92aWRlcgAAABMAAAABAAAAAAAAAAVscF9pbgAAAAAAAAsAAAAAAAAAAAAAAAZwdF9vdXQAAAAAAAsAAAAAAAAAAAAAAAZzeV9vdXQAAAAAAAsAAAAAAAAAAg==",
        "AAAAAAAAAAAAAAAOc3dhcF9wdF9mb3Jfc3kAAAAAAAMAAAAAAAAABGZyb20AAAATAAAAAAAAAAVwdF9pbgAAAAAAAAsAAAAAAAAACm1pbl9zeV9vdXQAAAAAAAsAAAABAAAACw==",
        "AAAAAAAAAAAAAAAOc3dhcF9zeV9mb3JfcHQAAAAAAAMAAAAAAAAABGZyb20AAAATAAAAAAAAAAVzeV9pbgAAAAAAAAsAAAAAAAAACm1pbl9wdF9vdXQAAAAAAAsAAAABAAAACw==",
        "AAAAAAAAAAAAAAAOc3dhcF9zeV9mb3JfeXQAAAAAAAMAAAAAAAAABGZyb20AAAATAAAAAAAAAAVzeV9pbgAAAAAAAAsAAAAAAAAACm1pbl95dF9vdXQAAAAAAAsAAAABAAAACw==",
        "AAAAAAAAAAAAAAAOc3dhcF95dF9mb3Jfc3kAAAAAAAMAAAAAAAAABGZyb20AAAATAAAAAAAAAAV5dF9pbgAAAAAAAAsAAAAAAAAACm1pbl9zeV9vdXQAAAAAAAsAAAABAAAACw==",
        "AAAAAAAAAAAAAAAPcXVvdGVfcHRfZm9yX3N5AAAAAAEAAAAAAAAABXB0X2luAAAAAAAACwAAAAEAAAPpAAAACwAAAAM=",
        "AAAAAAAAAAAAAAAPcXVvdGVfc3lfZm9yX3B0AAAAAAEAAAAAAAAABXN5X2luAAAAAAAACwAAAAEAAAPpAAAACwAAAAM=",
        "AAAAAAAAAAAAAAAPcXVvdGVfc3lfZm9yX3l0AAAAAAEAAAAAAAAABXN5X2luAAAAAAAACwAAAAEAAAPpAAAACwAAAAM=",
        "AAAAAAAAAAAAAAAPcXVvdGVfeXRfZm9yX3N5AAAAAAEAAAAAAAAABXl0X2luAAAAAAAACwAAAAEAAAPpAAAACwAAAAM=",
        "AAAAAAAAAAAAAAAPdHdhcF93YXJtaW5nX3VwAAAAAAAAAAABAAAD6QAAAAEAAAAD",
        "AAAAAAAAAAAAAAAQcmVtb3ZlX2xpcXVpZGl0eQAAAAQAAAAAAAAABGZyb20AAAATAAAAAAAAAAVscF9pbgAAAAAAAAsAAAAAAAAACm1pbl9wdF9vdXQAAAAAAAsAAAAAAAAACm1pbl9zeV9vdXQAAAAAAAsAAAABAAAD7QAAAAIAAAALAAAACw==" ]),
      options
    )
  }
  public readonly fromJSON = {
    state: this.txFromJSON<Result<State>>,
        config: this.txFromJSON<Result<Config>>,
        bump_ttl: this.txFromJSON<Result<void>>,
        maturity: this.txFromJSON<u64>,
        spot_apy: this.txFromJSON<Result<i128>>,
        total_lp: this.txFromJSON<Result<i128>>,
        twap_apy: this.txFromJSON<Result<i128>>,
        initialize: this.txFromJSON<Result<void>>,
        lp_balance: this.txFromJSON<Result<i128>>,
        reserve_pt: this.txFromJSON<Result<i128>>,
        reserve_sy: this.txFromJSON<Result<i128>>,
        bump_lp_ttl: this.txFromJSON<Result<void>>,
        implied_apy: this.txFromJSON<i128>,
        add_liquidity: this.txFromJSON<i128>,
        swap_pt_for_sy: this.txFromJSON<i128>,
        swap_sy_for_pt: this.txFromJSON<i128>,
        swap_sy_for_yt: this.txFromJSON<i128>,
        swap_yt_for_sy: this.txFromJSON<i128>,
        quote_pt_for_sy: this.txFromJSON<Result<i128>>,
        quote_sy_for_pt: this.txFromJSON<Result<i128>>,
        quote_sy_for_yt: this.txFromJSON<Result<i128>>,
        quote_yt_for_sy: this.txFromJSON<Result<i128>>,
        twap_warming_up: this.txFromJSON<Result<boolean>>,
        remove_liquidity: this.txFromJSON<readonly [i128, i128]>
  }
}