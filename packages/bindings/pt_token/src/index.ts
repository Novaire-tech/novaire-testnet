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
    contractId: "CAF2CCGNH5GQBOQP4NQQKYCT6MCAUZVU4JPSBIIT4426GFV2RQ74C32G",
  }
} as const

export type DataKey = {tag: "Admin", values: void} | {tag: "PendingAdmin", values: void} | {tag: "Tokenizer", values: void} | {tag: "TotalSupply", values: void} | {tag: "Paused", values: void} | {tag: "Balance", values: readonly [string]} | {tag: "Allowance", values: readonly [string, string]};


export interface PtMetadata {
  admin: string;
  is_paused: boolean;
  tokenizer: string;
  total_supply: i128;
  version: u32;
}

export const NovairePtError = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  3: {message:"Unauthorized"},
  4: {message:"Paused"},
  5: {message:"InvalidAmount"},
  6: {message:"InsufficientBalance"},
  7: {message:"InsufficientAllowance"},
  8: {message:"MathOverflow"},
  9: {message:"MathUnderflow"},
  10: {message:"StorageMissing"},
  11: {message:"InvalidAdminTransfer"}
}

export interface Client {
  /**
   * Construct and simulate a burn transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Burns PT tokens from the designated address.
   * 
   * **Strictly restricted to the Tokenizer contract.**
   * Called when users redeem their PT for underlying assets at maturity.
   * 
   * # Arguments
   * * `from` - The address burning the tokens.
   * * `amount` - The amount of tokens to burn.
   * 
   * # Errors
   * Returns `Unauthorized`, `Paused`, `InvalidAmount`, `InsufficientBalance`, or `MathUnderflow`.
   */
  burn: ({from, amount}: {from: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a mint transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Mints new PT tokens to the designated address.
   * 
   * **Strictly restricted to the Tokenizer contract.**
   * This ensures PT is only issued when underlying yield-bearing assets are securely locked.
   * 
   * # Arguments
   * * `to` - The address receiving the minted tokens.
   * * `amount` - The amount of tokens to mint.
   * 
   * # Errors
   * Returns `Unauthorized`, `Paused`, `InvalidAmount`, or `MathOverflow`.
   */
  mint: ({to, amount}: {to: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a name transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Hardcoded to save storage gas costs.
   */
  name: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a pause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pauses Tokenizer integrations (mint/burn), freezing core issuance.
   */
  pause: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a symbol transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Hardcoded to save storage gas costs.
   */
  symbol: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a approve transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Approves a spender to transfer up to `amount` of the caller's tokens.
   * 
   * # Arguments
   * * `from` - The token owner (requires auth).
   * * `spender` - The address granted allowance.
   * * `amount` - The maximum amount the spender can transfer.
   * * `expiration_ledger` - Unused parameter to maintain standard token interface compatibility.
   */
  approve: ({from, spender, amount, _expiration_ledger}: {from: string, spender: string, amount: i128, _expiration_ledger: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the exact balance of a specific user.
   */
  balance: ({id}: {id: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a unpause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Unpauses Tokenizer integrations.
   */
  unpause: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the protocol version.
   */
  version: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a decimals transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Hardcoded to 7 decimals, consistent with Stellar assets.
   */
  decimals: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a metadata transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns a comprehensive struct containing the PT Token's configuration and health metadata.
   */
  metadata: (options?: MethodOptions) => Promise<AssembledTransaction<Result<PtMetadata>>>

  /**
   * Construct and simulate a transfer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Transfers tokens from the caller to a recipient.
   * 
   * Note: Transfers intentionally bypass the `pause` mechanism to preserve
   * secondary market liquidity as an escape valve during protocol emergencies.
   * 
   * # Arguments
   * * `from` - The caller sending the tokens (requires auth).
   * * `to` - The recipient of the tokens.
   * * `amount` - The amount to transfer.
   * 
   * # Errors
   * Returns `InvalidAmount`, `InsufficientBalance`, `MathOverflow`, or `MathUnderflow`.
   */
  transfer: ({from, to, amount}: {from: string, to: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a allowance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the approved allowance for a spender.
   */
  allowance: ({from, spender}: {from: string, spender: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a is_paused transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns true if issuance/redemption is paused.
   */
  is_paused: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Initializes the Novaire Principal Token (PT).
   * 
   * # Arguments
   * * `admin` - Protocol administrator responsible for pausing and upgrades.
   * * `tokenizer` - The exclusive authority allowed to mint and burn PT tokens.
   * 
   * # Errors
   * Returns `AlreadyInitialized` if called more than once.
   */
  initialize: ({admin, tokenizer}: {admin: string, tokenizer: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a accept_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Accepts a pending admin transfer, finalizing the change of administration.
   */
  accept_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a total_supply transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the total supply of PT tokens in circulation.
   */
  total_supply: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a set_tokenizer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Updates the trusted Tokenizer contract address.
   */
  set_tokenizer: ({new_tokenizer}: {new_tokenizer: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a transfer_from transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Transfers tokens from one address to another using an allowance.
   * 
   * # Arguments
   * * `spender` - The address initiating the transfer (requires auth).
   * * `from` - The owner of the tokens.
   * * `to` - The recipient of the tokens.
   * * `amount` - The amount to transfer.
   */
  transfer_from: ({spender, from, to, amount}: {spender: string, from: string, to: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a transfer_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Initiates a two-step admin transfer to a new address.
   */
  transfer_admin: ({new_admin}: {new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

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
      new ContractSpec([ "AAAAAAAAAXBCdXJucyBQVCB0b2tlbnMgZnJvbSB0aGUgZGVzaWduYXRlZCBhZGRyZXNzLgoKKipTdHJpY3RseSByZXN0cmljdGVkIHRvIHRoZSBUb2tlbml6ZXIgY29udHJhY3QuKioKQ2FsbGVkIHdoZW4gdXNlcnMgcmVkZWVtIHRoZWlyIFBUIGZvciB1bmRlcmx5aW5nIGFzc2V0cyBhdCBtYXR1cml0eS4KCiMgQXJndW1lbnRzCiogYGZyb21gIC0gVGhlIGFkZHJlc3MgYnVybmluZyB0aGUgdG9rZW5zLgoqIGBhbW91bnRgIC0gVGhlIGFtb3VudCBvZiB0b2tlbnMgdG8gYnVybi4KCiMgRXJyb3JzClJldHVybnMgYFVuYXV0aG9yaXplZGAsIGBQYXVzZWRgLCBgSW52YWxpZEFtb3VudGAsIGBJbnN1ZmZpY2llbnRCYWxhbmNlYCwgb3IgYE1hdGhVbmRlcmZsb3dgLgAAAARidXJuAAAAAgAAAAAAAAAEZnJvbQAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAPpAAAD7QAAAAAAAAfQAAAADk5vdmFpcmVQdEVycm9yAAA=",
        "AAAAAAAAAXVNaW50cyBuZXcgUFQgdG9rZW5zIHRvIHRoZSBkZXNpZ25hdGVkIGFkZHJlc3MuCgoqKlN0cmljdGx5IHJlc3RyaWN0ZWQgdG8gdGhlIFRva2VuaXplciBjb250cmFjdC4qKgpUaGlzIGVuc3VyZXMgUFQgaXMgb25seSBpc3N1ZWQgd2hlbiB1bmRlcmx5aW5nIHlpZWxkLWJlYXJpbmcgYXNzZXRzIGFyZSBzZWN1cmVseSBsb2NrZWQuCgojIEFyZ3VtZW50cwoqIGB0b2AgLSBUaGUgYWRkcmVzcyByZWNlaXZpbmcgdGhlIG1pbnRlZCB0b2tlbnMuCiogYGFtb3VudGAgLSBUaGUgYW1vdW50IG9mIHRva2VucyB0byBtaW50LgoKIyBFcnJvcnMKUmV0dXJucyBgVW5hdXRob3JpemVkYCwgYFBhdXNlZGAsIGBJbnZhbGlkQW1vdW50YCwgb3IgYE1hdGhPdmVyZmxvd2AuAAAAAAAABG1pbnQAAAACAAAAAAAAAAJ0bwAAAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAQAAA+kAAAPtAAAAAAAAB9AAAAAOTm92YWlyZVB0RXJyb3IAAA==",
        "AAAAAAAAACRIYXJkY29kZWQgdG8gc2F2ZSBzdG9yYWdlIGdhcyBjb3N0cy4AAAAEbmFtZQAAAAAAAAABAAAAEA==",
        "AAAAAAAAAEJQYXVzZXMgVG9rZW5pemVyIGludGVncmF0aW9ucyAobWludC9idXJuKSwgZnJlZXppbmcgY29yZSBpc3N1YW5jZS4AAAAAAAVwYXVzZQAAAAAAAAAAAAABAAAD6QAAA+0AAAAAAAAH0AAAAA5Ob3ZhaXJlUHRFcnJvcgAA",
        "AAAAAAAAACRIYXJkY29kZWQgdG8gc2F2ZSBzdG9yYWdlIGdhcyBjb3N0cy4AAAAGc3ltYm9sAAAAAAAAAAAAAQAAABA=",
        "AAAAAAAAAUJBcHByb3ZlcyBhIHNwZW5kZXIgdG8gdHJhbnNmZXIgdXAgdG8gYGFtb3VudGAgb2YgdGhlIGNhbGxlcidzIHRva2Vucy4KCiMgQXJndW1lbnRzCiogYGZyb21gIC0gVGhlIHRva2VuIG93bmVyIChyZXF1aXJlcyBhdXRoKS4KKiBgc3BlbmRlcmAgLSBUaGUgYWRkcmVzcyBncmFudGVkIGFsbG93YW5jZS4KKiBgYW1vdW50YCAtIFRoZSBtYXhpbXVtIGFtb3VudCB0aGUgc3BlbmRlciBjYW4gdHJhbnNmZXIuCiogYGV4cGlyYXRpb25fbGVkZ2VyYCAtIFVudXNlZCBwYXJhbWV0ZXIgdG8gbWFpbnRhaW4gc3RhbmRhcmQgdG9rZW4gaW50ZXJmYWNlIGNvbXBhdGliaWxpdHkuAAAAAAAHYXBwcm92ZQAAAAAEAAAAAAAAAARmcm9tAAAAEwAAAAAAAAAHc3BlbmRlcgAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAEl9leHBpcmF0aW9uX2xlZGdlcgAAAAAABAAAAAEAAAPpAAAD7QAAAAAAAAfQAAAADk5vdmFpcmVQdEVycm9yAAA=",
        "AAAAAAAAAC1SZXR1cm5zIHRoZSBleGFjdCBiYWxhbmNlIG9mIGEgc3BlY2lmaWMgdXNlci4AAAAAAAAHYmFsYW5jZQAAAAABAAAAAAAAAAJpZAAAAAAAEwAAAAEAAAAL",
        "AAAAAAAAACBVbnBhdXNlcyBUb2tlbml6ZXIgaW50ZWdyYXRpb25zLgAAAAd1bnBhdXNlAAAAAAAAAAABAAAD6QAAA+0AAAAAAAAH0AAAAA5Ob3ZhaXJlUHRFcnJvcgAA",
        "AAAAAAAAAB1SZXR1cm5zIHRoZSBwcm90b2NvbCB2ZXJzaW9uLgAAAAAAAAd2ZXJzaW9uAAAAAAAAAAABAAAABA==",
        "AAAAAAAAADhIYXJkY29kZWQgdG8gNyBkZWNpbWFscywgY29uc2lzdGVudCB3aXRoIFN0ZWxsYXIgYXNzZXRzLgAAAAhkZWNpbWFscwAAAAAAAAABAAAABA==",
        "AAAAAAAAAFtSZXR1cm5zIGEgY29tcHJlaGVuc2l2ZSBzdHJ1Y3QgY29udGFpbmluZyB0aGUgUFQgVG9rZW4ncyBjb25maWd1cmF0aW9uIGFuZCBoZWFsdGggbWV0YWRhdGEuAAAAAAhtZXRhZGF0YQAAAAAAAAABAAAD6QAAB9AAAAAKUHRNZXRhZGF0YQAAAAAH0AAAAA5Ob3ZhaXJlUHRFcnJvcgAA",
        "AAAAAAAAAbNUcmFuc2ZlcnMgdG9rZW5zIGZyb20gdGhlIGNhbGxlciB0byBhIHJlY2lwaWVudC4KCk5vdGU6IFRyYW5zZmVycyBpbnRlbnRpb25hbGx5IGJ5cGFzcyB0aGUgYHBhdXNlYCBtZWNoYW5pc20gdG8gcHJlc2VydmUKc2Vjb25kYXJ5IG1hcmtldCBsaXF1aWRpdHkgYXMgYW4gZXNjYXBlIHZhbHZlIGR1cmluZyBwcm90b2NvbCBlbWVyZ2VuY2llcy4KCiMgQXJndW1lbnRzCiogYGZyb21gIC0gVGhlIGNhbGxlciBzZW5kaW5nIHRoZSB0b2tlbnMgKHJlcXVpcmVzIGF1dGgpLgoqIGB0b2AgLSBUaGUgcmVjaXBpZW50IG9mIHRoZSB0b2tlbnMuCiogYGFtb3VudGAgLSBUaGUgYW1vdW50IHRvIHRyYW5zZmVyLgoKIyBFcnJvcnMKUmV0dXJucyBgSW52YWxpZEFtb3VudGAsIGBJbnN1ZmZpY2llbnRCYWxhbmNlYCwgYE1hdGhPdmVyZmxvd2AsIG9yIGBNYXRoVW5kZXJmbG93YC4AAAAACHRyYW5zZmVyAAAAAwAAAAAAAAAEZnJvbQAAABMAAAAAAAAAAnRvAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAD6QAAA+0AAAAAAAAH0AAAAA5Ob3ZhaXJlUHRFcnJvcgAA",
        "AAAAAAAAAC1SZXR1cm5zIHRoZSBhcHByb3ZlZCBhbGxvd2FuY2UgZm9yIGEgc3BlbmRlci4AAAAAAAAJYWxsb3dhbmNlAAAAAAAAAgAAAAAAAAAEZnJvbQAAABMAAAAAAAAAB3NwZW5kZXIAAAAAEwAAAAEAAAAL",
        "AAAAAAAAAC5SZXR1cm5zIHRydWUgaWYgaXNzdWFuY2UvcmVkZW1wdGlvbiBpcyBwYXVzZWQuAAAAAAAJaXNfcGF1c2VkAAAAAAAAAAAAAAEAAAAB",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABwAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAMUGVuZGluZ0FkbWluAAAAAAAAAAAAAAAJVG9rZW5pemVyAAAAAAAAAAAAAAAAAAALVG90YWxTdXBwbHkAAAAAAAAAAAAAAAAGUGF1c2VkAAAAAAABAAAAAAAAAAdCYWxhbmNlAAAAAAEAAAATAAAAAQAAAAAAAAAJQWxsb3dhbmNlAAAAAAAAAgAAABMAAAAT",
        "AAAAAAAAARBJbml0aWFsaXplcyB0aGUgTm92YWlyZSBQcmluY2lwYWwgVG9rZW4gKFBUKS4KCiMgQXJndW1lbnRzCiogYGFkbWluYCAtIFByb3RvY29sIGFkbWluaXN0cmF0b3IgcmVzcG9uc2libGUgZm9yIHBhdXNpbmcgYW5kIHVwZ3JhZGVzLgoqIGB0b2tlbml6ZXJgIC0gVGhlIGV4Y2x1c2l2ZSBhdXRob3JpdHkgYWxsb3dlZCB0byBtaW50IGFuZCBidXJuIFBUIHRva2Vucy4KCiMgRXJyb3JzClJldHVybnMgYEFscmVhZHlJbml0aWFsaXplZGAgaWYgY2FsbGVkIG1vcmUgdGhhbiBvbmNlLgAAAAppbml0aWFsaXplAAAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACXRva2VuaXplcgAAAAAAABMAAAABAAAD6QAAA+0AAAAAAAAH0AAAAA5Ob3ZhaXJlUHRFcnJvcgAA",
        "AAAAAAAAAEpBY2NlcHRzIGEgcGVuZGluZyBhZG1pbiB0cmFuc2ZlciwgZmluYWxpemluZyB0aGUgY2hhbmdlIG9mIGFkbWluaXN0cmF0aW9uLgAAAAAADGFjY2VwdF9hZG1pbgAAAAAAAAABAAAD6QAAA+0AAAAAAAAH0AAAAA5Ob3ZhaXJlUHRFcnJvcgAA",
        "AAAAAAAAADVSZXR1cm5zIHRoZSB0b3RhbCBzdXBwbHkgb2YgUFQgdG9rZW5zIGluIGNpcmN1bGF0aW9uLgAAAAAAAAx0b3RhbF9zdXBwbHkAAAAAAAAAAQAAAAs=",
        "AAAAAQAAAAAAAAAAAAAAClB0TWV0YWRhdGEAAAAAAAUAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAJaXNfcGF1c2VkAAAAAAAAAQAAAAAAAAAJdG9rZW5pemVyAAAAAAAAEwAAAAAAAAAMdG90YWxfc3VwcGx5AAAACwAAAAAAAAAHdmVyc2lvbgAAAAAE",
        "AAAAAAAAAC9VcGRhdGVzIHRoZSB0cnVzdGVkIFRva2VuaXplciBjb250cmFjdCBhZGRyZXNzLgAAAAANc2V0X3Rva2VuaXplcgAAAAAAAAEAAAAAAAAADW5ld190b2tlbml6ZXIAAAAAAAATAAAAAQAAA+kAAAPtAAAAAAAAB9AAAAAOTm92YWlyZVB0RXJyb3IAAA==",
        "AAAAAAAAAP9UcmFuc2ZlcnMgdG9rZW5zIGZyb20gb25lIGFkZHJlc3MgdG8gYW5vdGhlciB1c2luZyBhbiBhbGxvd2FuY2UuCgojIEFyZ3VtZW50cwoqIGBzcGVuZGVyYCAtIFRoZSBhZGRyZXNzIGluaXRpYXRpbmcgdGhlIHRyYW5zZmVyIChyZXF1aXJlcyBhdXRoKS4KKiBgZnJvbWAgLSBUaGUgb3duZXIgb2YgdGhlIHRva2Vucy4KKiBgdG9gIC0gVGhlIHJlY2lwaWVudCBvZiB0aGUgdG9rZW5zLgoqIGBhbW91bnRgIC0gVGhlIGFtb3VudCB0byB0cmFuc2Zlci4AAAAADXRyYW5zZmVyX2Zyb20AAAAAAAAEAAAAAAAAAAdzcGVuZGVyAAAAABMAAAAAAAAABGZyb20AAAATAAAAAAAAAAJ0bwAAAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAQAAA+kAAAPtAAAAAAAAB9AAAAAOTm92YWlyZVB0RXJyb3IAAA==",
        "AAAAAAAAADVJbml0aWF0ZXMgYSB0d28tc3RlcCBhZG1pbiB0cmFuc2ZlciB0byBhIG5ldyBhZGRyZXNzLgAAAAAAAA50cmFuc2Zlcl9hZG1pbgAAAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAPpAAAD7QAAAAAAAAfQAAAADk5vdmFpcmVQdEVycm9yAAA=",
        "AAAABAAAAAAAAAAAAAAADk5vdmFpcmVQdEVycm9yAAAAAAALAAAAAAAAABJBbHJlYWR5SW5pdGlhbGl6ZWQAAAAAAAEAAAAAAAAADk5vdEluaXRpYWxpemVkAAAAAAACAAAAAAAAAAxVbmF1dGhvcml6ZWQAAAADAAAAAAAAAAZQYXVzZWQAAAAAAAQAAAAAAAAADUludmFsaWRBbW91bnQAAAAAAAAFAAAAAAAAABNJbnN1ZmZpY2llbnRCYWxhbmNlAAAAAAYAAAAAAAAAFUluc3VmZmljaWVudEFsbG93YW5jZQAAAAAAAAcAAAAAAAAADE1hdGhPdmVyZmxvdwAAAAgAAAAAAAAADU1hdGhVbmRlcmZsb3cAAAAAAAAJAAAAAAAAAA5TdG9yYWdlTWlzc2luZwAAAAAACgAAAAAAAAAUSW52YWxpZEFkbWluVHJhbnNmZXIAAAAL" ]),
      options
    )
  }
  public readonly fromJSON = {
    burn: this.txFromJSON<Result<void>>,
        mint: this.txFromJSON<Result<void>>,
        name: this.txFromJSON<string>,
        pause: this.txFromJSON<Result<void>>,
        symbol: this.txFromJSON<string>,
        approve: this.txFromJSON<Result<void>>,
        balance: this.txFromJSON<i128>,
        unpause: this.txFromJSON<Result<void>>,
        version: this.txFromJSON<u32>,
        decimals: this.txFromJSON<u32>,
        metadata: this.txFromJSON<Result<PtMetadata>>,
        transfer: this.txFromJSON<Result<void>>,
        allowance: this.txFromJSON<i128>,
        is_paused: this.txFromJSON<boolean>,
        initialize: this.txFromJSON<Result<void>>,
        accept_admin: this.txFromJSON<Result<void>>,
        total_supply: this.txFromJSON<i128>,
        set_tokenizer: this.txFromJSON<Result<void>>,
        transfer_from: this.txFromJSON<Result<void>>,
        transfer_admin: this.txFromJSON<Result<void>>
  }
}