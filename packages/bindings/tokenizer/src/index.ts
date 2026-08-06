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
    contractId: "CC2UGJHE23TVZPP7OET5IYKEEYKKE45KXSVTAEUUUHPZF3WTHHDS3USW",
  }
} as const

export type DataKey = {tag: "Admin", values: void} | {tag: "Vault", values: void} | {tag: "PtToken", values: void} | {tag: "YtToken", values: void} | {tag: "SyWrapper", values: void} | {tag: "MaturityLedger", values: void} | {tag: "EpochId", values: void} | {tag: "EpochStartIndex", values: void} | {tag: "TotalPtMinted", values: void} | {tag: "SettlementExchangeRate", values: void} | {tag: "LastRecordedSurplus", values: void};


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

  /**
   * Construct and simulate a preview_yield_index transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Previews what the YT reward-per-share accumulator (`YtToken::yield_index`)
   * would become if `refresh_yield_index` were called right now, without
   * mutating any state. Used both internally and by `YtToken::claimable_yield`
   * for a live, pre-refresh preview of pending yield.
   * 
   * This is the fix for the M2 double-mint insolvency bug: rather than driving
   * YT accrual off the raw SyWrapper exchange rate (which implicitly assumes
   * 1 YT token is always backed by exactly 1 real vault share — true only at
   * genesis, and broken the moment any claim withdraws real shares without
   * reducing YT balance), the index only ever advances by
   * (realized surplus growth / current YT supply), i.e. a proper
   * reward-per-share accumulator. A user's real backing shrinking after a
   * claim can no longer cause their nominal YT balance to be over-credited on
   * subsequent accrual.
   */
  preview_yield_index: (options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a refresh_yield_index transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Permissionless (like `SyWrapper::refresh_rate`) — callable by anyone.
   * Public entry-point wrapper around `refresh_yield_index_and_get_surplus`
   * for external/keeper use, where the returned surplus isn't needed.
   */
  refresh_yield_index: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_surplus_snapshot transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Read-only `(current_surplus_raw, last_recorded_surplus_raw)` snapshot.
   * 
   * Deliberately does NOT call into YtToken (unlike `preview_yield_index` /
   * `refresh_yield_index`, which read/write YtToken's index directly). This is
   * the function YtToken itself calls (from `transfer`/`transfer_from`/
   * `claimable_yield`) to compute its own index update locally — Soroban
   * rejects a contract calling back into itself further up the same call
   * stack ("contract re-entry"), so YtToken cannot safely call
   * `preview_yield_index`/`refresh_yield_index` (which call back into
   * YtToken) from within its own entry points. This getter breaks that cycle.
   */
  get_surplus_snapshot: (options?: MethodOptions) => Promise<AssembledTransaction<Result<readonly [i128, i128]>>>

  /**
   * Construct and simulate a record_surplus_baseline_pub transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Public wrapper around `record_surplus_baseline`, safe for YtToken to call
   * for the same reason as `get_surplus_snapshot` (touches no YtToken state).
   */
  record_surplus_baseline_pub: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

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
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAACwAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAFVmF1bHQAAAAAAAAAAAAAAAAAAAdQdFRva2VuAAAAAAAAAAAAAAAAB1l0VG9rZW4AAAAAAAAAAAAAAAAJU3lXcmFwcGVyAAAAAAAAAAAAAAAAAAAOTWF0dXJpdHlMZWRnZXIAAAAAAAAAAAAAAAAAB0Vwb2NoSWQAAAAAAAAAAAAAAAAPRXBvY2hTdGFydEluZGV4AAAAAAAAAAAAAAAADVRvdGFsUHRNaW50ZWQAAAAAAAAAAAAAAAAAABZTZXR0bGVtZW50RXhjaGFuZ2VSYXRlAAAAAAAAAAAAhlJhdyBzdXJwbHVzIChhc3NldHNfaGVsZF9yYXcgLSBwdF9saWFiaWxpdHlfcmF3KSByZWNvcmRlZCBhcyBvZiB0aGUgbGFzdApyZXdhcmQtcGVyLVlUIGFjY3VtdWxhdG9yIHJlZnJlc2guIFNlZSBgcmVmcmVzaF95aWVsZF9pbmRleGAuAAAAAAATTGFzdFJlY29yZGVkU3VycGx1cwA=",
        "AAAAAAAAADlJbml0aWFsaXplcyB0aGUgVG9rZW5pemVyIHdpdGggaXRzIGNyaXRpY2FsIGRlcGVuZGVuY2llcy4AAAAAAAAKaW5pdGlhbGl6ZQAAAAAABgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAV2YXVsdAAAAAAAABMAAAAAAAAACHB0X3Rva2VuAAAAEwAAAAAAAAAIeXRfdG9rZW4AAAATAAAAAAAAAApzeV93cmFwcGVyAAAAAAATAAAAAAAAAA9tYXR1cml0eV9sZWRnZXIAAAAABAAAAAEAAAPpAAAD7QAAAAAAAAfQAAAAFU5vdmFpcmVUb2tlbml6ZXJFcnJvcgAAAA==",
        "AAAAAAAAAF5NaW50cyBQVCBhbmQgWVQgdG9rZW5zIGlkZW50aWNhbGx5IGluIGV4Y2hhbmdlIGZvciBWYXVsdCBTaGFyZXMuCgpSZXF1aXJlcyBFcG9jaCBTdGF0ZTogYE9wZW5gAAAAAAAKbWludF9wdF95dAAAAAAAAgAAAAAAAAAEdXNlcgAAABMAAAAAAAAACXN5X3NoYXJlcwAAAAAAAAsAAAABAAAD6QAAA+0AAAACAAAACwAAAAsAAAfQAAAAFU5vdmFpcmVUb2tlbml6ZXJFcnJvcgAAAA==",
        "AAAAAAAAAIVDbGFpbXMgYWNjcnVlZCB5aWVsZCBmb3IgYSB1c2VyIGJ5IHdpdGhkcmF3aW5nIHRoZSBwaHlzaWNhbCB1bmRlcmx5aW5nIGFzc2V0LgoKUmVxdWlyZXMgRXBvY2ggU3RhdGU6IGBPcGVuYCwgYE1hdHVyZWRgLCBvciBgU2V0dGxlZGAuAAAAAAAAC2NsYWltX3lpZWxkAAAAAAEAAAAAAAAABHVzZXIAAAATAAAAAQAAA+kAAAALAAAH0AAAABVOb3ZhaXJlVG9rZW5pemVyRXJyb3IAAAA=",
        "AAAAAAAAAGVTZXR0bGVzIHRoZSBlcG9jaCwgcGVybWFuZW50bHkgbG9ja2luZyB0aGUgc2V0dGxlbWVudCBleGNoYW5nZSByYXRlLgoKUmVxdWlyZXMgRXBvY2ggU3RhdGU6IGBNYXR1cmVkYAAAAAAAAAxzZXR0bGVfZXBvY2gAAAAAAAAAAQAAA+kAAAPtAAAAAAAAB9AAAAAVTm92YWlyZVRva2VuaXplckVycm9yAAAA",
        "AAAAAAAAACRDaGVja3MgdGhlIGV4YWN0IHN0YXRlIG9mIHRoZSBlcG9jaC4AAAAPZ2V0X2Vwb2NoX3N0YXRlAAAAAAAAAAABAAAD6QAAAAQAAAfQAAAAFU5vdmFpcmVUb2tlbml6ZXJFcnJvcgAAAA==",
        "AAAAAAAAA0pQcmV2aWV3cyB3aGF0IHRoZSBZVCByZXdhcmQtcGVyLXNoYXJlIGFjY3VtdWxhdG9yIChgWXRUb2tlbjo6eWllbGRfaW5kZXhgKQp3b3VsZCBiZWNvbWUgaWYgYHJlZnJlc2hfeWllbGRfaW5kZXhgIHdlcmUgY2FsbGVkIHJpZ2h0IG5vdywgd2l0aG91dAptdXRhdGluZyBhbnkgc3RhdGUuIFVzZWQgYm90aCBpbnRlcm5hbGx5IGFuZCBieSBgWXRUb2tlbjo6Y2xhaW1hYmxlX3lpZWxkYApmb3IgYSBsaXZlLCBwcmUtcmVmcmVzaCBwcmV2aWV3IG9mIHBlbmRpbmcgeWllbGQuCgpUaGlzIGlzIHRoZSBmaXggZm9yIHRoZSBNMiBkb3VibGUtbWludCBpbnNvbHZlbmN5IGJ1ZzogcmF0aGVyIHRoYW4gZHJpdmluZwpZVCBhY2NydWFsIG9mZiB0aGUgcmF3IFN5V3JhcHBlciBleGNoYW5nZSByYXRlICh3aGljaCBpbXBsaWNpdGx5IGFzc3VtZXMKMSBZVCB0b2tlbiBpcyBhbHdheXMgYmFja2VkIGJ5IGV4YWN0bHkgMSByZWFsIHZhdWx0IHNoYXJlIOKAlCB0cnVlIG9ubHkgYXQKZ2VuZXNpcywgYW5kIGJyb2tlbiB0aGUgbW9tZW50IGFueSBjbGFpbSB3aXRoZHJhd3MgcmVhbCBzaGFyZXMgd2l0aG91dApyZWR1Y2luZyBZVCBiYWxhbmNlKSwgdGhlIGluZGV4IG9ubHkgZXZlciBhZHZhbmNlcyBieQoocmVhbGl6ZWQgc3VycGx1cyBncm93dGggLyBjdXJyZW50IFlUIHN1cHBseSksIGkuZS4gYSBwcm9wZXIKcmV3YXJkLXBlci1zaGFyZSBhY2N1bXVsYXRvci4gQSB1c2VyJ3MgcmVhbCBiYWNraW5nIHNocmlua2luZyBhZnRlciBhCmNsYWltIGNhbiBubyBsb25nZXIgY2F1c2UgdGhlaXIgbm9taW5hbCBZVCBiYWxhbmNlIHRvIGJlIG92ZXItY3JlZGl0ZWQgb24Kc3Vic2VxdWVudCBhY2NydWFsLgAAAAAAE3ByZXZpZXdfeWllbGRfaW5kZXgAAAAAAAAAAAEAAAPpAAAACwAAB9AAAAAVTm92YWlyZVRva2VuaXplckVycm9yAAAA",
        "AAAAAAAAANFQZXJtaXNzaW9ubGVzcyAobGlrZSBgU3lXcmFwcGVyOjpyZWZyZXNoX3JhdGVgKSDigJQgY2FsbGFibGUgYnkgYW55b25lLgpQdWJsaWMgZW50cnktcG9pbnQgd3JhcHBlciBhcm91bmQgYHJlZnJlc2hfeWllbGRfaW5kZXhfYW5kX2dldF9zdXJwbHVzYApmb3IgZXh0ZXJuYWwva2VlcGVyIHVzZSwgd2hlcmUgdGhlIHJldHVybmVkIHN1cnBsdXMgaXNuJ3QgbmVlZGVkLgAAAAAAABNyZWZyZXNoX3lpZWxkX2luZGV4AAAAAAAAAAABAAAD6QAAA+0AAAAAAAAH0AAAABVOb3ZhaXJlVG9rZW5pemVyRXJyb3IAAAA=",
        "AAAAAQAAAAAAAAAAAAAAEVRva2VuaXplck1ldGFkYXRhAAAAAAAADAAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAhlcG9jaF9pZAAAAAQAAAAAAAAAEWVwb2NoX3N0YXJ0X2luZGV4AAAAAAAACwAAAAAAAAALZXBvY2hfc3RhdGUAAAAABAAAAAAAAAAPbWF0dXJpdHlfbGVkZ2VyAAAAAAQAAAAAAAAACHB0X3Rva2VuAAAAEwAAAAAAAAAYc2V0dGxlbWVudF9leGNoYW5nZV9yYXRlAAAD6AAAAAsAAAAAAAAACnN5X3dyYXBwZXIAAAAAABMAAAAAAAAAD3RvdGFsX3B0X21pbnRlZAAAAAALAAAAAAAAAAV2YXVsdAAAAAAAABMAAAAAAAAAB3ZlcnNpb24AAAAABAAAAAAAAAAIeXRfdG9rZW4AAAAT",
        "AAAAAAAAAnFSZWFkLW9ubHkgYChjdXJyZW50X3N1cnBsdXNfcmF3LCBsYXN0X3JlY29yZGVkX3N1cnBsdXNfcmF3KWAgc25hcHNob3QuCgpEZWxpYmVyYXRlbHkgZG9lcyBOT1QgY2FsbCBpbnRvIFl0VG9rZW4gKHVubGlrZSBgcHJldmlld195aWVsZF9pbmRleGAgLwpgcmVmcmVzaF95aWVsZF9pbmRleGAsIHdoaWNoIHJlYWQvd3JpdGUgWXRUb2tlbidzIGluZGV4IGRpcmVjdGx5KS4gVGhpcyBpcwp0aGUgZnVuY3Rpb24gWXRUb2tlbiBpdHNlbGYgY2FsbHMgKGZyb20gYHRyYW5zZmVyYC9gdHJhbnNmZXJfZnJvbWAvCmBjbGFpbWFibGVfeWllbGRgKSB0byBjb21wdXRlIGl0cyBvd24gaW5kZXggdXBkYXRlIGxvY2FsbHkg4oCUIFNvcm9iYW4KcmVqZWN0cyBhIGNvbnRyYWN0IGNhbGxpbmcgYmFjayBpbnRvIGl0c2VsZiBmdXJ0aGVyIHVwIHRoZSBzYW1lIGNhbGwKc3RhY2sgKCJjb250cmFjdCByZS1lbnRyeSIpLCBzbyBZdFRva2VuIGNhbm5vdCBzYWZlbHkgY2FsbApgcHJldmlld195aWVsZF9pbmRleGAvYHJlZnJlc2hfeWllbGRfaW5kZXhgICh3aGljaCBjYWxsIGJhY2sgaW50bwpZdFRva2VuKSBmcm9tIHdpdGhpbiBpdHMgb3duIGVudHJ5IHBvaW50cy4gVGhpcyBnZXR0ZXIgYnJlYWtzIHRoYXQgY3ljbGUuAAAAAAAAFGdldF9zdXJwbHVzX3NuYXBzaG90AAAAAAAAAAEAAAPpAAAD7QAAAAIAAAALAAAACwAAB9AAAAAVTm92YWlyZVRva2VuaXplckVycm9yAAAA",
        "AAAABAAAAAAAAAAAAAAAFU5vdmFpcmVUb2tlbml6ZXJFcnJvcgAAAAAAAA0AAAAAAAAAEkFscmVhZHlJbml0aWFsaXplZAAAAAAAAQAAAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAIAAAAAAAAADFVuYXV0aG9yaXplZAAAAAMAAAAAAAAADEVwb2NoTm90T3BlbgAAAAQAAAAAAAAAD0Vwb2NoTm90TWF0dXJlZAAAAAAFAAAAAAAAAA9FcG9jaE5vdFNldHRsZWQAAAAABgAAAAAAAAAOQWxyZWFkeVNldHRsZWQAAAAAAAcAAAAAAAAAE0luc3VmZmljaWVudEJhbGFuY2UAAAAACAAAAAAAAAARSW52YXJpYW50VmlvbGF0ZWQAAAAAAAAJAAAAAAAAAA1JbnZhbGlkQW1vdW50AAAAAAAACgAAAAAAAAAMTWF0aE92ZXJmbG93AAAACwAAAAAAAAANTWF0aFVuZGVyZmxvdwAAAAAAAAwAAAAAAAAADlN0b3JhZ2VNaXNzaW5nAAAAAAAN",
        "AAAAAAAAAJNQdWJsaWMgd3JhcHBlciBhcm91bmQgYHJlY29yZF9zdXJwbHVzX2Jhc2VsaW5lYCwgc2FmZSBmb3IgWXRUb2tlbiB0byBjYWxsCmZvciB0aGUgc2FtZSByZWFzb24gYXMgYGdldF9zdXJwbHVzX3NuYXBzaG90YCAodG91Y2hlcyBubyBZdFRva2VuIHN0YXRlKS4AAAAAG3JlY29yZF9zdXJwbHVzX2Jhc2VsaW5lX3B1YgAAAAAAAAAAAQAAA+kAAAPtAAAAAAAAB9AAAAAVTm92YWlyZVRva2VuaXplckVycm9yAAAA" ]),
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
        get_epoch_state: this.txFromJSON<Result<u32>>,
        preview_yield_index: this.txFromJSON<Result<i128>>,
        refresh_yield_index: this.txFromJSON<Result<void>>,
        get_surplus_snapshot: this.txFromJSON<Result<readonly [i128, i128]>>,
        record_surplus_baseline_pub: this.txFromJSON<Result<void>>
  }
}