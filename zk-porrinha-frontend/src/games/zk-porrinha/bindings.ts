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
    contractId: "CB5EAMBQEWFKHTKMF4D7CZKWAUYB4R6CFVABHZUOE4HJ5G6VD2FPLYZ4",
  }
} as const

export const Errors = {
  1: {message:"RoomNotFound"},
  2: {message:"NotPlayer"},
  3: {message:"InvalidPhase"},
  4: {message:"AlreadyCommitted"},
  5: {message:"InvalidProof"},
  6: {message:"SelfPlayForbidden"},
  7: {message:"InvalidBet"},
  8: {message:"TimeoutNotReached"},
  9: {message:"AlreadyInitialized"},
  10: {message:"InvalidHandValue"},
  11: {message:"InvalidGuess"},
  12: {message:"CommitmentMismatch"},
  13: {message:"GameAlreadyStarted"},
  14: {message:"XlmTokenNotSet"},
  15: {message:"GameHubNotSet"},
  16: {message:"VerifierNotSet"},
  17: {message:"AdminNotSet"}
}

export type RoomStatus = {tag: "Lobby", values: void} | {tag: "Commit", values: void} | {tag: "Settled", values: void};


export interface PlayerState {
  address: string;
  commitment: Option<Buffer>;
  has_committed: boolean;
  jackpot_hit: boolean;
  revealed_hand: Option<u32>;
  revealed_parity: Option<u32>;
  revealed_total_guess: Option<u32>;
}


export interface Room {
  bet_amount: i128;
  has_player2: boolean;
  id: u64;
  jackpot_accumulated: i64;
  jackpot_accumulated_hash: Buffer;
  jackpot_pool: i128;
  last_action_ledger: u32;
  last_winner: Option<string>;
  player1: PlayerState;
  player2: PlayerState;
  rounds_played: u32;
  session_id: u32;
  status: RoomStatus;
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
   * Construct and simulate a commit_hand transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Jogador commita sua jogada com prova ZK.
   * 
   * ## ZK: o que o circuito prova e revela
   * 
   * Privado (nunca revelado):
   * - jackpot_guess ∈ [0, 99] - o palpite do jackpot permanece secreto
   * - salt (aleatoriedade)
   * 
   * Público (outputs da prova - revelados quando verificada):
   * - commitment = Poseidon(hand || parity || total_guess || jackpot_guess || salt)
   * - hand ∈ [0, 5] - mão revelada pela prova
  * - parity ∈ {0, 1} - aposta de paridade revelada pela prova (1=ímpar, 0=par)
   * - total_guess ∈ [0, 10] - palpite do total revelado pela prova
   * 
   * Público (input da prova):
   * - jackpot_accumulated_hash = hash do acumulado atual da sala
   * 
   * O verifier on-chain:
   * 1. Verifica a prova ZK
   * 2. Os valores (hand, parity, total_guess) são enviados pelo frontend
   * 3. O commitment na prova garante que os valores são corretos
   * 4. Quando ambos commitam, calcula quem ganhou
   * 
   * # Argumentos
   * * `commitment` - Poseidon(hand || parity || total_guess || jackpot_guess || salt)
   * * `proof` - Prova ZK gerada off-chain pelo player
   * * `hand` - Mão revelada (0-5), validada pela prova
   * * `
   */
  commit_hand: ({room_id, player, commitment, proof, hand, parity, total_guess, jackpot_hit}: {room_id: u64, player: string, commitment: Buffer, proof: Buffer, hand: u32, parity: u32, total_guess: u32, jackpot_hit: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a claim_timeout transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Jogador revela mão e palpite de paridade.
   * 
   * ## O que é revelado publicamente:
   * - `hand` (0-5)
  * - `parity_guess` (1=ímpar, 0=par)
   * - `salt`
   * 
   * ## O que NUNCA é revelado:
   * - `jackpot_guess` — permanece secreto para sempre
   * A prova ZK do commit já garantiu que era válido.
   * O `jackpot_hit` é derivado da prova, não do input direto.
   * 
   * ## Verificação:
   * O contrato reconstrói SHA256(hand || parity_guess || salt) e
   * valida contra o commitment. Em produção com Poseidon nativo,
   * a verificação seria completa incluindo jackpot_guess.
   * 
   * Quando ambos revelam, a rodada é finalizada automaticamente.
   * 
   * # Argumentos
   * * `hand` - Quantidade de dedos (0-5)
  * * `parity_guess` - 1=ímpar, 0=par
   * * `jackpot_hit` - true se o player acertou o jackpot (validado pelo ZK)
   * * `salt` - Salt usado no commitment
   * Reivindica vitória por timeout do adversário.
   * 
   * Válido se o adversário não agiu em TIMEOUT_LEDGERS (~8min).
   * O claimer deve ter agido e o adversário não.
   * O jackpot permanece na sala (volta ao Lobby se jackpot_pool > 0).
   */
  claim_timeout: ({room_id, claimer}: {room_id: u64, claimer: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_room transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Retorna o estado da sala.
   */
  get_room: ({room_id}: {room_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Room>>>

  /**
   * Construct and simulate a get_jackpot_hash transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Retorna o hash público do acumulado.
   * O frontend usa para derivar: jackpot_number = accumulated % 100
   * sem nunca conhecer o valor real do acumulado.
   */
  get_jackpot_hash: ({room_id}: {room_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Buffer>>>

  /**
   * Construct and simulate a get_room_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Retorna total de salas criadas
   */
  get_room_count: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a set_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_admin: ({new_admin}: {new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a set_hub transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_hub: ({new_hub}: {new_hub: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a set_verifier transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_verifier: ({new_verifier}: {new_verifier: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  upgrade: ({new_wasm_hash}: {new_wasm_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, verifier, game_hub, xlm_token}: {admin: string, verifier: string, game_hub: string, xlm_token: string},
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
    return ContractClient.deploy({admin, verifier, game_hub, xlm_token}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAEQAAAAAAAAAMUm9vbU5vdEZvdW5kAAAAAQAAAAAAAAAJTm90UGxheWVyAAAAAAAAAgAAAAAAAAAMSW52YWxpZFBoYXNlAAAAAwAAAAAAAAAQQWxyZWFkeUNvbW1pdHRlZAAAAAQAAAAAAAAADEludmFsaWRQcm9vZgAAAAUAAAAAAAAAEVNlbGZQbGF5Rm9yYmlkZGVuAAAAAAAABgAAAAAAAAAKSW52YWxpZEJldAAAAAAABwAAAAAAAAARVGltZW91dE5vdFJlYWNoZWQAAAAAAAAIAAAAAAAAABJBbHJlYWR5SW5pdGlhbGl6ZWQAAAAAAAkAAAAAAAAAEEludmFsaWRIYW5kVmFsdWUAAAAKAAAAAAAAAAxJbnZhbGlkR3Vlc3MAAAALAAAAAAAAABJDb21taXRtZW50TWlzbWF0Y2gAAAAAAAwAAAAAAAAAEkdhbWVBbHJlYWR5U3RhcnRlZAAAAAAADQAAAAAAAAAOWGxtVG9rZW5Ob3RTZXQAAAAAAA4AAAAAAAAADUdhbWVIdWJOb3RTZXQAAAAAAAAPAAAAAAAAAA5WZXJpZmllck5vdFNldAAAAAAAEAAAAAAAAAALQWRtaW5Ob3RTZXQAAAAAEQ==",
        "AAAAAgAAAAAAAAAAAAAAClJvb21TdGF0dXMAAAAAAAMAAAAAAAAAAAAAAAVMb2JieQAAAAAAAAAAAAAAAAAABkNvbW1pdAAAAAAAAAAAAAAAAAAHU2V0dGxlZAA=",
        "AAAAAQAAAAAAAAAAAAAAC1BsYXllclN0YXRlAAAAAAcAAAAAAAAAB2FkZHJlc3MAAAAAEwAAAAAAAAAKY29tbWl0bWVudAAAAAAD6AAAA+4AAAAgAAAAAAAAAA1oYXNfY29tbWl0dGVkAAAAAAAAAQAAAAAAAAALamFja3BvdF9oaXQAAAAAAQAAAAAAAAANcmV2ZWFsZWRfaGFuZAAAAAAAA+gAAAAEAAAAAAAAAA9yZXZlYWxlZF9wYXJpdHkAAAAD6AAAAAQAAAAAAAAAFHJldmVhbGVkX3RvdGFsX2d1ZXNzAAAD6AAAAAQ=",
        "AAAAAQAAAAAAAAAAAAAABFJvb20AAAANAAAAAAAAAApiZXRfYW1vdW50AAAAAAALAAAAAAAAAAtoYXNfcGxheWVyMgAAAAABAAAAAAAAAAJpZAAAAAAABgAAAAAAAAATamFja3BvdF9hY2N1bXVsYXRlZAAAAAAHAAAAAAAAABhqYWNrcG90X2FjY3VtdWxhdGVkX2hhc2gAAAPuAAAAIAAAAAAAAAAMamFja3BvdF9wb29sAAAACwAAAAAAAAASbGFzdF9hY3Rpb25fbGVkZ2VyAAAAAAAEAAAAAAAAAAtsYXN0X3dpbm5lcgAAAAPoAAAAEwAAAAAAAAAHcGxheWVyMQAAAAfQAAAAC1BsYXllclN0YXRlAAAAAAAAAAAHcGxheWVyMgAAAAfQAAAAC1BsYXllclN0YXRlAAAAAAAAAAANcm91bmRzX3BsYXllZAAAAAAAAAQAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAAAAAAABnN0YXR1cwAAAAAH0AAAAApSb29tU3RhdHVzAAA=",
        "AAAABQAAAAAAAAAAAAAAC1Jvb21DcmVhdGVkAAAAAAEAAAAMcm9vbV9jcmVhdGVkAAAAAwAAAAAAAAAHcm9vbV9pZAAAAAAGAAAAAAAAAAAAAAAGcGxheWVyAAAAAAATAAAAAAAAAAAAAAAKYmV0X2Ftb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAClJvb21Kb2luZWQAAAAAAAEAAAALcm9vbV9qb2luZWQAAAAAAgAAAAAAAAAHcm9vbV9pZAAAAAAGAAAAAAAAAAAAAAAGcGxheWVyAAAAAAATAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADUJvdGhDb21taXR0ZWQAAAAAAAABAAAADmJvdGhfY29tbWl0dGVkAAAAAAABAAAAAAAAAAdyb29tX2lkAAAAAAYAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAADUhhbmRDb21taXR0ZWQAAAAAAAABAAAADmhhbmRfY29tbWl0dGVkAAAAAAACAAAAAAAAAAdyb29tX2lkAAAAAAYAAAAAAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAADEhhbmRSZXZlYWxlZAAAAAEAAAANaGFuZF9yZXZlYWxlZAAAAAAAAAQAAAAAAAAAB3Jvb21faWQAAAAABgAAAAAAAAAAAAAABnBsYXllcgAAAAAAEwAAAAAAAAAAAAAABGhhbmQAAAAEAAAAAAAAAAAAAAAGcGFyaXR5AAAAAAAEAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADlRpbWVvdXRDbGFpbWVkAAAAAAABAAAAD3RpbWVvdXRfY2xhaW1lZAAAAAACAAAAAAAAAAdyb29tX2lkAAAAAAYAAAAAAAAAAAAAAAZ3aW5uZXIAAAAAABMAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAACkphY2twb3RXb24AAAAAAAEAAAALamFja3BvdF93b24AAAAAAwAAAAAAAAAHcm9vbV9pZAAAAAAGAAAAAAAAAAAAAAAGd2lubmVyAAAAAAATAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADEphY2twb3RTcGxpdAAAAAEAAAANamFja3BvdF9zcGxpdAAAAAAAAAIAAAAAAAAAB3Jvb21faWQAAAAABgAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAADFBhcml0eVdpbm5lcgAAAAEAAAANcGFyaXR5X3dpbm5lcgAAAAAAAAQAAAAAAAAAB3Jvb21faWQAAAAABgAAAAAAAAAAAAAABndpbm5lcgAAAAAAEwAAAAAAAAAAAAAADXRvdGFsX2ZpbmdlcnMAAAAAAAAEAAAAAAAAAAAAAAANYWN0dWFsX3Bhcml0eQAAAAAAAAQAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAClBhcml0eURyYXcAAAAAAAEAAAALcGFyaXR5X2RyYXcAAAAAAwAAAAAAAAAHcm9vbV9pZAAAAAAGAAAAAAAAAAAAAAANdG90YWxfZmluZ2VycwAAAAAAAAQAAAAAAAAAAAAAAA1hY3R1YWxfcGFyaXR5AAAAAAAABAAAAAAAAAAC",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAQAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAIdmVyaWZpZXIAAAATAAAAAAAAAAhnYW1lX2h1YgAAABMAAAAAAAAACXhsbV90b2tlbgAAAAAAABMAAAAA",
        "AAAAAAAAAAAAAAALY3JlYXRlX3Jvb20AAAAAAgAAAAAAAAAGcGxheWVyAAAAAAATAAAAAAAAAApiZXRfYW1vdW50AAAAAAALAAAAAQAAA+kAAAAGAAAAAw==",
        "AAAAAAAAAAAAAAAJam9pbl9yb29tAAAAAAAAAgAAAAAAAAAHcm9vbV9pZAAAAAAGAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAABABKb2dhZG9yIGNvbW1pdGEgc3VhIGpvZ2FkYSBjb20gcHJvdmEgWksuCgojIyBaSzogbyBxdWUgbyBjaXJjdWl0byBwcm92YSBlIHJldmVsYQoKUHJpdmFkbyAobnVuY2EgcmV2ZWxhZG8pOgotIGphY2twb3RfZ3Vlc3Mg4oiIIFswLCA5OV0gLSBvIHBhbHBpdGUgZG8gamFja3BvdCBwZXJtYW5lY2Ugc2VjcmV0bwotIHNhbHQgKGFsZWF0b3JpZWRhZGUpCgpQw7pibGljbyAob3V0cHV0cyBkYSBwcm92YSAtIHJldmVsYWRvcyBxdWFuZG8gdmVyaWZpY2FkYSk6Ci0gY29tbWl0bWVudCA9IFBvc2VpZG9uKGhhbmQgfHwgcGFyaXR5IHx8IHRvdGFsX2d1ZXNzIHx8IGphY2twb3RfZ3Vlc3MgfHwgc2FsdCkKLSBoYW5kIOKIiCBbMCwgNV0gLSBtw6NvIHJldmVsYWRhIHBlbGEgcHJvdmEKLSBwYXJpdHkg4oiIIHswLCAxfSAtIGFwb3N0YSBkZSBwYXJpZGFkZSByZXZlbGFkYSBwZWxhIHByb3ZhCi0gdG90YWxfZ3Vlc3Mg4oiIIFswLCAxMF0gLSBwYWxwaXRlIGRvIHRvdGFsIHJldmVsYWRvIHBlbGEgcHJvdmEKClDDumJsaWNvIChpbnB1dCBkYSBwcm92YSk6Ci0gamFja3BvdF9hY2N1bXVsYXRlZF9oYXNoID0gaGFzaCBkbyBhY3VtdWxhZG8gYXR1YWwgZGEgc2FsYQoKTyB2ZXJpZmllciBvbi1jaGFpbjoKMS4gVmVyaWZpY2EgYSBwcm92YSBaSwoyLiBPcyB2YWxvcmVzIChoYW5kLCBwYXJpdHksIHRvdGFsX2d1ZXNzKSBzw6NvIGVudmlhZG9zIHBlbG8gZnJvbnRlbmQKMy4gTyBjb21taXRtZW50IG5hIHByb3ZhIGdhcmFudGUgcXVlIG9zIHZhbG9yZXMgc8OjbyBjb3JyZXRvcwo0LiBRdWFuZG8gYW1ib3MgY29tbWl0YW0sIGNhbGN1bGEgcXVlbSBnYW5ob3UKCiMgQXJndW1lbnRvcwoqIGBjb21taXRtZW50YCAtIFBvc2VpZG9uKGhhbmQgfHwgcGFyaXR5IHx8IHRvdGFsX2d1ZXNzIHx8IGphY2twb3RfZ3Vlc3MgfHwgc2FsdCkKKiBgcHJvb2ZgIC0gUHJvdmEgWksgZ2VyYWRhIG9mZi1jaGFpbiBwZWxvIHBsYXllcgoqIGBoYW5kYCAtIE3Do28gcmV2ZWxhZGEgKDAtNSksIHZhbGlkYWRhIHBlbGEgcHJvdmEKKiBgAAAAC2NvbW1pdF9oYW5kAAAAAAgAAAAAAAAAB3Jvb21faWQAAAAABgAAAAAAAAAGcGxheWVyAAAAAAATAAAAAAAAAApjb21taXRtZW50AAAAAAPuAAAAIAAAAAAAAAAFcHJvb2YAAAAAAAAOAAAAAAAAAARoYW5kAAAABAAAAAAAAAAGcGFyaXR5AAAAAAAEAAAAAAAAAAt0b3RhbF9ndWVzcwAAAAAEAAAAAAAAAAtqYWNrcG90X2hpdAAAAAABAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAA/NKb2dhZG9yIHJldmVsYSBtw6NvIGUgcGFscGl0ZSBkZSBwYXJpZGFkZS4KCiMjIE8gcXVlIMOpIHJldmVsYWRvIHB1YmxpY2FtZW50ZToKLSBgaGFuZGAgKDAtNSkKLSBgcGFyaXR5X2d1ZXNzYCAoMD3DrW1wYXIsIDE9cGFyKQotIGBzYWx0YAoKIyMgTyBxdWUgTlVOQ0Egw6kgcmV2ZWxhZG86Ci0gYGphY2twb3RfZ3Vlc3NgIOKAlCBwZXJtYW5lY2Ugc2VjcmV0byBwYXJhIHNlbXByZQpBIHByb3ZhIFpLIGRvIGNvbW1pdCBqw6EgZ2FyYW50aXUgcXVlIGVyYSB2w6FsaWRvLgpPIGBqYWNrcG90X2hpdGAgw6kgZGVyaXZhZG8gZGEgcHJvdmEsIG7Do28gZG8gaW5wdXQgZGlyZXRvLgoKIyMgVmVyaWZpY2HDp8OjbzoKTyBjb250cmF0byByZWNvbnN0csOzaSBTSEEyNTYoaGFuZCB8fCBwYXJpdHlfZ3Vlc3MgfHwgc2FsdCkgZQp2YWxpZGEgY29udHJhIG8gY29tbWl0bWVudC4gRW0gcHJvZHXDp8OjbyBjb20gUG9zZWlkb24gbmF0aXZvLAphIHZlcmlmaWNhw6fDo28gc2VyaWEgY29tcGxldGEgaW5jbHVpbmRvIGphY2twb3RfZ3Vlc3MuCgpRdWFuZG8gYW1ib3MgcmV2ZWxhbSwgYSByb2RhZGEgw6kgZmluYWxpemFkYSBhdXRvbWF0aWNhbWVudGUuCgojIEFyZ3VtZW50b3MKKiBgaGFuZGAgLSBRdWFudGlkYWRlIGRlIGRlZG9zICgwLTUpCiogYHBhcml0eV9ndWVzc2AgLSAwPcOtbXBhciwgMT1wYXIKKiBgamFja3BvdF9oaXRgIC0gdHJ1ZSBzZSBvIHBsYXllciBhY2VydG91IG8gamFja3BvdCAodmFsaWRhZG8gcGVsbyBaSykKKiBgc2FsdGAgLSBTYWx0IHVzYWRvIG5vIGNvbW1pdG1lbnQKUmVpdmluZGljYSB2aXTDs3JpYSBwb3IgdGltZW91dCBkbyBhZHZlcnPDoXJpby4KClbDoWxpZG8gc2UgbyBhZHZlcnPDoXJpbyBuw6NvIGFnaXUgZW0gVElNRU9VVF9MRURHRVJTICh+OG1pbikuCk8gY2xhaW1lciBkZXZlIHRlciBhZ2lkbyBlIG8gYWR2ZXJzw6FyaW8gbsOjby4KTyBqYWNrcG90IHBlcm1hbmVjZSBuYSBzYWxhICh2b2x0YSBhbyBMb2JieSBzZSBqYWNrcG90X3Bvb2wgPiAwKS4AAAAADWNsYWltX3RpbWVvdXQAAAAAAAACAAAAAAAAAAdyb29tX2lkAAAAAAYAAAAAAAAAB2NsYWltZXIAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAABlSZXRvcm5hIG8gZXN0YWRvIGRhIHNhbGEuAAAAAAAACGdldF9yb29tAAAAAQAAAAAAAAAHcm9vbV9pZAAAAAAGAAAAAQAAA+kAAAfQAAAABFJvb20AAAAD",
        "AAAAAAAAAJNSZXRvcm5hIG8gaGFzaCBww7pibGljbyBkbyBhY3VtdWxhZG8uCk8gZnJvbnRlbmQgdXNhIHBhcmEgZGVyaXZhcjogamFja3BvdF9udW1iZXIgPSBhY2N1bXVsYXRlZCAlIDEwMApzZW0gbnVuY2EgY29uaGVjZXIgbyB2YWxvciByZWFsIGRvIGFjdW11bGFkby4AAAAAEGdldF9qYWNrcG90X2hhc2gAAAABAAAAAAAAAAdyb29tX2lkAAAAAAYAAAABAAAD6QAAA+4AAAAgAAAAAw==",
        "AAAAAAAAAB5SZXRvcm5hIHRvdGFsIGRlIHNhbGFzIGNyaWFkYXMAAAAAAA5nZXRfcm9vbV9jb3VudAAAAAAAAAAAAAEAAAAG",
        "AAAAAAAAAAAAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAPpAAAAEwAAAAM=",
        "AAAAAAAAAAAAAAAJc2V0X2FkbWluAAAAAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAHc2V0X2h1YgAAAAABAAAAAAAAAAduZXdfaHViAAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAAMc2V0X3ZlcmlmaWVyAAAAAQAAAAAAAAAMbmV3X3ZlcmlmaWVyAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAABAAAAAAAAAA1uZXdfd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAD6QAAAAIAAAAD" ]),
      options
    )
  }
  public readonly fromJSON = {
    create_room: this.txFromJSON<Result<u64>>,
        join_room: this.txFromJSON<Result<void>>,
        commit_hand: this.txFromJSON<Result<void>>,
        claim_timeout: this.txFromJSON<Result<void>>,
        get_room: this.txFromJSON<Result<Room>>,
        get_jackpot_hash: this.txFromJSON<Result<Buffer>>,
        get_room_count: this.txFromJSON<u64>,
        get_admin: this.txFromJSON<Result<string>>,
        set_admin: this.txFromJSON<Result<void>>,
        set_hub: this.txFromJSON<Result<void>>,
        set_verifier: this.txFromJSON<Result<void>>,
        upgrade: this.txFromJSON<Result<void>>
  }
}