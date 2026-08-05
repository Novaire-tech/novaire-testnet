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
    contractId: "CCSRZVD7DOGERXLMRUAZRDQHPPPYJUL7O6HS7KDW3JCSSMZACM63KF4T",
  }
} as const

export type DataKey = {tag: "Admin", values: void} | {tag: "Vault", values: void} | {tag: "Tokenizer", values: void} | {tag: "Marketplace", values: void} | {tag: "SyWrapper", values: void} | {tag: "Underlying", values: void} | {tag: "PtToken", values: void} | {tag: "YtToken", values: void} | {tag: "Paused", values: void} | {tag: "UserIntents", values: readonly [string]};

export const NovaireIntentError = {
  1: {message:"Paused"},
  2: {message:"Unauthorized"},
  3: {message:"ZeroAmount"},
  4: {message:"RateTooLow"},
  5: {message:"IntentFailed"},
  6: {message:"AlreadyInitialized"},
  7: {message:"StorageMissing"},
  8: {message:"InvariantViolated"},
  9: {message:"InvalidPercentage"},
  10: {message:"MarketplaceNotBootstrapped"}
}


export interface CumulativeIntentRecord {
  total_deposited_amount: i128;
  total_pt_held: i128;
  total_underlying_received: i128;
  total_yt_sold: i128;
}

export interface Client {
  /**
   * Construct and simulate a pause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  pause: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a unpause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  unpause: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin, vault, tokenizer, marketplace, sy_wrapper, underlying, pt_token, yt_token}: {admin: string, vault: string, tokenizer: string, marketplace: string, sy_wrapper: string, underlying: string, pt_token: string, yt_token: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_user_intent transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_user_intent: ({user}: {user: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<CumulativeIntentRecord>>>

  /**
   * Construct and simulate a get_current_best_rate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_current_best_rate: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a execute_fixed_yield_intent transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  execute_fixed_yield_intent: ({user, usdc_amount, min_implied_rate, min_underlying_out, _maturity_ledger, yt_sale_percentage}: {user: string, usdc_amount: i128, min_implied_rate: i128, min_underlying_out: i128, _maturity_ledger: u32, yt_sale_percentage: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<CumulativeIntentRecord>>>

  /**
   * Construct and simulate a execute_yield_speculation_intent transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  execute_yield_speculation_intent: ({user, usdc_amount, min_yt_out, min_underlying_out}: {user: string, usdc_amount: i128, min_yt_out: i128, min_underlying_out: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

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
      new ContractSpec([ "AAAAAAAAAAAAAAAFcGF1c2UAAAAAAAAAAAAAAQAAA+kAAAPtAAAAAAAAB9AAAAASTm92YWlyZUludGVudEVycm9yAAA=",
        "AAAAAAAAAAAAAAAHdW5wYXVzZQAAAAAAAAAAAQAAA+kAAAPtAAAAAAAAB9AAAAASTm92YWlyZUludGVudEVycm9yAAA=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAACgAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAFVmF1bHQAAAAAAAAAAAAAAAAAAAlUb2tlbml6ZXIAAAAAAAAAAAAAAAAAAAtNYXJrZXRwbGFjZQAAAAAAAAAAAAAAAAlTeVdyYXBwZXIAAAAAAAAAAAAAAAAAAApVbmRlcmx5aW5nAAAAAAAAAAAAAAAAAAdQdFRva2VuAAAAAAAAAAAAAAAAB1l0VG9rZW4AAAAAAAAAAAAAAAAGUGF1c2VkAAAAAAABAAAAAAAAAAtVc2VySW50ZW50cwAAAAABAAAAEw==",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAACAAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAV2YXVsdAAAAAAAABMAAAAAAAAACXRva2VuaXplcgAAAAAAABMAAAAAAAAAC21hcmtldHBsYWNlAAAAABMAAAAAAAAACnN5X3dyYXBwZXIAAAAAABMAAAAAAAAACnVuZGVybHlpbmcAAAAAABMAAAAAAAAACHB0X3Rva2VuAAAAEwAAAAAAAAAIeXRfdG9rZW4AAAATAAAAAQAAA+kAAAPtAAAAAAAAB9AAAAASTm92YWlyZUludGVudEVycm9yAAA=",
        "AAAAAAAAAAAAAAAPZ2V0X3VzZXJfaW50ZW50AAAAAAEAAAAAAAAABHVzZXIAAAATAAAAAQAAA+kAAAfQAAAAFkN1bXVsYXRpdmVJbnRlbnRSZWNvcmQAAAAAB9AAAAASTm92YWlyZUludGVudEVycm9yAAA=",
        "AAAABAAAAAAAAAAAAAAAEk5vdmFpcmVJbnRlbnRFcnJvcgAAAAAACgAAAAAAAAAGUGF1c2VkAAAAAAABAAAAAAAAAAxVbmF1dGhvcml6ZWQAAAACAAAAAAAAAApaZXJvQW1vdW50AAAAAAADAAAAAAAAAApSYXRlVG9vTG93AAAAAAAEAAAAAAAAAAxJbnRlbnRGYWlsZWQAAAAFAAAAAAAAABJBbHJlYWR5SW5pdGlhbGl6ZWQAAAAAAAYAAAAAAAAADlN0b3JhZ2VNaXNzaW5nAAAAAAAHAAAAAAAAABFJbnZhcmlhbnRWaW9sYXRlZAAAAAAAAAgAAAAAAAAAEUludmFsaWRQZXJjZW50YWdlAAAAAAAACQAAAAAAAAAaTWFya2V0cGxhY2VOb3RCb290c3RyYXBwZWQAAAAAAAo=",
        "AAAAAAAAAAAAAAAVZ2V0X2N1cnJlbnRfYmVzdF9yYXRlAAAAAAAAAAAAAAEAAAPpAAAACwAAB9AAAAASTm92YWlyZUludGVudEVycm9yAAA=",
        "AAAAAQAAAAAAAAAAAAAAFkN1bXVsYXRpdmVJbnRlbnRSZWNvcmQAAAAAAAQAAAAAAAAAFnRvdGFsX2RlcG9zaXRlZF9hbW91bnQAAAAAAAsAAAAAAAAADXRvdGFsX3B0X2hlbGQAAAAAAAALAAAAAAAAABl0b3RhbF91bmRlcmx5aW5nX3JlY2VpdmVkAAAAAAAACwAAAAAAAAANdG90YWxfeXRfc29sZAAAAAAAAAs=",
        "AAAAAAAAAAAAAAAaZXhlY3V0ZV9maXhlZF95aWVsZF9pbnRlbnQAAAAAAAYAAAAAAAAABHVzZXIAAAATAAAAAAAAAAt1c2RjX2Ftb3VudAAAAAALAAAAAAAAABBtaW5faW1wbGllZF9yYXRlAAAACwAAAAAAAAASbWluX3VuZGVybHlpbmdfb3V0AAAAAAALAAAAAAAAABBfbWF0dXJpdHlfbGVkZ2VyAAAABAAAAAAAAAASeXRfc2FsZV9wZXJjZW50YWdlAAAAAAAEAAAAAQAAA+kAAAfQAAAAFkN1bXVsYXRpdmVJbnRlbnRSZWNvcmQAAAAAB9AAAAASTm92YWlyZUludGVudEVycm9yAAA=",
        "AAAAAAAAAAAAAAAgZXhlY3V0ZV95aWVsZF9zcGVjdWxhdGlvbl9pbnRlbnQAAAAEAAAAAAAAAAR1c2VyAAAAEwAAAAAAAAALdXNkY19hbW91bnQAAAAACwAAAAAAAAAKbWluX3l0X291dAAAAAAACwAAAAAAAAASbWluX3VuZGVybHlpbmdfb3V0AAAAAAALAAAAAQAAA+kAAAALAAAH0AAAABJOb3ZhaXJlSW50ZW50RXJyb3IAAA==" ]),
      options
    )
  }
  public readonly fromJSON = {
    pause: this.txFromJSON<Result<void>>,
        unpause: this.txFromJSON<Result<void>>,
        initialize: this.txFromJSON<Result<void>>,
        get_user_intent: this.txFromJSON<Result<CumulativeIntentRecord>>,
        get_current_best_rate: this.txFromJSON<Result<i128>>,
        execute_fixed_yield_intent: this.txFromJSON<Result<CumulativeIntentRecord>>,
        execute_yield_speculation_intent: this.txFromJSON<Result<i128>>
  }
}