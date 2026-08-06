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
    contractId: "CA5ZRMODPKMS7QAMMVZ2NZGUBGTH2ATHTGONTB4WOH7DIJSCJNE6TN7O",
  }
} as const

export type DataKey = {tag: "Admin", values: void} | {tag: "PendingAdmin", values: void} | {tag: "Underlying", values: void} | {tag: "YieldSource", values: void} | {tag: "TotalShares", values: void} | {tag: "TotalUnderlying", values: void} | {tag: "Paused", values: void};


/**
 * A Blend Capital `Request`, as submitted to `Pool::submit`. Only `Supply` (0) and
 * `Withdraw` (1) request types are ever used by this contract - sy_wrapper never
 * borrows or posts collateral, it only ever lends the underlying for yield.
 * 
 * Field layout confirmed against the real Blend v2 pool source
 * (blend-capital/blend-contracts-v2, pool/src/pool/actions.rs) via GitHub.
 */
export interface Request {
  address: string;
  amount: i128;
  request_type: u32;
}


/**
 * A Blend Capital `Positions` snapshot, as returned by `Pool::get_positions`.
 * 
 * CONFIDENCE NOTE: confirmed via the real Blend v2 source that `Positions` has exactly
 * these three fields (`collateral`, `liabilities`, `supply`), and that they are keyed by
 * `u32` **reserve index** (not by asset `Address`) - the pool assigns each reserve in a
 * market a small integer index and the positions maps use that index as the key, not the
 * asset address itself. Since sy_wrapper only ever submits `Supply`/`Withdraw` requests
 * for a single underlying asset and never touches any other reserve in the pool, we don't
 * need to know that index: whatever (single) entry ends up in our `supply` map belongs
 * entirely to us, so we can just sum all values in the map rather than looking up a
 * specific key.
 */
export interface Positions {
  collateral: Map<u32, i128>;
  liabilities: Map<u32, i128>;
  supply: Map<u32, i128>;
}

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
   * Construct and simulate a mark_loss transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Realizes a loss in the yield source (exploit, slashing, bad debt) by lowering the
   * recorded `TotalUnderlying` to the actual on-chain balance.
   * 
   * `refresh_rate` deliberately only ever ratchets `TotalUnderlying` up (protected by
   * `RateCannotDecrease`) so that no caller can grief the share price down by front-running
   * a legitimate accrual. But that leaves no path at all for a genuine loss: if the yield
   * source's actual balance drops below the recorded total, `refresh_rate` does nothing,
   * the exchange rate stays permanently inflated, and `withdraw` keeps paying out against
   * a rate that no longer reflects real backing — first withdrawers drain more than exists,
   * later ones hit a failed transfer. This function is the explicit, admin-gated escape
   * hatch for that case: it can only ever decrease `TotalUnderlying` down to the measured
   * balance, never below it, so it cannot be used to under-report backing beyond reality.
   */
  mark_loss: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

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
        "AAAAAAAAA5JSZWFsaXplcyBhIGxvc3MgaW4gdGhlIHlpZWxkIHNvdXJjZSAoZXhwbG9pdCwgc2xhc2hpbmcsIGJhZCBkZWJ0KSBieSBsb3dlcmluZyB0aGUKcmVjb3JkZWQgYFRvdGFsVW5kZXJseWluZ2AgdG8gdGhlIGFjdHVhbCBvbi1jaGFpbiBiYWxhbmNlLgoKYHJlZnJlc2hfcmF0ZWAgZGVsaWJlcmF0ZWx5IG9ubHkgZXZlciByYXRjaGV0cyBgVG90YWxVbmRlcmx5aW5nYCB1cCAocHJvdGVjdGVkIGJ5CmBSYXRlQ2Fubm90RGVjcmVhc2VgKSBzbyB0aGF0IG5vIGNhbGxlciBjYW4gZ3JpZWYgdGhlIHNoYXJlIHByaWNlIGRvd24gYnkgZnJvbnQtcnVubmluZwphIGxlZ2l0aW1hdGUgYWNjcnVhbC4gQnV0IHRoYXQgbGVhdmVzIG5vIHBhdGggYXQgYWxsIGZvciBhIGdlbnVpbmUgbG9zczogaWYgdGhlIHlpZWxkCnNvdXJjZSdzIGFjdHVhbCBiYWxhbmNlIGRyb3BzIGJlbG93IHRoZSByZWNvcmRlZCB0b3RhbCwgYHJlZnJlc2hfcmF0ZWAgZG9lcyBub3RoaW5nLAp0aGUgZXhjaGFuZ2UgcmF0ZSBzdGF5cyBwZXJtYW5lbnRseSBpbmZsYXRlZCwgYW5kIGB3aXRoZHJhd2Aga2VlcHMgcGF5aW5nIG91dCBhZ2FpbnN0CmEgcmF0ZSB0aGF0IG5vIGxvbmdlciByZWZsZWN0cyByZWFsIGJhY2tpbmcg4oCUIGZpcnN0IHdpdGhkcmF3ZXJzIGRyYWluIG1vcmUgdGhhbiBleGlzdHMsCmxhdGVyIG9uZXMgaGl0IGEgZmFpbGVkIHRyYW5zZmVyLiBUaGlzIGZ1bmN0aW9uIGlzIHRoZSBleHBsaWNpdCwgYWRtaW4tZ2F0ZWQgZXNjYXBlCmhhdGNoIGZvciB0aGF0IGNhc2U6IGl0IGNhbiBvbmx5IGV2ZXIgZGVjcmVhc2UgYFRvdGFsVW5kZXJseWluZ2AgZG93biB0byB0aGUgbWVhc3VyZWQKYmFsYW5jZSwgbmV2ZXIgYmVsb3cgaXQsIHNvIGl0IGNhbm5vdCBiZSB1c2VkIHRvIHVuZGVyLXJlcG9ydCBiYWNraW5nIGJleW9uZCByZWFsaXR5LgAAAAAACW1hcmtfbG9zcwAAAAAAAAAAAAABAAAD6QAAAAsAAAfQAAAADk5vdmFpcmVTeUVycm9yAAA=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABwAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAMUGVuZGluZ0FkbWluAAAAAAAAAAAAAAAKVW5kZXJseWluZwAAAAAAAAAAAFNBZGRyZXNzIG9mIHRoZSBCbGVuZCBDYXBpdGFsIGxlbmRpbmcgcG9vbCB0aGlzIGNvbnRyYWN0IHN1cHBsaWVzIHRoZSB1bmRlcmx5aW5nIHRvLgAAAAALWWllbGRTb3VyY2UAAAAAAAAAAAAAAAALVG90YWxTaGFyZXMAAAAAAAAAAAAAAAAPVG90YWxVbmRlcmx5aW5nAAAAAAAAAAAAAAAABlBhdXNlZAAA",
        "AAAAAQAAAXBBIEJsZW5kIENhcGl0YWwgYFJlcXVlc3RgLCBhcyBzdWJtaXR0ZWQgdG8gYFBvb2w6OnN1Ym1pdGAuIE9ubHkgYFN1cHBseWAgKDApIGFuZApgV2l0aGRyYXdgICgxKSByZXF1ZXN0IHR5cGVzIGFyZSBldmVyIHVzZWQgYnkgdGhpcyBjb250cmFjdCAtIHN5X3dyYXBwZXIgbmV2ZXIKYm9ycm93cyBvciBwb3N0cyBjb2xsYXRlcmFsLCBpdCBvbmx5IGV2ZXIgbGVuZHMgdGhlIHVuZGVybHlpbmcgZm9yIHlpZWxkLgoKRmllbGQgbGF5b3V0IGNvbmZpcm1lZCBhZ2FpbnN0IHRoZSByZWFsIEJsZW5kIHYyIHBvb2wgc291cmNlCihibGVuZC1jYXBpdGFsL2JsZW5kLWNvbnRyYWN0cy12MiwgcG9vbC9zcmMvcG9vbC9hY3Rpb25zLnJzKSB2aWEgR2l0SHViLgAAAAAAAAAHUmVxdWVzdAAAAAADAAAAAAAAAAdhZGRyZXNzAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAMcmVxdWVzdF90eXBlAAAABA==",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAp1bmRlcmx5aW5nAAAAAAATAAAAAAAAAAx5aWVsZF9zb3VyY2UAAAATAAAAAQAAA+kAAAPtAAAAAAAAB9AAAAAOTm92YWlyZVN5RXJyb3IAAA==",
        "AAAAAQAAAwhBIEJsZW5kIENhcGl0YWwgYFBvc2l0aW9uc2Agc25hcHNob3QsIGFzIHJldHVybmVkIGJ5IGBQb29sOjpnZXRfcG9zaXRpb25zYC4KCkNPTkZJREVOQ0UgTk9URTogY29uZmlybWVkIHZpYSB0aGUgcmVhbCBCbGVuZCB2MiBzb3VyY2UgdGhhdCBgUG9zaXRpb25zYCBoYXMgZXhhY3RseQp0aGVzZSB0aHJlZSBmaWVsZHMgKGBjb2xsYXRlcmFsYCwgYGxpYWJpbGl0aWVzYCwgYHN1cHBseWApLCBhbmQgdGhhdCB0aGV5IGFyZSBrZXllZCBieQpgdTMyYCAqKnJlc2VydmUgaW5kZXgqKiAobm90IGJ5IGFzc2V0IGBBZGRyZXNzYCkgLSB0aGUgcG9vbCBhc3NpZ25zIGVhY2ggcmVzZXJ2ZSBpbiBhCm1hcmtldCBhIHNtYWxsIGludGVnZXIgaW5kZXggYW5kIHRoZSBwb3NpdGlvbnMgbWFwcyB1c2UgdGhhdCBpbmRleCBhcyB0aGUga2V5LCBub3QgdGhlCmFzc2V0IGFkZHJlc3MgaXRzZWxmLiBTaW5jZSBzeV93cmFwcGVyIG9ubHkgZXZlciBzdWJtaXRzIGBTdXBwbHlgL2BXaXRoZHJhd2AgcmVxdWVzdHMKZm9yIGEgc2luZ2xlIHVuZGVybHlpbmcgYXNzZXQgYW5kIG5ldmVyIHRvdWNoZXMgYW55IG90aGVyIHJlc2VydmUgaW4gdGhlIHBvb2wsIHdlIGRvbid0Cm5lZWQgdG8ga25vdyB0aGF0IGluZGV4OiB3aGF0ZXZlciAoc2luZ2xlKSBlbnRyeSBlbmRzIHVwIGluIG91ciBgc3VwcGx5YCBtYXAgYmVsb25ncwplbnRpcmVseSB0byB1cywgc28gd2UgY2FuIGp1c3Qgc3VtIGFsbCB2YWx1ZXMgaW4gdGhlIG1hcCByYXRoZXIgdGhhbiBsb29raW5nIHVwIGEKc3BlY2lmaWMga2V5LgAAAAAAAAAJUG9zaXRpb25zAAAAAAAAAwAAAAAAAAAKY29sbGF0ZXJhbAAAAAAD7AAAAAQAAAALAAAAAAAAAAtsaWFiaWxpdGllcwAAAAPsAAAABAAAAAsAAAAAAAAABnN1cHBseQAAAAAD7AAAAAQAAAAL",
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
        mark_loss: this.txFromJSON<Result<i128>>,
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