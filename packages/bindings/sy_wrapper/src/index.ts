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
    contractId: "CB63OU5PQPQ3CXET2XH4CI3Z5XKEJUSQTQPH6BLSN5CBC6T3UBFFBFH4",
  }
} as const

export type DataKey = {tag: "Admin", values: void} | {tag: "PendingAdmin", values: void} | {tag: "Underlying", values: void} | {tag: "YieldSource", values: void} | {tag: "TotalShares", values: void} | {tag: "TotalUnderlying", values: void} | {tag: "Paused", values: void};

export const NovaireSyError = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  3: {message:"Unauthorized"},
  4: {message:"InvalidAmount"},
  5: {message:"RateCannotDecrease"},
  6: {message:"InsufficientShares"},
  7: {message:"MathOverflow"},
  8: {message:"MathUnderflow"},
  9: {message:"StorageMissing"},
  10: {message:"Paused"},
  11: {message:"InvalidAdminTransfer"},
  12: {message:"RateIncreaseTooLarge"},
  13: {message:"MinimumDepositNotMet"},
  14: {message:"ZeroSharesMinted"}
}

export interface Client {
  /**
   * Construct and simulate a pause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  pause: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a deposit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  deposit: ({from, amount}: {from: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a unpause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  unpause: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  version: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a withdraw transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  withdraw: ({from, shares}: {from: string, shares: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin, underlying, yield_source}: {admin: string, underlying: string, yield_source: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a accept_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  accept_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a refresh_rate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  refresh_rate: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a total_shares transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  total_shares: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a harvest_yield transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  harvest_yield: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a transfer_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  transfer_admin: ({new_admin}: {new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a preview_deposit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  preview_deposit: ({amount}: {amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a preview_withdraw transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  preview_withdraw: ({shares}: {shares: i128}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a underlying_asset transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  underlying_asset: (options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a get_exchange_rate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_exchange_rate: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

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
      new ContractSpec([ "AAAAAAAAAAAAAAAFcGF1c2UAAAAAAAAAAAAAAQAAA+kAAAPtAAAAAAAAB9AAAAAOTm92YWlyZVN5RXJyb3IAAA==",
        "AAAAAAAAAAAAAAAHZGVwb3NpdAAAAAACAAAAAAAAAARmcm9tAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAQAAA+kAAAALAAAH0AAAAA5Ob3ZhaXJlU3lFcnJvcgAA",
        "AAAAAAAAAAAAAAAHdW5wYXVzZQAAAAAAAAAAAQAAA+kAAAPtAAAAAAAAB9AAAAAOTm92YWlyZVN5RXJyb3IAAA==",
        "AAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAAAAAAAQAAAAQ=",
        "AAAAAAAAAAAAAAAId2l0aGRyYXcAAAACAAAAAAAAAARmcm9tAAAAEwAAAAAAAAAGc2hhcmVzAAAAAAALAAAAAQAAA+kAAAALAAAH0AAAAA5Ob3ZhaXJlU3lFcnJvcgAA",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABwAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAMUGVuZGluZ0FkbWluAAAAAAAAAAAAAAAKVW5kZXJseWluZwAAAAAAAAAAAAAAAAALWWllbGRTb3VyY2UAAAAAAAAAAAAAAAALVG90YWxTaGFyZXMAAAAAAAAAAAAAAAAPVG90YWxVbmRlcmx5aW5nAAAAAAAAAAAAAAAABlBhdXNlZAAA",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAp1bmRlcmx5aW5nAAAAAAATAAAAAAAAAAx5aWVsZF9zb3VyY2UAAAATAAAAAQAAA+kAAAPtAAAAAAAAB9AAAAAOTm92YWlyZVN5RXJyb3IAAA==",
        "AAAAAAAAAAAAAAAMYWNjZXB0X2FkbWluAAAAAAAAAAEAAAPpAAAD7QAAAAAAAAfQAAAADk5vdmFpcmVTeUVycm9yAAA=",
        "AAAAAAAAAAAAAAAMcmVmcmVzaF9yYXRlAAAAAAAAAAEAAAPpAAAD7QAAAAAAAAfQAAAADk5vdmFpcmVTeUVycm9yAAA=",
        "AAAAAAAAAAAAAAAMdG90YWxfc2hhcmVzAAAAAAAAAAEAAAAL",
        "AAAAAAAAAAAAAAANaGFydmVzdF95aWVsZAAAAAAAAAAAAAABAAAD6QAAA+0AAAAAAAAH0AAAAA5Ob3ZhaXJlU3lFcnJvcgAA",
        "AAAAAAAAAAAAAAAOdHJhbnNmZXJfYWRtaW4AAAAAAAEAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAABAAAD6QAAA+0AAAAAAAAH0AAAAA5Ob3ZhaXJlU3lFcnJvcgAA",
        "AAAAAAAAAAAAAAAPcHJldmlld19kZXBvc2l0AAAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAAL",
        "AAAAAAAAAAAAAAAQcHJldmlld193aXRoZHJhdwAAAAEAAAAAAAAABnNoYXJlcwAAAAAACwAAAAEAAAAL",
        "AAAAAAAAAAAAAAAQdW5kZXJseWluZ19hc3NldAAAAAAAAAABAAAD6QAAABMAAAfQAAAADk5vdmFpcmVTeUVycm9yAAA=",
        "AAAABAAAAAAAAAAAAAAADk5vdmFpcmVTeUVycm9yAAAAAAAOAAAAAAAAABJBbHJlYWR5SW5pdGlhbGl6ZWQAAAAAAAEAAAAAAAAADk5vdEluaXRpYWxpemVkAAAAAAACAAAAAAAAAAxVbmF1dGhvcml6ZWQAAAADAAAAAAAAAA1JbnZhbGlkQW1vdW50AAAAAAAABAAAAAAAAAASUmF0ZUNhbm5vdERlY3JlYXNlAAAAAAAFAAAAAAAAABJJbnN1ZmZpY2llbnRTaGFyZXMAAAAAAAYAAAAAAAAADE1hdGhPdmVyZmxvdwAAAAcAAAAAAAAADU1hdGhVbmRlcmZsb3cAAAAAAAAIAAAAAAAAAA5TdG9yYWdlTWlzc2luZwAAAAAACQAAAAAAAAAGUGF1c2VkAAAAAAAKAAAAAAAAABRJbnZhbGlkQWRtaW5UcmFuc2ZlcgAAAAsAAAAAAAAAFFJhdGVJbmNyZWFzZVRvb0xhcmdlAAAADAAAAAAAAAAUTWluaW11bURlcG9zaXROb3RNZXQAAAANAAAAAAAAABBaZXJvU2hhcmVzTWludGVkAAAADg==",
        "AAAAAAAAAAAAAAARZ2V0X2V4Y2hhbmdlX3JhdGUAAAAAAAAAAAAAAQAAAAs=" ]),
      options
    )
  }
  public readonly fromJSON = {
    pause: this.txFromJSON<Result<void>>,
        deposit: this.txFromJSON<Result<i128>>,
        unpause: this.txFromJSON<Result<void>>,
        version: this.txFromJSON<u32>,
        withdraw: this.txFromJSON<Result<i128>>,
        initialize: this.txFromJSON<Result<void>>,
        accept_admin: this.txFromJSON<Result<void>>,
        refresh_rate: this.txFromJSON<Result<void>>,
        total_shares: this.txFromJSON<i128>,
        harvest_yield: this.txFromJSON<Result<void>>,
        transfer_admin: this.txFromJSON<Result<void>>,
        preview_deposit: this.txFromJSON<i128>,
        preview_withdraw: this.txFromJSON<i128>,
        underlying_asset: this.txFromJSON<Result<string>>,
        get_exchange_rate: this.txFromJSON<i128>
  }
}