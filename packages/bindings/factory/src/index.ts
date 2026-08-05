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
    contractId: "CBVQZ35ACRAI7Q2SLJSHWYKU2OK33AUGNPVBQ4DCMJBV3DTY6WASIG7O",
  }
} as const

export type DataKey = {tag: "Admin", values: void} | {tag: "ProtocolVersion", values: void} | {tag: "EpochCount", values: void} | {tag: "Epoch", values: readonly [u32]} | {tag: "Maturity", values: readonly [u32]} | {tag: "NextEpoch", values: readonly [u32]};


export interface PtMetadata {
  admin: string;
  is_paused: boolean;
  tokenizer: string;
  total_supply: i128;
  version: u32;
}


export interface YtMetadata {
  admin: string;
  is_expired: boolean;
  is_paused: boolean;
  maturity_ledger: u32;
  tokenizer: string;
  total_supply: i128;
  version: u32;
  yield_index: i128;
}


export interface EpochRecord {
  deployment_ledger: u32;
  epoch_id: u32;
  intent_engine: string;
  is_active: boolean;
  marketplace: string;
  maturity_ledger: u32;
  pt_token: string;
  rollover_engine: string;
  sy_wrapper: string;
  tokenizer: string;
  vault: string;
  version: u32;
  yt_token: string;
}


export interface VaultMetadata {
  admin: string;
  is_paused: boolean;
  pending_admin: Option<string>;
  sy_wrapper: string;
  total_vault_shares: i128;
  underlying: string;
  version: u32;
}


export interface DeployEpochParams {
  grace_period_ledgers: u32;
  intent_engine: string;
  keeper: string;
  marketplace: string;
  maturity_ledger: u32;
  pt_token: string;
  rollover_engine: string;
  sy_wrapper: string;
  tokenizer: string;
  underlying_token: string;
  vault: string;
  yt_token: string;
}


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

export const NovaireFactoryError = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  3: {message:"Unauthorized"},
  4: {message:"EpochAlreadyExists"},
  5: {message:"InvalidEpoch"},
  6: {message:"MathOverflow"},
  7: {message:"StorageMissing"},
  8: {message:"MaturityInPast"},
  9: {message:"DuplicateAddress"},
  10: {message:"EpochNotLinked"},
  11: {message:"WiringMismatch"}
}

export interface Client {
  /**
   * Construct and simulate a get_epoch transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_epoch: ({epoch_id}: {epoch_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<EpochRecord>>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin, protocol_version}: {admin: string, protocol_version: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a epoch_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  epoch_count: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a link_epochs transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  link_epochs: ({current_epoch_id, next_epoch_id}: {current_epoch_id: u32, next_epoch_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a deploy_epoch transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  deploy_epoch: ({params}: {params: DeployEpochParams}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a latest_epoch transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  latest_epoch: (options?: MethodOptions) => Promise<AssembledTransaction<Result<EpochRecord>>>

  /**
   * Construct and simulate a get_next_epoch transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_next_epoch: ({current_epoch_id}: {current_epoch_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<EpochRecord>>>

  /**
   * Construct and simulate a protocol_version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  protocol_version: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_epoch_by_maturity transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_epoch_by_maturity: ({maturity_ledger}: {maturity_ledger: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<EpochRecord>>>

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
      new ContractSpec([ "AAAAAAAAAAAAAAAJZ2V0X2Vwb2NoAAAAAAAAAQAAAAAAAAAIZXBvY2hfaWQAAAAEAAAAAQAAA+kAAAfQAAAAC0Vwb2NoUmVjb3JkAAAAB9AAAAATTm92YWlyZUZhY3RvcnlFcnJvcgA=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABgAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAPUHJvdG9jb2xWZXJzaW9uAAAAAAAAAAAAAAAACkVwb2NoQ291bnQAAAAAAAEAAAAAAAAABUVwb2NoAAAAAAAAAQAAAAQAAAABAAAAAAAAAAhNYXR1cml0eQAAAAEAAAAEAAAAAQAAAAAAAAAJTmV4dEVwb2NoAAAAAAAAAQAAAAQ=",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAABBwcm90b2NvbF92ZXJzaW9uAAAABAAAAAEAAAPpAAAD7QAAAAAAAAfQAAAAE05vdmFpcmVGYWN0b3J5RXJyb3IA",
        "AAAAAAAAAAAAAAALZXBvY2hfY291bnQAAAAAAAAAAAEAAAAE",
        "AAAAAAAAAAAAAAALbGlua19lcG9jaHMAAAAAAgAAAAAAAAAQY3VycmVudF9lcG9jaF9pZAAAAAQAAAAAAAAADW5leHRfZXBvY2hfaWQAAAAAAAAEAAAAAQAAA+kAAAPtAAAAAAAAB9AAAAATTm92YWlyZUZhY3RvcnlFcnJvcgA=",
        "AAAAAAAAAAAAAAAMZGVwbG95X2Vwb2NoAAAAAQAAAAAAAAAGcGFyYW1zAAAAAAfQAAAAEURlcGxveUVwb2NoUGFyYW1zAAAAAAAAAQAAA+kAAAAEAAAH0AAAABNOb3ZhaXJlRmFjdG9yeUVycm9yAA==",
        "AAAAAAAAAAAAAAAMbGF0ZXN0X2Vwb2NoAAAAAAAAAAEAAAPpAAAH0AAAAAtFcG9jaFJlY29yZAAAAAfQAAAAE05vdmFpcmVGYWN0b3J5RXJyb3IA",
        "AAAAAQAAAAAAAAAAAAAAClB0TWV0YWRhdGEAAAAAAAUAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAJaXNfcGF1c2VkAAAAAAAAAQAAAAAAAAAJdG9rZW5pemVyAAAAAAAAEwAAAAAAAAAMdG90YWxfc3VwcGx5AAAACwAAAAAAAAAHdmVyc2lvbgAAAAAE",
        "AAAAAQAAAAAAAAAAAAAACll0TWV0YWRhdGEAAAAAAAgAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAKaXNfZXhwaXJlZAAAAAAAAQAAAAAAAAAJaXNfcGF1c2VkAAAAAAAAAQAAAAAAAAAPbWF0dXJpdHlfbGVkZ2VyAAAAAAQAAAAAAAAACXRva2VuaXplcgAAAAAAABMAAAAAAAAADHRvdGFsX3N1cHBseQAAAAsAAAAAAAAAB3ZlcnNpb24AAAAABAAAAAAAAAALeWllbGRfaW5kZXgAAAAACw==",
        "AAAAAQAAAAAAAAAAAAAAC0Vwb2NoUmVjb3JkAAAAAA0AAAAAAAAAEWRlcGxveW1lbnRfbGVkZ2VyAAAAAAAABAAAAAAAAAAIZXBvY2hfaWQAAAAEAAAAAAAAAA1pbnRlbnRfZW5naW5lAAAAAAAAEwAAAAAAAAAJaXNfYWN0aXZlAAAAAAAAAQAAAAAAAAALbWFya2V0cGxhY2UAAAAAEwAAAAAAAAAPbWF0dXJpdHlfbGVkZ2VyAAAAAAQAAAAAAAAACHB0X3Rva2VuAAAAEwAAAAAAAAAPcm9sbG92ZXJfZW5naW5lAAAAABMAAAAAAAAACnN5X3dyYXBwZXIAAAAAABMAAAAAAAAACXRva2VuaXplcgAAAAAAABMAAAAAAAAABXZhdWx0AAAAAAAAEwAAAAAAAAAHdmVyc2lvbgAAAAAEAAAAAAAAAAh5dF90b2tlbgAAABM=",
        "AAAAAAAAAAAAAAAOZ2V0X25leHRfZXBvY2gAAAAAAAEAAAAAAAAAEGN1cnJlbnRfZXBvY2hfaWQAAAAEAAAAAQAAA+kAAAfQAAAAC0Vwb2NoUmVjb3JkAAAAB9AAAAATTm92YWlyZUZhY3RvcnlFcnJvcgA=",
        "AAAAAQAAAAAAAAAAAAAADVZhdWx0TWV0YWRhdGEAAAAAAAAHAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACWlzX3BhdXNlZAAAAAAAAAEAAAAAAAAADXBlbmRpbmdfYWRtaW4AAAAAAAPoAAAAEwAAAAAAAAAKc3lfd3JhcHBlcgAAAAAAEwAAAAAAAAASdG90YWxfdmF1bHRfc2hhcmVzAAAAAAALAAAAAAAAAAp1bmRlcmx5aW5nAAAAAAATAAAAAAAAAAd2ZXJzaW9uAAAAAAQ=",
        "AAAAAAAAAAAAAAAQcHJvdG9jb2xfdmVyc2lvbgAAAAAAAAABAAAABA==",
        "AAAAAQAAAAAAAAAAAAAAEURlcGxveUVwb2NoUGFyYW1zAAAAAAAADAAAAAAAAAAUZ3JhY2VfcGVyaW9kX2xlZGdlcnMAAAAEAAAAAAAAAA1pbnRlbnRfZW5naW5lAAAAAAAAEwAAAAAAAAAGa2VlcGVyAAAAAAATAAAAAAAAAAttYXJrZXRwbGFjZQAAAAATAAAAAAAAAA9tYXR1cml0eV9sZWRnZXIAAAAABAAAAAAAAAAIcHRfdG9rZW4AAAATAAAAAAAAAA9yb2xsb3Zlcl9lbmdpbmUAAAAAEwAAAAAAAAAKc3lfd3JhcHBlcgAAAAAAEwAAAAAAAAAJdG9rZW5pemVyAAAAAAAAEwAAAAAAAAAQdW5kZXJseWluZ190b2tlbgAAABMAAAAAAAAABXZhdWx0AAAAAAAAEwAAAAAAAAAIeXRfdG9rZW4AAAAT",
        "AAAAAQAAAAAAAAAAAAAAEVRva2VuaXplck1ldGFkYXRhAAAAAAAADAAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAhlcG9jaF9pZAAAAAQAAAAAAAAAEWVwb2NoX3N0YXJ0X2luZGV4AAAAAAAACwAAAAAAAAALZXBvY2hfc3RhdGUAAAAABAAAAAAAAAAPbWF0dXJpdHlfbGVkZ2VyAAAAAAQAAAAAAAAACHB0X3Rva2VuAAAAEwAAAAAAAAAYc2V0dGxlbWVudF9leGNoYW5nZV9yYXRlAAAD6AAAAAsAAAAAAAAACnN5X3dyYXBwZXIAAAAAABMAAAAAAAAAD3RvdGFsX3B0X21pbnRlZAAAAAALAAAAAAAAAAV2YXVsdAAAAAAAABMAAAAAAAAAB3ZlcnNpb24AAAAABAAAAAAAAAAIeXRfdG9rZW4AAAAT",
        "AAAAAAAAAAAAAAAVZ2V0X2Vwb2NoX2J5X21hdHVyaXR5AAAAAAAAAQAAAAAAAAAPbWF0dXJpdHlfbGVkZ2VyAAAAAAQAAAABAAAD6QAAB9AAAAALRXBvY2hSZWNvcmQAAAAH0AAAABNOb3ZhaXJlRmFjdG9yeUVycm9yAA==",
        "AAAABAAAAAAAAAAAAAAAE05vdmFpcmVGYWN0b3J5RXJyb3IAAAAACwAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAgAAAAAAAAAMVW5hdXRob3JpemVkAAAAAwAAAAAAAAASRXBvY2hBbHJlYWR5RXhpc3RzAAAAAAAEAAAAAAAAAAxJbnZhbGlkRXBvY2gAAAAFAAAAAAAAAAxNYXRoT3ZlcmZsb3cAAAAGAAAAAAAAAA5TdG9yYWdlTWlzc2luZwAAAAAABwAAAAAAAAAOTWF0dXJpdHlJblBhc3QAAAAAAAgAAAAAAAAAEER1cGxpY2F0ZUFkZHJlc3MAAAAJAAAAAAAAAA5FcG9jaE5vdExpbmtlZAAAAAAACgAAAAAAAAAOV2lyaW5nTWlzbWF0Y2gAAAAAAAs=" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_epoch: this.txFromJSON<Result<EpochRecord>>,
        initialize: this.txFromJSON<Result<void>>,
        epoch_count: this.txFromJSON<u32>,
        link_epochs: this.txFromJSON<Result<void>>,
        deploy_epoch: this.txFromJSON<Result<u32>>,
        latest_epoch: this.txFromJSON<Result<EpochRecord>>,
        get_next_epoch: this.txFromJSON<Result<EpochRecord>>,
        protocol_version: this.txFromJSON<u32>,
        get_epoch_by_maturity: this.txFromJSON<Result<EpochRecord>>
  }
}