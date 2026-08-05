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
    contractId: "CDJIHR67ZNUNAKMQ2KJ5GYNG3UQAF4V6PPWT7F7M5L7HIJUU3REKSL76",
  }
} as const

export type DataKey = {tag: "Admin", values: void} | {tag: "PendingAdmin", values: void} | {tag: "Underlying", values: void} | {tag: "SyWrapper", values: void} | {tag: "TotalVaultShares", values: void} | {tag: "Paused", values: void} | {tag: "UserShares", values: readonly [string]};


export interface VaultMetadata {
  admin: string;
  is_paused: boolean;
  pending_admin: Option<string>;
  sy_wrapper: string;
  total_vault_shares: i128;
  underlying: string;
  version: u32;
}

export const NovaireVaultError = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  3: {message:"Unauthorized"},
  4: {message:"Paused"},
  5: {message:"InvalidAmount"},
  6: {message:"InsufficientShares"},
  7: {message:"MathOverflow"},
  8: {message:"MathUnderflow"},
  9: {message:"StorageMissing"},
  10: {message:"InvalidAdminTransfer"}
}

export interface Client {
  /**
   * Construct and simulate a pause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pauses the Vault, freezing all deposits, withdrawals, and share transfers.
   * 
   * # Arguments
   * * `env` - The environment.
   * 
   * # Errors
   * Returns `StorageMissing` if not initialized, traps if caller is not admin.
   */
  pause: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a deposit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Deposits underlying tokens into the Vault and mints Vault shares to the depositor.
   * 
   * Internally transfers the underlying tokens to the Vault, and then deposits them
   * directly into the downstream SY Wrapper.
   * 
   * # Arguments
   * * `depositor` - The address initiating the deposit (requires auth).
   * * `amount` - The amount of underlying tokens to deposit.
   * 
   * # Returns
   * The exact amount of Vault shares (1:1 with SY shares) minted to the depositor.
   * 
   * # Errors
   * Returns `Paused`, `InvalidAmount`, `StorageMissing`, or `MathOverflow`.
   */
  deposit: ({depositor, amount}: {depositor: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a unpause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Unpauses the Vault, restoring normal operations.
   */
  unpause: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the current protocol version.
   */
  version: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a metadata transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns a comprehensive struct containing the Vault's current configuration and health metadata.
   */
  metadata: (options?: MethodOptions) => Promise<AssembledTransaction<Result<VaultMetadata>>>

  /**
   * Construct and simulate a withdraw transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Withdraws underlying tokens by burning Vault shares.
   * 
   * Internally withdraws from the downstream SY Wrapper and transfers
   * the underlying tokens back to the withdrawer.
   * 
   * # Arguments
   * * `withdrawer` - The address initiating the withdrawal (requires auth).
   * * `shares` - The amount of Vault shares to burn.
   * 
   * # Returns
   * The exact amount of underlying tokens returned to the withdrawer.
   * 
   * # Errors
   * Returns `Paused`, `InvalidAmount`, `InsufficientShares`, `StorageMissing`, or `MathUnderflow`.
   */
  withdraw: ({withdrawer, shares}: {withdrawer: string, shares: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a is_paused transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns true if the Vault is currently paused.
   */
  is_paused: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a balance_of transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the exact share balance of a specific user.
   */
  balance_of: ({user}: {user: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Initializes the Novaire Yield Vault.
   * 
   * # Arguments
   * * `admin` - The address of the protocol administrator.
   * * `sy_wrapper` - The address of the hardened SY Wrapper contract.
   * * `underlying` - The address of the underlying asset token (e.g., USDC).
   * 
   * # Errors
   * Returns `AlreadyInitialized` if called more than once.
   */
  initialize: ({admin, sy_wrapper, underlying}: {admin: string, sy_wrapper: string, underlying: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a accept_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Accepts a pending admin transfer, finalizing the change of administration.
   */
  accept_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a withdraw_for transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Withdraws underlying tokens by burning Vault shares, but sends the tokens to a specific receiver.
   * 
   * # Arguments
   * * `withdrawer` - The address initiating the withdrawal (requires auth).
   * * `receiver` - The address that will receive the underlying tokens.
   * * `shares` - The amount of Vault shares to burn.
   * 
   * # Returns
   * The exact amount of underlying tokens returned to the receiver.
   * 
   * # Errors
   * Returns `Paused`, `InvalidAmount`, `InsufficientShares`, `StorageMissing`, or `MathUnderflow`.
   */
  withdraw_for: ({withdrawer, receiver, shares}: {withdrawer: string, receiver: string, shares: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a get_sy_wrapper transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the downstream SY Wrapper Address.
   */
  get_sy_wrapper: (options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a transfer_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Initiates a two-step admin transfer to a new address.
   */
  transfer_admin: ({new_admin}: {new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a transfer_shares transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Transfers Vault shares directly to another address.
   * 
   * # Arguments
   * * `from` - The address sending the shares (requires auth).
   * * `to` - The address receiving the shares.
   * * `amount` - The amount of shares to transfer.
   * 
   * # Errors
   * Returns `Paused`, `InvalidAmount`, `InsufficientShares`, `MathOverflow`, or `MathUnderflow`.
   */
  transfer_shares: ({from, to, amount}: {from: string, to: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a total_vault_shares transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the total amount of Vault shares in circulation.
   */
  total_vault_shares: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

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
      new ContractSpec([ "AAAAAAAAAMdQYXVzZXMgdGhlIFZhdWx0LCBmcmVlemluZyBhbGwgZGVwb3NpdHMsIHdpdGhkcmF3YWxzLCBhbmQgc2hhcmUgdHJhbnNmZXJzLgoKIyBBcmd1bWVudHMKKiBgZW52YCAtIFRoZSBlbnZpcm9ubWVudC4KCiMgRXJyb3JzClJldHVybnMgYFN0b3JhZ2VNaXNzaW5nYCBpZiBub3QgaW5pdGlhbGl6ZWQsIHRyYXBzIGlmIGNhbGxlciBpcyBub3QgYWRtaW4uAAAAAAVwYXVzZQAAAAAAAAAAAAABAAAD6QAAA+0AAAAAAAAH0AAAABFOb3ZhaXJlVmF1bHRFcnJvcgAAAA==",
        "AAAAAAAAAgJEZXBvc2l0cyB1bmRlcmx5aW5nIHRva2VucyBpbnRvIHRoZSBWYXVsdCBhbmQgbWludHMgVmF1bHQgc2hhcmVzIHRvIHRoZSBkZXBvc2l0b3IuCgpJbnRlcm5hbGx5IHRyYW5zZmVycyB0aGUgdW5kZXJseWluZyB0b2tlbnMgdG8gdGhlIFZhdWx0LCBhbmQgdGhlbiBkZXBvc2l0cyB0aGVtCmRpcmVjdGx5IGludG8gdGhlIGRvd25zdHJlYW0gU1kgV3JhcHBlci4KCiMgQXJndW1lbnRzCiogYGRlcG9zaXRvcmAgLSBUaGUgYWRkcmVzcyBpbml0aWF0aW5nIHRoZSBkZXBvc2l0IChyZXF1aXJlcyBhdXRoKS4KKiBgYW1vdW50YCAtIFRoZSBhbW91bnQgb2YgdW5kZXJseWluZyB0b2tlbnMgdG8gZGVwb3NpdC4KCiMgUmV0dXJucwpUaGUgZXhhY3QgYW1vdW50IG9mIFZhdWx0IHNoYXJlcyAoMToxIHdpdGggU1kgc2hhcmVzKSBtaW50ZWQgdG8gdGhlIGRlcG9zaXRvci4KCiMgRXJyb3JzClJldHVybnMgYFBhdXNlZGAsIGBJbnZhbGlkQW1vdW50YCwgYFN0b3JhZ2VNaXNzaW5nYCwgb3IgYE1hdGhPdmVyZmxvd2AuAAAAAAAHZGVwb3NpdAAAAAACAAAAAAAAAAlkZXBvc2l0b3IAAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAD6QAAAAsAAAfQAAAAEU5vdmFpcmVWYXVsdEVycm9yAAAA",
        "AAAAAAAAADBVbnBhdXNlcyB0aGUgVmF1bHQsIHJlc3RvcmluZyBub3JtYWwgb3BlcmF0aW9ucy4AAAAHdW5wYXVzZQAAAAAAAAAAAQAAA+kAAAPtAAAAAAAAB9AAAAARTm92YWlyZVZhdWx0RXJyb3IAAAA=",
        "AAAAAAAAACVSZXR1cm5zIHRoZSBjdXJyZW50IHByb3RvY29sIHZlcnNpb24uAAAAAAAAB3ZlcnNpb24AAAAAAAAAAAEAAAAE",
        "AAAAAAAAAGBSZXR1cm5zIGEgY29tcHJlaGVuc2l2ZSBzdHJ1Y3QgY29udGFpbmluZyB0aGUgVmF1bHQncyBjdXJyZW50IGNvbmZpZ3VyYXRpb24gYW5kIGhlYWx0aCBtZXRhZGF0YS4AAAAIbWV0YWRhdGEAAAAAAAAAAQAAA+kAAAfQAAAADVZhdWx0TWV0YWRhdGEAAAAAAAfQAAAAEU5vdmFpcmVWYXVsdEVycm9yAAAA",
        "AAAAAAAAAeFXaXRoZHJhd3MgdW5kZXJseWluZyB0b2tlbnMgYnkgYnVybmluZyBWYXVsdCBzaGFyZXMuCgpJbnRlcm5hbGx5IHdpdGhkcmF3cyBmcm9tIHRoZSBkb3duc3RyZWFtIFNZIFdyYXBwZXIgYW5kIHRyYW5zZmVycwp0aGUgdW5kZXJseWluZyB0b2tlbnMgYmFjayB0byB0aGUgd2l0aGRyYXdlci4KCiMgQXJndW1lbnRzCiogYHdpdGhkcmF3ZXJgIC0gVGhlIGFkZHJlc3MgaW5pdGlhdGluZyB0aGUgd2l0aGRyYXdhbCAocmVxdWlyZXMgYXV0aCkuCiogYHNoYXJlc2AgLSBUaGUgYW1vdW50IG9mIFZhdWx0IHNoYXJlcyB0byBidXJuLgoKIyBSZXR1cm5zClRoZSBleGFjdCBhbW91bnQgb2YgdW5kZXJseWluZyB0b2tlbnMgcmV0dXJuZWQgdG8gdGhlIHdpdGhkcmF3ZXIuCgojIEVycm9ycwpSZXR1cm5zIGBQYXVzZWRgLCBgSW52YWxpZEFtb3VudGAsIGBJbnN1ZmZpY2llbnRTaGFyZXNgLCBgU3RvcmFnZU1pc3NpbmdgLCBvciBgTWF0aFVuZGVyZmxvd2AuAAAAAAAACHdpdGhkcmF3AAAAAgAAAAAAAAAKd2l0aGRyYXdlcgAAAAAAEwAAAAAAAAAGc2hhcmVzAAAAAAALAAAAAQAAA+kAAAALAAAH0AAAABFOb3ZhaXJlVmF1bHRFcnJvcgAAAA==",
        "AAAAAAAAAC5SZXR1cm5zIHRydWUgaWYgdGhlIFZhdWx0IGlzIGN1cnJlbnRseSBwYXVzZWQuAAAAAAAJaXNfcGF1c2VkAAAAAAAAAAAAAAEAAAAB",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABwAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAMUGVuZGluZ0FkbWluAAAAAAAAAAAAAAAKVW5kZXJseWluZwAAAAAAAAAAAAAAAAAJU3lXcmFwcGVyAAAAAAAAAAAAAAAAAAAQVG90YWxWYXVsdFNoYXJlcwAAAAAAAAAAAAAABlBhdXNlZAAAAAAAAQAAAAAAAAAKVXNlclNoYXJlcwAAAAAAAQAAABM=",
        "AAAAAAAAADNSZXR1cm5zIHRoZSBleGFjdCBzaGFyZSBiYWxhbmNlIG9mIGEgc3BlY2lmaWMgdXNlci4AAAAACmJhbGFuY2Vfb2YAAAAAAAEAAAAAAAAABHVzZXIAAAATAAAAAQAAAAs=",
        "AAAAAAAAATRJbml0aWFsaXplcyB0aGUgTm92YWlyZSBZaWVsZCBWYXVsdC4KCiMgQXJndW1lbnRzCiogYGFkbWluYCAtIFRoZSBhZGRyZXNzIG9mIHRoZSBwcm90b2NvbCBhZG1pbmlzdHJhdG9yLgoqIGBzeV93cmFwcGVyYCAtIFRoZSBhZGRyZXNzIG9mIHRoZSBoYXJkZW5lZCBTWSBXcmFwcGVyIGNvbnRyYWN0LgoqIGB1bmRlcmx5aW5nYCAtIFRoZSBhZGRyZXNzIG9mIHRoZSB1bmRlcmx5aW5nIGFzc2V0IHRva2VuIChlLmcuLCBVU0RDKS4KCiMgRXJyb3JzClJldHVybnMgYEFscmVhZHlJbml0aWFsaXplZGAgaWYgY2FsbGVkIG1vcmUgdGhhbiBvbmNlLgAAAAppbml0aWFsaXplAAAAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACnN5X3dyYXBwZXIAAAAAABMAAAAAAAAACnVuZGVybHlpbmcAAAAAABMAAAABAAAD6QAAA+0AAAAAAAAH0AAAABFOb3ZhaXJlVmF1bHRFcnJvcgAAAA==",
        "AAAAAAAAAEpBY2NlcHRzIGEgcGVuZGluZyBhZG1pbiB0cmFuc2ZlciwgZmluYWxpemluZyB0aGUgY2hhbmdlIG9mIGFkbWluaXN0cmF0aW9uLgAAAAAADGFjY2VwdF9hZG1pbgAAAAAAAAABAAAD6QAAA+0AAAAAAAAH0AAAABFOb3ZhaXJlVmF1bHRFcnJvcgAAAA==",
        "AAAAAAAAAd9XaXRoZHJhd3MgdW5kZXJseWluZyB0b2tlbnMgYnkgYnVybmluZyBWYXVsdCBzaGFyZXMsIGJ1dCBzZW5kcyB0aGUgdG9rZW5zIHRvIGEgc3BlY2lmaWMgcmVjZWl2ZXIuCgojIEFyZ3VtZW50cwoqIGB3aXRoZHJhd2VyYCAtIFRoZSBhZGRyZXNzIGluaXRpYXRpbmcgdGhlIHdpdGhkcmF3YWwgKHJlcXVpcmVzIGF1dGgpLgoqIGByZWNlaXZlcmAgLSBUaGUgYWRkcmVzcyB0aGF0IHdpbGwgcmVjZWl2ZSB0aGUgdW5kZXJseWluZyB0b2tlbnMuCiogYHNoYXJlc2AgLSBUaGUgYW1vdW50IG9mIFZhdWx0IHNoYXJlcyB0byBidXJuLgoKIyBSZXR1cm5zClRoZSBleGFjdCBhbW91bnQgb2YgdW5kZXJseWluZyB0b2tlbnMgcmV0dXJuZWQgdG8gdGhlIHJlY2VpdmVyLgoKIyBFcnJvcnMKUmV0dXJucyBgUGF1c2VkYCwgYEludmFsaWRBbW91bnRgLCBgSW5zdWZmaWNpZW50U2hhcmVzYCwgYFN0b3JhZ2VNaXNzaW5nYCwgb3IgYE1hdGhVbmRlcmZsb3dgLgAAAAAMd2l0aGRyYXdfZm9yAAAAAwAAAAAAAAAKd2l0aGRyYXdlcgAAAAAAEwAAAAAAAAAIcmVjZWl2ZXIAAAATAAAAAAAAAAZzaGFyZXMAAAAAAAsAAAABAAAD6QAAAAsAAAfQAAAAEU5vdmFpcmVWYXVsdEVycm9yAAAA",
        "AAAAAAAAACpSZXR1cm5zIHRoZSBkb3duc3RyZWFtIFNZIFdyYXBwZXIgQWRkcmVzcy4AAAAAAA5nZXRfc3lfd3JhcHBlcgAAAAAAAAAAAAEAAAPpAAAAEwAAB9AAAAARTm92YWlyZVZhdWx0RXJyb3IAAAA=",
        "AAAAAAAAADVJbml0aWF0ZXMgYSB0d28tc3RlcCBhZG1pbiB0cmFuc2ZlciB0byBhIG5ldyBhZGRyZXNzLgAAAAAAAA50cmFuc2Zlcl9hZG1pbgAAAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAPpAAAD7QAAAAAAAAfQAAAAEU5vdmFpcmVWYXVsdEVycm9yAAAA",
        "AAAAAAAAATxUcmFuc2ZlcnMgVmF1bHQgc2hhcmVzIGRpcmVjdGx5IHRvIGFub3RoZXIgYWRkcmVzcy4KCiMgQXJndW1lbnRzCiogYGZyb21gIC0gVGhlIGFkZHJlc3Mgc2VuZGluZyB0aGUgc2hhcmVzIChyZXF1aXJlcyBhdXRoKS4KKiBgdG9gIC0gVGhlIGFkZHJlc3MgcmVjZWl2aW5nIHRoZSBzaGFyZXMuCiogYGFtb3VudGAgLSBUaGUgYW1vdW50IG9mIHNoYXJlcyB0byB0cmFuc2Zlci4KCiMgRXJyb3JzClJldHVybnMgYFBhdXNlZGAsIGBJbnZhbGlkQW1vdW50YCwgYEluc3VmZmljaWVudFNoYXJlc2AsIGBNYXRoT3ZlcmZsb3dgLCBvciBgTWF0aFVuZGVyZmxvd2AuAAAAD3RyYW5zZmVyX3NoYXJlcwAAAAADAAAAAAAAAARmcm9tAAAAEwAAAAAAAAACdG8AAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAPpAAAD7QAAAAAAAAfQAAAAEU5vdmFpcmVWYXVsdEVycm9yAAAA",
        "AAAAAQAAAAAAAAAAAAAADVZhdWx0TWV0YWRhdGEAAAAAAAAHAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACWlzX3BhdXNlZAAAAAAAAAEAAAAAAAAADXBlbmRpbmdfYWRtaW4AAAAAAAPoAAAAEwAAAAAAAAAKc3lfd3JhcHBlcgAAAAAAEwAAAAAAAAASdG90YWxfdmF1bHRfc2hhcmVzAAAAAAALAAAAAAAAAAp1bmRlcmx5aW5nAAAAAAATAAAAAAAAAAd2ZXJzaW9uAAAAAAQ=",
        "AAAAAAAAADhSZXR1cm5zIHRoZSB0b3RhbCBhbW91bnQgb2YgVmF1bHQgc2hhcmVzIGluIGNpcmN1bGF0aW9uLgAAABJ0b3RhbF92YXVsdF9zaGFyZXMAAAAAAAAAAAABAAAACw==",
        "AAAABAAAAAAAAAAAAAAAEU5vdmFpcmVWYXVsdEVycm9yAAAAAAAACgAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAgAAAAAAAAAMVW5hdXRob3JpemVkAAAAAwAAAAAAAAAGUGF1c2VkAAAAAAAEAAAAAAAAAA1JbnZhbGlkQW1vdW50AAAAAAAABQAAAAAAAAASSW5zdWZmaWNpZW50U2hhcmVzAAAAAAAGAAAAAAAAAAxNYXRoT3ZlcmZsb3cAAAAHAAAAAAAAAA1NYXRoVW5kZXJmbG93AAAAAAAACAAAAAAAAAAOU3RvcmFnZU1pc3NpbmcAAAAAAAkAAAAAAAAAFEludmFsaWRBZG1pblRyYW5zZmVyAAAACg==" ]),
      options
    )
  }
  public readonly fromJSON = {
    pause: this.txFromJSON<Result<void>>,
        deposit: this.txFromJSON<Result<i128>>,
        unpause: this.txFromJSON<Result<void>>,
        version: this.txFromJSON<u32>,
        metadata: this.txFromJSON<Result<VaultMetadata>>,
        withdraw: this.txFromJSON<Result<i128>>,
        is_paused: this.txFromJSON<boolean>,
        balance_of: this.txFromJSON<i128>,
        initialize: this.txFromJSON<Result<void>>,
        accept_admin: this.txFromJSON<Result<void>>,
        withdraw_for: this.txFromJSON<Result<i128>>,
        get_sy_wrapper: this.txFromJSON<Result<string>>,
        transfer_admin: this.txFromJSON<Result<void>>,
        transfer_shares: this.txFromJSON<Result<void>>,
        total_vault_shares: this.txFromJSON<i128>
  }
}