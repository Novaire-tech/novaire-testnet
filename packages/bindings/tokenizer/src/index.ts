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
    contractId: "CCJOCOKLN3JUGGIUCCCMHYXMQ4FIBG3HX7SYZQYOKIJNUKRY75ASNWC2",
  }
} as const

export type DataKey = {tag: "Admin", values: void} | {tag: "Vault", values: void} | {tag: "PtToken", values: void} | {tag: "YtToken", values: void} | {tag: "SyWrapper", values: void} | {tag: "MaturityLedger", values: void} | {tag: "EpochId", values: void} | {tag: "EpochStartIndex", values: void} | {tag: "TotalPtMinted", values: void} | {tag: "SettlementExchangeRate", values: void};


export interface TokenizerMetadata {
  admin: string;
  epoch_id: u32;
  epoch_start_index: i128;
  epoch_state: u32;
  maturity_ledger: u32;
  pt_token: string;
  settlement_exchange_rate: Option<i128>;
  sy_wrapper: string;
  total_pt_minted: i128;
  vault: string;
  version: u32;
  yt_token: string;
}

export const NovaireTokenizerError = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  3: {message:"Unauthorized"},
  4: {message:"EpochNotOpen"},
  5: {message:"EpochNotMatured"},
  6: {message:"EpochNotSettled"},
  7: {message:"AlreadySettled"},
  8: {message:"InsufficientBalance"},
  9: {message:"InvariantViolated"},
  10: {message:"InvalidAmount"},
  11: {message:"MathOverflow"},
  12: {message:"MathUnderflow"},
  13: {message:"StorageMissing"}
}

export interface Client {
  /**
   * Construct and simulate a version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  version: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a metadata transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  metadata: (options?: MethodOptions) => Promise<AssembledTransaction<Result<TokenizerMetadata>>>

  /**
   * Construct and simulate a redeem_pt transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Redeems PT for guaranteed principal physical underlying assets.
   * 
   * Requires Epoch State: `Settled`. (Post-maturity, post-settlement).
   */
  redeem_pt: ({user, pt_amount}: {user: string, pt_amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Initializes the Tokenizer with its critical dependencies.
   */
  initialize: ({admin, vault, pt_token, yt_token, sy_wrapper, maturity_ledger}: {admin: string, vault: string, pt_token: string, yt_token: string, sy_wrapper: string, maturity_ledger: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a mint_pt_yt transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Mints PT and YT tokens identically in exchange for Vault Shares.
   * 
   * Requires Epoch State: `Open`
   */
  mint_pt_yt: ({user, sy_shares}: {user: string, sy_shares: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<readonly [i128, i128]>>>

  /**
   * Construct and simulate a claim_yield transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Claims accrued yield for a user by withdrawing the physical underlying asset.
   * 
   * Requires Epoch State: `Open`, `Matured`, or `Settled`.
   */
  claim_yield: ({user}: {user: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a settle_epoch transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Settles the epoch, permanently locking the settlement exchange rate.
   * 
   * Requires Epoch State: `Matured`
   */
  settle_epoch: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_epoch_state transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Checks the exact state of the epoch.
   */
  get_epoch_state: (options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

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
      new ContractSpec([ "AAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAAAAAAAQAAAAQ=",
        "AAAAAAAAAAAAAAAIbWV0YWRhdGEAAAAAAAAAAQAAA+kAAAfQAAAAEVRva2VuaXplck1ldGFkYXRhAAAAAAAH0AAAABVOb3ZhaXJlVG9rZW5pemVyRXJyb3IAAAA=",
        "AAAAAAAAAINSZWRlZW1zIFBUIGZvciBndWFyYW50ZWVkIHByaW5jaXBhbCBwaHlzaWNhbCB1bmRlcmx5aW5nIGFzc2V0cy4KClJlcXVpcmVzIEVwb2NoIFN0YXRlOiBgU2V0dGxlZGAuIChQb3N0LW1hdHVyaXR5LCBwb3N0LXNldHRsZW1lbnQpLgAAAAAJcmVkZWVtX3B0AAAAAAAAAgAAAAAAAAAEdXNlcgAAABMAAAAAAAAACXB0X2Ftb3VudAAAAAAAAAsAAAABAAAD6QAAAAsAAAfQAAAAFU5vdmFpcmVUb2tlbml6ZXJFcnJvcgAAAA==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAACgAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAFVmF1bHQAAAAAAAAAAAAAAAAAAAdQdFRva2VuAAAAAAAAAAAAAAAAB1l0VG9rZW4AAAAAAAAAAAAAAAAJU3lXcmFwcGVyAAAAAAAAAAAAAAAAAAAOTWF0dXJpdHlMZWRnZXIAAAAAAAAAAAAAAAAAB0Vwb2NoSWQAAAAAAAAAAAAAAAAPRXBvY2hTdGFydEluZGV4AAAAAAAAAAAAAAAADVRvdGFsUHRNaW50ZWQAAAAAAAAAAAAAAAAAABZTZXR0bGVtZW50RXhjaGFuZ2VSYXRlAAA=",
        "AAAAAAAAADlJbml0aWFsaXplcyB0aGUgVG9rZW5pemVyIHdpdGggaXRzIGNyaXRpY2FsIGRlcGVuZGVuY2llcy4AAAAAAAAKaW5pdGlhbGl6ZQAAAAAABgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAV2YXVsdAAAAAAAABMAAAAAAAAACHB0X3Rva2VuAAAAEwAAAAAAAAAIeXRfdG9rZW4AAAATAAAAAAAAAApzeV93cmFwcGVyAAAAAAATAAAAAAAAAA9tYXR1cml0eV9sZWRnZXIAAAAABAAAAAEAAAPpAAAD7QAAAAAAAAfQAAAAFU5vdmFpcmVUb2tlbml6ZXJFcnJvcgAAAA==",
        "AAAAAAAAAF5NaW50cyBQVCBhbmQgWVQgdG9rZW5zIGlkZW50aWNhbGx5IGluIGV4Y2hhbmdlIGZvciBWYXVsdCBTaGFyZXMuCgpSZXF1aXJlcyBFcG9jaCBTdGF0ZTogYE9wZW5gAAAAAAAKbWludF9wdF95dAAAAAAAAgAAAAAAAAAEdXNlcgAAABMAAAAAAAAACXN5X3NoYXJlcwAAAAAAAAsAAAABAAAD6QAAA+0AAAACAAAACwAAAAsAAAfQAAAAFU5vdmFpcmVUb2tlbml6ZXJFcnJvcgAAAA==",
        "AAAAAAAAAIVDbGFpbXMgYWNjcnVlZCB5aWVsZCBmb3IgYSB1c2VyIGJ5IHdpdGhkcmF3aW5nIHRoZSBwaHlzaWNhbCB1bmRlcmx5aW5nIGFzc2V0LgoKUmVxdWlyZXMgRXBvY2ggU3RhdGU6IGBPcGVuYCwgYE1hdHVyZWRgLCBvciBgU2V0dGxlZGAuAAAAAAAAC2NsYWltX3lpZWxkAAAAAAEAAAAAAAAABHVzZXIAAAATAAAAAQAAA+kAAAALAAAH0AAAABVOb3ZhaXJlVG9rZW5pemVyRXJyb3IAAAA=",
        "AAAAAAAAAGVTZXR0bGVzIHRoZSBlcG9jaCwgcGVybWFuZW50bHkgbG9ja2luZyB0aGUgc2V0dGxlbWVudCBleGNoYW5nZSByYXRlLgoKUmVxdWlyZXMgRXBvY2ggU3RhdGU6IGBNYXR1cmVkYAAAAAAAAAxzZXR0bGVfZXBvY2gAAAAAAAAAAQAAA+kAAAPtAAAAAAAAB9AAAAAVTm92YWlyZVRva2VuaXplckVycm9yAAAA",
        "AAAAAAAAACRDaGVja3MgdGhlIGV4YWN0IHN0YXRlIG9mIHRoZSBlcG9jaC4AAAAPZ2V0X2Vwb2NoX3N0YXRlAAAAAAAAAAABAAAD6QAAAAQAAAfQAAAAFU5vdmFpcmVUb2tlbml6ZXJFcnJvcgAAAA==",
        "AAAAAQAAAAAAAAAAAAAAEVRva2VuaXplck1ldGFkYXRhAAAAAAAADAAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAhlcG9jaF9pZAAAAAQAAAAAAAAAEWVwb2NoX3N0YXJ0X2luZGV4AAAAAAAACwAAAAAAAAALZXBvY2hfc3RhdGUAAAAABAAAAAAAAAAPbWF0dXJpdHlfbGVkZ2VyAAAAAAQAAAAAAAAACHB0X3Rva2VuAAAAEwAAAAAAAAAYc2V0dGxlbWVudF9leGNoYW5nZV9yYXRlAAAD6AAAAAsAAAAAAAAACnN5X3dyYXBwZXIAAAAAABMAAAAAAAAAD3RvdGFsX3B0X21pbnRlZAAAAAALAAAAAAAAAAV2YXVsdAAAAAAAABMAAAAAAAAAB3ZlcnNpb24AAAAABAAAAAAAAAAIeXRfdG9rZW4AAAAT",
        "AAAABAAAAAAAAAAAAAAAFU5vdmFpcmVUb2tlbml6ZXJFcnJvcgAAAAAAAA0AAAAAAAAAEkFscmVhZHlJbml0aWFsaXplZAAAAAAAAQAAAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAIAAAAAAAAADFVuYXV0aG9yaXplZAAAAAMAAAAAAAAADEVwb2NoTm90T3BlbgAAAAQAAAAAAAAAD0Vwb2NoTm90TWF0dXJlZAAAAAAFAAAAAAAAAA9FcG9jaE5vdFNldHRsZWQAAAAABgAAAAAAAAAOQWxyZWFkeVNldHRsZWQAAAAAAAcAAAAAAAAAE0luc3VmZmljaWVudEJhbGFuY2UAAAAACAAAAAAAAAARSW52YXJpYW50VmlvbGF0ZWQAAAAAAAAJAAAAAAAAAA1JbnZhbGlkQW1vdW50AAAAAAAACgAAAAAAAAAMTWF0aE92ZXJmbG93AAAACwAAAAAAAAANTWF0aFVuZGVyZmxvdwAAAAAAAAwAAAAAAAAADlN0b3JhZ2VNaXNzaW5nAAAAAAAN" ]),
      options
    )
  }
  public readonly fromJSON = {
    version: this.txFromJSON<u32>,
        metadata: this.txFromJSON<Result<TokenizerMetadata>>,
        redeem_pt: this.txFromJSON<Result<i128>>,
        initialize: this.txFromJSON<Result<void>>,
        mint_pt_yt: this.txFromJSON<Result<readonly [i128, i128]>>,
        claim_yield: this.txFromJSON<Result<i128>>,
        settle_epoch: this.txFromJSON<Result<void>>,
        get_epoch_state: this.txFromJSON<Result<u32>>
  }
}