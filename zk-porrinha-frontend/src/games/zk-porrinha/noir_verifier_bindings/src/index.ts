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
    contractId: "CDQOXWXGBFPZ3LVYRF56AZWOHBMRJIH7FS5RF5X25TJPABUZKO463DS6",
  }
} as const

export const Errors = {
  1: {message:"InvalidProof"},
  2: {message:"InvalidPublicInputs"},
  3: {message:"VerificationFailed"},
  4: {message:"CircuitNotRegistered"}
}


export interface CircuitInfo {
  circuit_hash: Buffer;
  name: string;
  version: u32;
}

export interface Client {
  /**
   * Construct and simulate a verify transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Verify a proof with circuit validation
   * In production, this should call Barretenberg verification
   * For testnet, we do structural validation + circuit registry check
   */
  verify: ({proof, public_inputs}: {proof: Buffer, public_inputs: Array<Buffer>}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a register_circuit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Register a circuit for verification
   */
  register_circuit: ({circuit_hash, name, version}: {circuit_hash: Buffer, name: string, version: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_circuit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get circuit info by hash
   */
  get_circuit: ({circuit_hash}: {circuit_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Option<CircuitInfo>>>

  /**
   * Construct and simulate a verify_with_circuit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Verify proof with circuit hash validation
   */
  verify_with_circuit: ({proof, public_inputs, circuit_hash}: {proof: Buffer, public_inputs: Array<Buffer>, circuit_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  version: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a info transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  info: (options?: MethodOptions) => Promise<AssembledTransaction<readonly [u32, boolean]>>

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
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABAAAAAAAAAAMSW52YWxpZFByb29mAAAAAQAAAAAAAAATSW52YWxpZFB1YmxpY0lucHV0cwAAAAACAAAAAAAAABJWZXJpZmljYXRpb25GYWlsZWQAAAAAAAMAAAAAAAAAFENpcmN1aXROb3RSZWdpc3RlcmVkAAAABA==",
        "AAAAAQAAAAAAAAAAAAAAC0NpcmN1aXRJbmZvAAAAAAMAAAAAAAAADGNpcmN1aXRfaGFzaAAAA+4AAAAgAAAAAAAAAARuYW1lAAAAEQAAAAAAAAAHdmVyc2lvbgAAAAAE",
        "AAAAAAAAAKJWZXJpZnkgYSBwcm9vZiB3aXRoIGNpcmN1aXQgdmFsaWRhdGlvbgpJbiBwcm9kdWN0aW9uLCB0aGlzIHNob3VsZCBjYWxsIEJhcnJldGVuYmVyZyB2ZXJpZmljYXRpb24KRm9yIHRlc3RuZXQsIHdlIGRvIHN0cnVjdHVyYWwgdmFsaWRhdGlvbiArIGNpcmN1aXQgcmVnaXN0cnkgY2hlY2sAAAAAAAZ2ZXJpZnkAAAAAAAIAAAAAAAAABXByb29mAAAAAAAADgAAAAAAAAANcHVibGljX2lucHV0cwAAAAAAA+oAAAPuAAAAIAAAAAEAAAAB",
        "AAAAAAAAACNSZWdpc3RlciBhIGNpcmN1aXQgZm9yIHZlcmlmaWNhdGlvbgAAAAAQcmVnaXN0ZXJfY2lyY3VpdAAAAAMAAAAAAAAADGNpcmN1aXRfaGFzaAAAA+4AAAAgAAAAAAAAAARuYW1lAAAAEQAAAAAAAAAHdmVyc2lvbgAAAAAEAAAAAA==",
        "AAAAAAAAABhHZXQgY2lyY3VpdCBpbmZvIGJ5IGhhc2gAAAALZ2V0X2NpcmN1aXQAAAAAAQAAAAAAAAAMY2lyY3VpdF9oYXNoAAAD7gAAACAAAAABAAAD6AAAB9AAAAALQ2lyY3VpdEluZm8A",
        "AAAAAAAAAClWZXJpZnkgcHJvb2Ygd2l0aCBjaXJjdWl0IGhhc2ggdmFsaWRhdGlvbgAAAAAAABN2ZXJpZnlfd2l0aF9jaXJjdWl0AAAAAAMAAAAAAAAABXByb29mAAAAAAAADgAAAAAAAAANcHVibGljX2lucHV0cwAAAAAAA+oAAAPuAAAAIAAAAAAAAAAMY2lyY3VpdF9oYXNoAAAD7gAAACAAAAABAAAAAQ==",
        "AAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAAAAAAAQAAAAQ=",
        "AAAAAAAAAAAAAAAEaW5mbwAAAAAAAAABAAAD7QAAAAIAAAAEAAAAAQ==" ]),
      options
    )
  }
  public readonly fromJSON = {
    verify: this.txFromJSON<boolean>,
        register_circuit: this.txFromJSON<null>,
        get_circuit: this.txFromJSON<Option<CircuitInfo>>,
        verify_with_circuit: this.txFromJSON<boolean>,
        version: this.txFromJSON<u32>,
        info: this.txFromJSON<readonly [u32, boolean]>
  }
}