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
    contractId: "CAQ6IUMYEWY7UVYY7KTKSW5FBAHJXFOZGWZ6MSNQLDNTW232PMWV4K7F",
  }
} as const

export const Errors = {
  1: {message:"RoomNotFound"},
  2: {message:"NotPlayer"},
  3: {message:"InvalidPhase"},
  4: {message:"AlreadyCommitted"},
  5: {message:"InvalidProof"},
  6: {message:"NullifierUsed"},
  7: {message:"InvalidBet"},
  8: {message:"XlmTokenNotSet"},
  9: {message:"VerifierNotSet"},
  10: {message:"GameHubNotSet"}
}

export type RoomStatus = {tag: "Lobby", values: void} | {tag: "Commit", values: void} | {tag: "Settled", values: void};


export interface PlayerState {
  address: string;
  commitment: Buffer;
  exact_sum_guess: u32;
  has_committed: boolean;
  parity_guess: u32;
}


export interface Room {
  bet_amount: i128;
  has_player2: boolean;
  player1: PlayerState;
  player2: PlayerState;
  session_id: u32;
  status: RoomStatus;
  total_sum: Option<u32>;
  winner: Option<string>;
}

export interface Client {
  /**
   * Construct and simulate a create_room transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  create_room: ({player, bet_amount}: {player: string, bet_amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a join_room transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  join_room: ({room_id, player}: {room_id: u64, player: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a commit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  commit: ({room_id, player, commitment, parity, exact_guess}: {room_id: u64, player: string, commitment: Buffer, parity: u32, exact_guess: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a resolve transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  resolve: ({room_id, proof, total_sum, nullifier}: {room_id: u64, proof: Buffer, total_sum: u32, nullifier: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_room transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_room: ({room_id}: {room_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Room>>>

  /**
   * Construct and simulate a get_room_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_room_count: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, game_hub, verifier, xlm_token}: {admin: string, game_hub: string, verifier: string, xlm_token: string},
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
    return ContractClient.deploy({admin, game_hub, verifier, xlm_token}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACgAAAAAAAAAMUm9vbU5vdEZvdW5kAAAAAQAAAAAAAAAJTm90UGxheWVyAAAAAAAAAgAAAAAAAAAMSW52YWxpZFBoYXNlAAAAAwAAAAAAAAAQQWxyZWFkeUNvbW1pdHRlZAAAAAQAAAAAAAAADEludmFsaWRQcm9vZgAAAAUAAAAAAAAADU51bGxpZmllclVzZWQAAAAAAAAGAAAAAAAAAApJbnZhbGlkQmV0AAAAAAAHAAAAAAAAAA5YbG1Ub2tlbk5vdFNldAAAAAAACAAAAAAAAAAOVmVyaWZpZXJOb3RTZXQAAAAAAAkAAAAAAAAADUdhbWVIdWJOb3RTZXQAAAAAAAAK",
        "AAAAAgAAAAAAAAAAAAAAClJvb21TdGF0dXMAAAAAAAMAAAAAAAAAAAAAAAVMb2JieQAAAAAAAAAAAAAAAAAABkNvbW1pdAAAAAAAAAAAAAAAAAAHU2V0dGxlZAA=",
        "AAAAAQAAAAAAAAAAAAAAC1BsYXllclN0YXRlAAAAAAUAAAAAAAAAB2FkZHJlc3MAAAAAEwAAAAAAAAAKY29tbWl0bWVudAAAAAAD7gAAACAAAAAAAAAAD2V4YWN0X3N1bV9ndWVzcwAAAAAEAAAAAAAAAA1oYXNfY29tbWl0dGVkAAAAAAAAAQAAAAAAAAAMcGFyaXR5X2d1ZXNzAAAABA==",
        "AAAAAQAAAAAAAAAAAAAABFJvb20AAAAIAAAAAAAAAApiZXRfYW1vdW50AAAAAAALAAAAAAAAAAtoYXNfcGxheWVyMgAAAAABAAAAAAAAAAdwbGF5ZXIxAAAAB9AAAAALUGxheWVyU3RhdGUAAAAAAAAAAAdwbGF5ZXIyAAAAB9AAAAALUGxheWVyU3RhdGUAAAAAAAAAAApzZXNzaW9uX2lkAAAAAAAEAAAAAAAAAAZzdGF0dXMAAAAAB9AAAAAKUm9vbVN0YXR1cwAAAAAAAAAAAAl0b3RhbF9zdW0AAAAAAAPoAAAABAAAAAAAAAAGd2lubmVyAAAAAAPoAAAAEw==",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAQAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAIZ2FtZV9odWIAAAATAAAAAAAAAAh2ZXJpZmllcgAAABMAAAAAAAAACXhsbV90b2tlbgAAAAAAABMAAAAA",
        "AAAAAAAAAAAAAAALY3JlYXRlX3Jvb20AAAAAAgAAAAAAAAAGcGxheWVyAAAAAAATAAAAAAAAAApiZXRfYW1vdW50AAAAAAALAAAAAQAAA+kAAAAGAAAAAw==",
        "AAAAAAAAAAAAAAAJam9pbl9yb29tAAAAAAAAAgAAAAAAAAAHcm9vbV9pZAAAAAAGAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAAGY29tbWl0AAAAAAAFAAAAAAAAAAdyb29tX2lkAAAAAAYAAAAAAAAABnBsYXllcgAAAAAAEwAAAAAAAAAKY29tbWl0bWVudAAAAAAD7gAAACAAAAAAAAAABnBhcml0eQAAAAAABAAAAAAAAAALZXhhY3RfZ3Vlc3MAAAAABAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAHcmVzb2x2ZQAAAAAEAAAAAAAAAAdyb29tX2lkAAAAAAYAAAAAAAAABXByb29mAAAAAAAADgAAAAAAAAAJdG90YWxfc3VtAAAAAAAABAAAAAAAAAAJbnVsbGlmaWVyAAAAAAAD7gAAACAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAAIZ2V0X3Jvb20AAAABAAAAAAAAAAdyb29tX2lkAAAAAAYAAAABAAAD6QAAB9AAAAAEUm9vbQAAAAM=",
        "AAAAAAAAAAAAAAAOZ2V0X3Jvb21fY291bnQAAAAAAAAAAAABAAAABg==" ]),
      options
    )
  }
  public readonly fromJSON = {
    create_room: this.txFromJSON<Result<u64>>,
        join_room: this.txFromJSON<Result<void>>,
        commit: this.txFromJSON<Result<void>>,
        resolve: this.txFromJSON<Result<void>>,
        get_room: this.txFromJSON<Result<Room>>,
        get_room_count: this.txFromJSON<u64>
  }
}