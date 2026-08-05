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
    contractId: "CCLVZNCS6PWYEXY4P53JPDDEPJFVX726OZYJE7LOMIALPEPVQWNKF32F",
  }
} as const

export type DataKey = {tag: "Admin", values: void} | {tag: "PendingAdmin", values: void} | {tag: "Tokenizer", values: void} | {tag: "SyWrapper", values: void} | {tag: "TotalSupply", values: void} | {tag: "YieldIndex", values: void} | {tag: "MaturityLedger", values: void} | {tag: "Paused", values: void} | {tag: "Balance", values: readonly [string]} | {tag: "Allowance", values: readonly [string, string]} | {tag: "UserYieldIndex", values: readonly [string]} | {tag: "AccruedYield", values: readonly [string]};


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

export const NovaireYtError = {
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
  11: {message:"InvalidAdminTransfer"},
  12: {message:"PastMaturity"},
  13: {message:"IndexCannotDecrease"}
}

export interface Client {
  /**
   * Construct and simulate a burn transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Burns YT tokens from the designated address.
   * 
   * **Strictly restricted to the Tokenizer contract.**
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
   * Mints new YT tokens to the designated address.
   * 
   * **Strictly restricted to the Tokenizer contract.**
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
   */
  name: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a pause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pauses Tokenizer integrations (mint/burn/index updates), freezing core issuance.
   */
  pause: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a symbol transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  symbol: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a approve transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Approves a spender to transfer up to `amount` of the caller's tokens.
   */
  approve: ({from, spender, amount, _expiration_ledger}: {from: string, spender: string, amount: i128, _expiration_ledger: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  balance: ({id}: {id: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a unpause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Unpauses Tokenizer integrations.
   */
  unpause: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  version: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a decimals transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  decimals: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a metadata transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  metadata: (options?: MethodOptions) => Promise<AssembledTransaction<Result<YtMetadata>>>

  /**
   * Construct and simulate a transfer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Transfers tokens from the caller to a recipient.
   * Checkpoints both sender and recipient before transferring balances.
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
   */
  allowance: ({from, spender}: {from: string, spender: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a is_paused transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_paused: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Initializes the Novaire Yield Token (YT).
   * 
   * # Arguments
   * * `admin` - Protocol administrator responsible for pausing and upgrades.
   * * `tokenizer` - The exclusive authority allowed to mint, burn, and update yield indices.
   * * `maturity_ledger` - The exact ledger sequence when yield accrual permanently stops.
   * 
   * # Errors
   * Returns `AlreadyInitialized` if called more than once.
   */
  initialize: ({admin, tokenizer, maturity_ledger, sy_wrapper}: {admin: string, tokenizer: string, maturity_ledger: u32, sy_wrapper: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a is_expired transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_expired: (options?: MethodOptions) => Promise<AssembledTransaction<Result<boolean>>>

  /**
   * Construct and simulate a accept_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Accepts a pending admin transfer, finalizing the change of administration.
   */
  accept_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a total_supply transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
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
   * Checkpoints both sender and recipient.
   */
  transfer_from: ({spender, from, to, amount}: {spender: string, from: string, to: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a set_sy_wrapper transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Sets the SY Wrapper address for live yield index refresh.
   * This is the upgrade-compatible entry point for H4: existing deployed
   * YT Token contracts can call this without re-initialization.
   */
  set_sy_wrapper: ({sy_wrapper}: {sy_wrapper: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a transfer_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Initiates a two-step admin transfer to a new address.
   */
  transfer_admin: ({new_admin}: {new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a checkpoint_user transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Checkpoints a user, safely locking in their accrued yield before a balance mutation.
   * 
   * This function performs the core math: `(current_index - user_index) * balance / 1e9`
   * 
   * # Arguments
   * * `user` - The address to checkpoint.
   * 
   * # Errors
   * Returns `MathOverflow` or `MathUnderflow` if calculation fails.
   */
  checkpoint_user: ({user}: {user: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a claimable_yield transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Simulates what a user is currently owed based on their balance and the live index.
   * H4 fix: Uses the live SY exchange rate (if available) to provide an accurate
   * real-time view of pending yield, even when the stored global index is stale.
   */
  claimable_yield: ({user}: {user: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a reset_claimable transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Resets the claimable yield for a user to zero after they successfully claim.
   * 
   * **Strictly restricted to the Tokenizer contract.**
   * 
   * # Arguments
   * * `user` - The address whose claimable yield is reset.
   * 
   * # Errors
   * Returns `Unauthorized`.
   */
  reset_claimable: ({user}: {user: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a add_accrued_yield transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Credits historical yield directly to a user's accrued yield balance.
   * 
   * **Strictly restricted to the Tokenizer contract.**
   * Used during late minting to restore economic identity by crediting the
   * historically backed yield that has accumulated since epoch genesis.
   * 
   * # Arguments
   * * `user` - The address receiving the credit.
   * * `amount` - The amount of yield to credit.
   * 
   * # Errors
   * Returns `Unauthorized` or `InvalidAmount` if negative.
   */
  add_accrued_yield: ({user, amount}: {user: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a update_yield_index transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Updates the global yield index.
   * 
   * **Strictly restricted to the Tokenizer contract.**
   * 
   * # Arguments
   * * `new_index` - The new global yield index.
   * 
   * # Errors
   * Returns `Unauthorized`, `Paused`, `PastMaturity`, or `IndexCannotDecrease`.
   */
  update_yield_index: ({new_index}: {new_index: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

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
      new ContractSpec([ "AAAAAAAAAStCdXJucyBZVCB0b2tlbnMgZnJvbSB0aGUgZGVzaWduYXRlZCBhZGRyZXNzLgoKKipTdHJpY3RseSByZXN0cmljdGVkIHRvIHRoZSBUb2tlbml6ZXIgY29udHJhY3QuKioKCiMgQXJndW1lbnRzCiogYGZyb21gIC0gVGhlIGFkZHJlc3MgYnVybmluZyB0aGUgdG9rZW5zLgoqIGBhbW91bnRgIC0gVGhlIGFtb3VudCBvZiB0b2tlbnMgdG8gYnVybi4KCiMgRXJyb3JzClJldHVybnMgYFVuYXV0aG9yaXplZGAsIGBQYXVzZWRgLCBgSW52YWxpZEFtb3VudGAsIGBJbnN1ZmZpY2llbnRCYWxhbmNlYCwgb3IgYE1hdGhVbmRlcmZsb3dgLgAAAAAEYnVybgAAAAIAAAAAAAAABGZyb20AAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAD6QAAA+0AAAAAAAAH0AAAAA5Ob3ZhaXJlWXRFcnJvcgAA",
        "AAAAAAAAARxNaW50cyBuZXcgWVQgdG9rZW5zIHRvIHRoZSBkZXNpZ25hdGVkIGFkZHJlc3MuCgoqKlN0cmljdGx5IHJlc3RyaWN0ZWQgdG8gdGhlIFRva2VuaXplciBjb250cmFjdC4qKgoKIyBBcmd1bWVudHMKKiBgdG9gIC0gVGhlIGFkZHJlc3MgcmVjZWl2aW5nIHRoZSBtaW50ZWQgdG9rZW5zLgoqIGBhbW91bnRgIC0gVGhlIGFtb3VudCBvZiB0b2tlbnMgdG8gbWludC4KCiMgRXJyb3JzClJldHVybnMgYFVuYXV0aG9yaXplZGAsIGBQYXVzZWRgLCBgSW52YWxpZEFtb3VudGAsIG9yIGBNYXRoT3ZlcmZsb3dgLgAAAARtaW50AAAAAgAAAAAAAAACdG8AAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAPpAAAD7QAAAAAAAAfQAAAADk5vdmFpcmVZdEVycm9yAAA=",
        "AAAAAAAAAAAAAAAEbmFtZQAAAAAAAAABAAAAEA==",
        "AAAAAAAAAFBQYXVzZXMgVG9rZW5pemVyIGludGVncmF0aW9ucyAobWludC9idXJuL2luZGV4IHVwZGF0ZXMpLCBmcmVlemluZyBjb3JlIGlzc3VhbmNlLgAAAAVwYXVzZQAAAAAAAAAAAAABAAAD6QAAA+0AAAAAAAAH0AAAAA5Ob3ZhaXJlWXRFcnJvcgAA",
        "AAAAAAAAAAAAAAAGc3ltYm9sAAAAAAAAAAAAAQAAABA=",
        "AAAAAAAAAEVBcHByb3ZlcyBhIHNwZW5kZXIgdG8gdHJhbnNmZXIgdXAgdG8gYGFtb3VudGAgb2YgdGhlIGNhbGxlcidzIHRva2Vucy4AAAAAAAAHYXBwcm92ZQAAAAAEAAAAAAAAAARmcm9tAAAAEwAAAAAAAAAHc3BlbmRlcgAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAEl9leHBpcmF0aW9uX2xlZGdlcgAAAAAABAAAAAEAAAPpAAAD7QAAAAAAAAfQAAAADk5vdmFpcmVZdEVycm9yAAA=",
        "AAAAAAAAAAAAAAAHYmFsYW5jZQAAAAABAAAAAAAAAAJpZAAAAAAAEwAAAAEAAAAL",
        "AAAAAAAAACBVbnBhdXNlcyBUb2tlbml6ZXIgaW50ZWdyYXRpb25zLgAAAAd1bnBhdXNlAAAAAAAAAAABAAAD6QAAA+0AAAAAAAAH0AAAAA5Ob3ZhaXJlWXRFcnJvcgAA",
        "AAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAAAAAAAQAAAAQ=",
        "AAAAAAAAAAAAAAAIZGVjaW1hbHMAAAAAAAAAAQAAAAQ=",
        "AAAAAAAAAAAAAAAIbWV0YWRhdGEAAAAAAAAAAQAAA+kAAAfQAAAACll0TWV0YWRhdGEAAAAAB9AAAAAOTm92YWlyZVl0RXJyb3IAAA==",
        "AAAAAAAAAfdUcmFuc2ZlcnMgdG9rZW5zIGZyb20gdGhlIGNhbGxlciB0byBhIHJlY2lwaWVudC4KQ2hlY2twb2ludHMgYm90aCBzZW5kZXIgYW5kIHJlY2lwaWVudCBiZWZvcmUgdHJhbnNmZXJyaW5nIGJhbGFuY2VzLgoKTm90ZTogVHJhbnNmZXJzIGludGVudGlvbmFsbHkgYnlwYXNzIHRoZSBgcGF1c2VgIG1lY2hhbmlzbSB0byBwcmVzZXJ2ZQpzZWNvbmRhcnkgbWFya2V0IGxpcXVpZGl0eSBhcyBhbiBlc2NhcGUgdmFsdmUgZHVyaW5nIHByb3RvY29sIGVtZXJnZW5jaWVzLgoKIyBBcmd1bWVudHMKKiBgZnJvbWAgLSBUaGUgY2FsbGVyIHNlbmRpbmcgdGhlIHRva2VucyAocmVxdWlyZXMgYXV0aCkuCiogYHRvYCAtIFRoZSByZWNpcGllbnQgb2YgdGhlIHRva2Vucy4KKiBgYW1vdW50YCAtIFRoZSBhbW91bnQgdG8gdHJhbnNmZXIuCgojIEVycm9ycwpSZXR1cm5zIGBJbnZhbGlkQW1vdW50YCwgYEluc3VmZmljaWVudEJhbGFuY2VgLCBgTWF0aE92ZXJmbG93YCwgb3IgYE1hdGhVbmRlcmZsb3dgLgAAAAAIdHJhbnNmZXIAAAADAAAAAAAAAARmcm9tAAAAEwAAAAAAAAACdG8AAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAPpAAAD7QAAAAAAAAfQAAAADk5vdmFpcmVZdEVycm9yAAA=",
        "AAAAAAAAAAAAAAAJYWxsb3dhbmNlAAAAAAAAAgAAAAAAAAAEZnJvbQAAABMAAAAAAAAAB3NwZW5kZXIAAAAAEwAAAAEAAAAL",
        "AAAAAAAAAAAAAAAJaXNfcGF1c2VkAAAAAAAAAAAAAAEAAAAB",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAADAAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAMUGVuZGluZ0FkbWluAAAAAAAAAAAAAAAJVG9rZW5pemVyAAAAAAAAAAAAAAAAAAAJU3lXcmFwcGVyAAAAAAAAAAAAAAAAAAALVG90YWxTdXBwbHkAAAAAAAAAAAAAAAAKWWllbGRJbmRleAAAAAAAAAAAAAAAAAAOTWF0dXJpdHlMZWRnZXIAAAAAAAAAAAAAAAAABlBhdXNlZAAAAAAAAQAAAAAAAAAHQmFsYW5jZQAAAAABAAAAEwAAAAEAAAAAAAAACUFsbG93YW5jZQAAAAAAAAIAAAATAAAAEwAAAAEAAAAAAAAADlVzZXJZaWVsZEluZGV4AAAAAAABAAAAEwAAAAEAAAAAAAAADEFjY3J1ZWRZaWVsZAAAAAEAAAAT",
        "AAAAAAAAAW9Jbml0aWFsaXplcyB0aGUgTm92YWlyZSBZaWVsZCBUb2tlbiAoWVQpLgoKIyBBcmd1bWVudHMKKiBgYWRtaW5gIC0gUHJvdG9jb2wgYWRtaW5pc3RyYXRvciByZXNwb25zaWJsZSBmb3IgcGF1c2luZyBhbmQgdXBncmFkZXMuCiogYHRva2VuaXplcmAgLSBUaGUgZXhjbHVzaXZlIGF1dGhvcml0eSBhbGxvd2VkIHRvIG1pbnQsIGJ1cm4sIGFuZCB1cGRhdGUgeWllbGQgaW5kaWNlcy4KKiBgbWF0dXJpdHlfbGVkZ2VyYCAtIFRoZSBleGFjdCBsZWRnZXIgc2VxdWVuY2Ugd2hlbiB5aWVsZCBhY2NydWFsIHBlcm1hbmVudGx5IHN0b3BzLgoKIyBFcnJvcnMKUmV0dXJucyBgQWxyZWFkeUluaXRpYWxpemVkYCBpZiBjYWxsZWQgbW9yZSB0aGFuIG9uY2UuAAAAAAppbml0aWFsaXplAAAAAAAEAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACXRva2VuaXplcgAAAAAAABMAAAAAAAAAD21hdHVyaXR5X2xlZGdlcgAAAAAEAAAAAAAAAApzeV93cmFwcGVyAAAAAAATAAAAAQAAA+kAAAPtAAAAAAAAB9AAAAAOTm92YWlyZVl0RXJyb3IAAA==",
        "AAAAAAAAAAAAAAAKaXNfZXhwaXJlZAAAAAAAAAAAAAEAAAPpAAAAAQAAB9AAAAAOTm92YWlyZVl0RXJyb3IAAA==",
        "AAAAAAAAAEpBY2NlcHRzIGEgcGVuZGluZyBhZG1pbiB0cmFuc2ZlciwgZmluYWxpemluZyB0aGUgY2hhbmdlIG9mIGFkbWluaXN0cmF0aW9uLgAAAAAADGFjY2VwdF9hZG1pbgAAAAAAAAABAAAD6QAAA+0AAAAAAAAH0AAAAA5Ob3ZhaXJlWXRFcnJvcgAA",
        "AAAAAAAAAAAAAAAMdG90YWxfc3VwcGx5AAAAAAAAAAEAAAAL",
        "AAAAAQAAAAAAAAAAAAAACll0TWV0YWRhdGEAAAAAAAgAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAKaXNfZXhwaXJlZAAAAAAAAQAAAAAAAAAJaXNfcGF1c2VkAAAAAAAAAQAAAAAAAAAPbWF0dXJpdHlfbGVkZ2VyAAAAAAQAAAAAAAAACXRva2VuaXplcgAAAAAAABMAAAAAAAAADHRvdGFsX3N1cHBseQAAAAsAAAAAAAAAB3ZlcnNpb24AAAAABAAAAAAAAAALeWllbGRfaW5kZXgAAAAACw==",
        "AAAAAAAAAC9VcGRhdGVzIHRoZSB0cnVzdGVkIFRva2VuaXplciBjb250cmFjdCBhZGRyZXNzLgAAAAANc2V0X3Rva2VuaXplcgAAAAAAAAEAAAAAAAAADW5ld190b2tlbml6ZXIAAAAAAAATAAAAAQAAA+kAAAPtAAAAAAAAB9AAAAAOTm92YWlyZVl0RXJyb3IAAA==",
        "AAAAAAAAAGdUcmFuc2ZlcnMgdG9rZW5zIGZyb20gb25lIGFkZHJlc3MgdG8gYW5vdGhlciB1c2luZyBhbiBhbGxvd2FuY2UuCkNoZWNrcG9pbnRzIGJvdGggc2VuZGVyIGFuZCByZWNpcGllbnQuAAAAAA10cmFuc2Zlcl9mcm9tAAAAAAAABAAAAAAAAAAHc3BlbmRlcgAAAAATAAAAAAAAAARmcm9tAAAAEwAAAAAAAAACdG8AAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAPpAAAD7QAAAAAAAAfQAAAADk5vdmFpcmVZdEVycm9yAAA=",
        "AAAAAAAAALpTZXRzIHRoZSBTWSBXcmFwcGVyIGFkZHJlc3MgZm9yIGxpdmUgeWllbGQgaW5kZXggcmVmcmVzaC4KVGhpcyBpcyB0aGUgdXBncmFkZS1jb21wYXRpYmxlIGVudHJ5IHBvaW50IGZvciBINDogZXhpc3RpbmcgZGVwbG95ZWQKWVQgVG9rZW4gY29udHJhY3RzIGNhbiBjYWxsIHRoaXMgd2l0aG91dCByZS1pbml0aWFsaXphdGlvbi4AAAAAAA5zZXRfc3lfd3JhcHBlcgAAAAAAAQAAAAAAAAAKc3lfd3JhcHBlcgAAAAAAEwAAAAEAAAPpAAAD7QAAAAAAAAfQAAAADk5vdmFpcmVZdEVycm9yAAA=",
        "AAAAAAAAADVJbml0aWF0ZXMgYSB0d28tc3RlcCBhZG1pbiB0cmFuc2ZlciB0byBhIG5ldyBhZGRyZXNzLgAAAAAAAA50cmFuc2Zlcl9hZG1pbgAAAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAPpAAAD7QAAAAAAAAfQAAAADk5vdmFpcmVZdEVycm9yAAA=",
        "AAAAAAAAASdDaGVja3BvaW50cyBhIHVzZXIsIHNhZmVseSBsb2NraW5nIGluIHRoZWlyIGFjY3J1ZWQgeWllbGQgYmVmb3JlIGEgYmFsYW5jZSBtdXRhdGlvbi4KClRoaXMgZnVuY3Rpb24gcGVyZm9ybXMgdGhlIGNvcmUgbWF0aDogYChjdXJyZW50X2luZGV4IC0gdXNlcl9pbmRleCkgKiBiYWxhbmNlIC8gMWU5YAoKIyBBcmd1bWVudHMKKiBgdXNlcmAgLSBUaGUgYWRkcmVzcyB0byBjaGVja3BvaW50LgoKIyBFcnJvcnMKUmV0dXJucyBgTWF0aE92ZXJmbG93YCBvciBgTWF0aFVuZGVyZmxvd2AgaWYgY2FsY3VsYXRpb24gZmFpbHMuAAAAAA9jaGVja3BvaW50X3VzZXIAAAAAAQAAAAAAAAAEdXNlcgAAABMAAAABAAAD6QAAA+0AAAAAAAAH0AAAAA5Ob3ZhaXJlWXRFcnJvcgAA",
        "AAAAAAAAAOxTaW11bGF0ZXMgd2hhdCBhIHVzZXIgaXMgY3VycmVudGx5IG93ZWQgYmFzZWQgb24gdGhlaXIgYmFsYW5jZSBhbmQgdGhlIGxpdmUgaW5kZXguCkg0IGZpeDogVXNlcyB0aGUgbGl2ZSBTWSBleGNoYW5nZSByYXRlIChpZiBhdmFpbGFibGUpIHRvIHByb3ZpZGUgYW4gYWNjdXJhdGUKcmVhbC10aW1lIHZpZXcgb2YgcGVuZGluZyB5aWVsZCwgZXZlbiB3aGVuIHRoZSBzdG9yZWQgZ2xvYmFsIGluZGV4IGlzIHN0YWxlLgAAAA9jbGFpbWFibGVfeWllbGQAAAAAAQAAAAAAAAAEdXNlcgAAABMAAAABAAAD6QAAAAsAAAfQAAAADk5vdmFpcmVZdEVycm9yAAA=",
        "AAAAAAAAAOZSZXNldHMgdGhlIGNsYWltYWJsZSB5aWVsZCBmb3IgYSB1c2VyIHRvIHplcm8gYWZ0ZXIgdGhleSBzdWNjZXNzZnVsbHkgY2xhaW0uCgoqKlN0cmljdGx5IHJlc3RyaWN0ZWQgdG8gdGhlIFRva2VuaXplciBjb250cmFjdC4qKgoKIyBBcmd1bWVudHMKKiBgdXNlcmAgLSBUaGUgYWRkcmVzcyB3aG9zZSBjbGFpbWFibGUgeWllbGQgaXMgcmVzZXQuCgojIEVycm9ycwpSZXR1cm5zIGBVbmF1dGhvcml6ZWRgLgAAAAAAD3Jlc2V0X2NsYWltYWJsZQAAAAABAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAPpAAAD7QAAAAAAAAfQAAAADk5vdmFpcmVZdEVycm9yAAA=",
        "AAAABAAAAAAAAAAAAAAADk5vdmFpcmVZdEVycm9yAAAAAAANAAAAAAAAABJBbHJlYWR5SW5pdGlhbGl6ZWQAAAAAAAEAAAAAAAAADk5vdEluaXRpYWxpemVkAAAAAAACAAAAAAAAAAxVbmF1dGhvcml6ZWQAAAADAAAAAAAAAAZQYXVzZWQAAAAAAAQAAAAAAAAADUludmFsaWRBbW91bnQAAAAAAAAFAAAAAAAAABNJbnN1ZmZpY2llbnRCYWxhbmNlAAAAAAYAAAAAAAAAFUluc3VmZmljaWVudEFsbG93YW5jZQAAAAAAAAcAAAAAAAAADE1hdGhPdmVyZmxvdwAAAAgAAAAAAAAADU1hdGhVbmRlcmZsb3cAAAAAAAAJAAAAAAAAAA5TdG9yYWdlTWlzc2luZwAAAAAACgAAAAAAAAAUSW52YWxpZEFkbWluVHJhbnNmZXIAAAALAAAAAAAAAAxQYXN0TWF0dXJpdHkAAAAMAAAAAAAAABNJbmRleENhbm5vdERlY3JlYXNlAAAAAA0=",
        "AAAAAAAAAapDcmVkaXRzIGhpc3RvcmljYWwgeWllbGQgZGlyZWN0bHkgdG8gYSB1c2VyJ3MgYWNjcnVlZCB5aWVsZCBiYWxhbmNlLgoKKipTdHJpY3RseSByZXN0cmljdGVkIHRvIHRoZSBUb2tlbml6ZXIgY29udHJhY3QuKioKVXNlZCBkdXJpbmcgbGF0ZSBtaW50aW5nIHRvIHJlc3RvcmUgZWNvbm9taWMgaWRlbnRpdHkgYnkgY3JlZGl0aW5nIHRoZQpoaXN0b3JpY2FsbHkgYmFja2VkIHlpZWxkIHRoYXQgaGFzIGFjY3VtdWxhdGVkIHNpbmNlIGVwb2NoIGdlbmVzaXMuCgojIEFyZ3VtZW50cwoqIGB1c2VyYCAtIFRoZSBhZGRyZXNzIHJlY2VpdmluZyB0aGUgY3JlZGl0LgoqIGBhbW91bnRgIC0gVGhlIGFtb3VudCBvZiB5aWVsZCB0byBjcmVkaXQuCgojIEVycm9ycwpSZXR1cm5zIGBVbmF1dGhvcml6ZWRgIG9yIGBJbnZhbGlkQW1vdW50YCBpZiBuZWdhdGl2ZS4AAAAAABFhZGRfYWNjcnVlZF95aWVsZAAAAAAAAAIAAAAAAAAABHVzZXIAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAD6QAAA+0AAAAAAAAH0AAAAA5Ob3ZhaXJlWXRFcnJvcgAA",
        "AAAAAAAAAOJVcGRhdGVzIHRoZSBnbG9iYWwgeWllbGQgaW5kZXguCgoqKlN0cmljdGx5IHJlc3RyaWN0ZWQgdG8gdGhlIFRva2VuaXplciBjb250cmFjdC4qKgoKIyBBcmd1bWVudHMKKiBgbmV3X2luZGV4YCAtIFRoZSBuZXcgZ2xvYmFsIHlpZWxkIGluZGV4LgoKIyBFcnJvcnMKUmV0dXJucyBgVW5hdXRob3JpemVkYCwgYFBhdXNlZGAsIGBQYXN0TWF0dXJpdHlgLCBvciBgSW5kZXhDYW5ub3REZWNyZWFzZWAuAAAAAAASdXBkYXRlX3lpZWxkX2luZGV4AAAAAAABAAAAAAAAAAluZXdfaW5kZXgAAAAAAAALAAAAAQAAA+kAAAPtAAAAAAAAB9AAAAAOTm92YWlyZVl0RXJyb3IAAA==" ]),
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
        metadata: this.txFromJSON<Result<YtMetadata>>,
        transfer: this.txFromJSON<Result<void>>,
        allowance: this.txFromJSON<i128>,
        is_paused: this.txFromJSON<boolean>,
        initialize: this.txFromJSON<Result<void>>,
        is_expired: this.txFromJSON<Result<boolean>>,
        accept_admin: this.txFromJSON<Result<void>>,
        total_supply: this.txFromJSON<i128>,
        set_tokenizer: this.txFromJSON<Result<void>>,
        transfer_from: this.txFromJSON<Result<void>>,
        set_sy_wrapper: this.txFromJSON<Result<void>>,
        transfer_admin: this.txFromJSON<Result<void>>,
        checkpoint_user: this.txFromJSON<Result<void>>,
        claimable_yield: this.txFromJSON<Result<i128>>,
        reset_claimable: this.txFromJSON<Result<void>>,
        add_accrued_yield: this.txFromJSON<Result<void>>,
        update_yield_index: this.txFromJSON<Result<void>>
  }
}