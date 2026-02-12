/**
 * Real ZK Prover using Noir + Barretenberg
 * 
 * This module generates actual zero-knowledge proofs using Noir.js
 * Production-ready implementation for ZK Porrinha game
 */

import { Noir } from '@noir-lang/noir_js';
import { BarretenbergBackend, type CompiledCircuit } from '@noir-lang/backend_barretenberg';
import { Buffer } from "buffer";
import { xdr } from "@stellar/stellar-sdk";

// Cache for the Noir instance
let noirInstance: Noir | null = null;
let backendInstance: BarretenbergBackend | null = null;

/**
 * Initialize the Noir prover with the compiled circuit
 */
async function initializeProver(): Promise<{ noir: Noir; backend: BarretenbergBackend }> {
  if (noirInstance && backendInstance) {
    return { noir: noirInstance, backend: backendInstance };
  }

  console.log('[NoirProver] Loading circuit...');
  
  // Load compiled circuit from public folder
  const response = await fetch('/zk_porrinha.json');
  if (!response.ok) {
    throw new Error('Failed to load circuit. Make sure zk_porrinha.json is in /public folder');
  }
  
  const circuit = await response.json();
  console.log('[NoirProver] Circuit loaded successfully');
  
  // Initialize backend
  backendInstance = new BarretenbergBackend(circuit);
  console.log('[NoirProver] Backend initialized');
  
  // Initialize Noir
  noirInstance = new Noir(circuit);
  console.log('[NoirProver] Noir instance created');
  
  return { noir: noirInstance, backend: backendInstance };
}

/**
 * Generate a random salt for the commitment
 */
export function generateSalt(): string {
  // BN254 field modulus: 21888242871839275222246405745257275088548364400416034343698204186575808495617
  // We need to generate a value smaller than this
  // Use 30 bytes (240 bits) to ensure it fits within the 254-bit field
  const bytes = new Uint8Array(30); // 30 bytes = 240 bits < 254 bits
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("hex");
}

/**
 * Convert salt to 32-byte buffer for Soroban (with padding)
 */
export function saltToBytes32(salt: string): Buffer {
  // Salt is 30 bytes (60 hex chars)
  const saltBuffer = Buffer.from(salt, 'hex');
  
  // Pad to 32 bytes with leading zeros
  const padded = Buffer.alloc(32);
  saltBuffer.copy(padded, 32 - saltBuffer.length);
  
  return padded;
}

/**
 * Convert hex salt to Field element (bigint)
 */
function saltToField(salt: string): string {
  // Convert hex salt to bigint
  const saltBigInt = BigInt('0x' + salt);
  
  // BN254 field modulus
  const FIELD_MODULUS = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
  
  // Ensure it's within field
  if (saltBigInt >= FIELD_MODULUS) {
    throw new Error(`Salt exceeds field modulus: ${saltBigInt} >= ${FIELD_MODULUS}`);
  }
  
  return saltBigInt.toString();
}

/**
 * Hash using Poseidon2 (must match circuit logic)
 */
function computePoseidon2Commitment(
  hand: number,
  parity: number,
  jackpotGuess: number,
  salt: string
): string {
  // Note: This needs to match the circuit's poseidon2_permutation exactly
  // For now, we'll let the circuit compute it and return as public output
  // The commitment will be extracted from the proof's public inputs
  
  // We'll compute this on the Noir side, so return placeholder
  return saltToField(salt);
}

export interface RealProverInput {
  hand: number; // 0-5
  parity: number; // 1 (odd) or 0 (even)
  totalGuess: number; // 0-10 (guess of total fingers)
  jackpotGuess: number; // 0-99
  salt?: string; // Optional, will be generated if not provided
  jackpotAccumulated: number; // Current jackpot value
}

export interface RealProverOutput {
  commitment: xdr.ScVal; // BytesN<32> commitment
  proof: xdr.ScVal; // Bytes proof
  salt: string; // Salt used (kept secret)
  publicInputs: string[]; // Public inputs for verification
  hand: number; // Hand value (0-5) - will be extracted from proof outputs
  parity: number; // Parity guess (0/1) - will be extracted from proof outputs
  totalGuess: number; // Total guess (0-10) - will be extracted from proof outputs
  jackpotHit: boolean; // jackpot hit flag extracted from proof outputs
}

/**
 * Generate a real ZK proof using Noir + Barretenberg
 */
export async function generateRealProof(
  input: RealProverInput
): Promise<RealProverOutput> {
  const { hand, parity, totalGuess, jackpotGuess, jackpotAccumulated } = input;
  
  // Validate inputs
  if (hand < 0 || hand > 5) {
    throw new Error("Hand value must be between 0 and 5");
  }
  if (parity !== 0 && parity !== 1) {
    throw new Error("Parity must be 1 (odd) or 0 (even)");
  }
  if (totalGuess < 0 || totalGuess > 10) {
    throw new Error("Total guess must be between 0 and 10");
  }
  if (jackpotGuess < 0 || jackpotGuess > 99) {
    throw new Error("Jackpot guess must be between 0 and 99");
  }
  
  // Validate jackpot guess matches accumulated % 100
  const expectedGuess = jackpotAccumulated % 100;
  if (jackpotGuess !== expectedGuess) {
    throw new Error(
      `❌ Jackpot guess (${jackpotGuess}) must match accumulated % 100 (${expectedGuess}). ` +
      `This is enforced by the ZK circuit.`
    );
  }
  
  // Generate or use provided salt
  const salt = input.salt || generateSalt();
  const saltField = saltToField(salt);
  
  console.log('[NoirProver] Generating proof with inputs:', {
    hand,
    parity,
    totalGuess,
    jackpotGuess,
    jackpotAccumulated,
    saltLength: salt.length,
  });
  
  // Initialize prover
  const { noir, backend } = await initializeProver();
  
  // Prepare circuit inputs (must match NEW circuit main() signature)
  // New signature: fn main(hand_value, parity_guess, total_guess, jackpot_guess, salt, jackpot_accumulated: pub)
  const circuitInputs = {
    hand_value: hand.toString(),
  parity_guess: parity.toString(),
    total_guess: totalGuess.toString(),
    jackpot_guess: jackpotGuess.toString(),
    salt: saltField,
    jackpot_accumulated: jackpotAccumulated.toString(),
  };
  
  console.log('[NoirProver] Executing circuit...');
  const startTime = performance.now();
  
  // Execute the circuit to get witness
  const { witness, returnValue } = await noir.execute(circuitInputs);
  
  console.log('[NoirProver] Generating proof...');
  
  // Generate the proof
  const proof = await backend.generateProof(witness);
  
  const elapsedTime = ((performance.now() - startTime) / 1000).toFixed(2);
  console.log(`[NoirProver] ✅ Proof generated in ${elapsedTime}s`);
  
  // Extract commitment from return value (circuit now returns it)
  const commitmentHex = String(returnValue || proof.publicInputs[0]);
  const cleanHex = commitmentHex.replace('0x', '');
  const commitmentBuffer = Buffer.from(cleanHex, 'hex');
  
  // Ensure commitment is 32 bytes
  const commitment32 = Buffer.alloc(32);
  commitmentBuffer.copy(commitment32, 32 - commitmentBuffer.length);
  
  // Convert proof bytes to Buffer
  const proofBuffer = Buffer.from(proof.proof);
  
  // Robustly parse public outputs (commitment, hand, parity, total, jackpot_hit)
  const publicOut = proof.publicInputs || [];

  function scvalToBuffer(val: any): Buffer {
    if (!val) return Buffer.alloc(0);
    const s = String(val);
    if (s.startsWith('0x')) {
      return Buffer.from(s.replace(/^0x/, ''), 'hex');
    }
    // decimal string -> bigint -> hex
    const bi = BigInt(s);
    let hex = bi.toString(16);
    if (hex.length % 2 === 1) hex = '0' + hex;
    return Buffer.from(hex, 'hex');
  }

  // commitment may be in returnValue or publicInputs[0]
  const commitmentBuf = scvalToBuffer(returnValue || publicOut[0] || proof.publicInputs[0]);
  const commitment32_final = Buffer.alloc(32);
  commitmentBuf.copy(commitment32_final, 32 - commitmentBuf.length);

  // Convert to Stellar XDR ScVal format
  const commitmentScVal = xdr.ScVal.scvBytes(commitment32_final);
  const proofScVal = xdr.ScVal.scvBytes(proofBuffer);

  // Extract the revealed values from public outputs if present
  const handOut = publicOut[1] ? BigInt(String(publicOut[1])) : BigInt(hand);
  const parityOut = publicOut[2] ? BigInt(String(publicOut[2])) : BigInt(parity);
  const totalOut = publicOut[3] ? BigInt(String(publicOut[3])) : BigInt(totalGuess);
  const jackpotHitOut = publicOut[4] ? BigInt(String(publicOut[4])) : BigInt(0);
  const jackpotHitBool = jackpotHitOut === BigInt(1);
  
  console.log('[NoirProver] Proof details:', {
    proofSize: proofBuffer.length,
    commitmentSize: commitment32_final.length,
    publicInputsCount: proof.publicInputs.length,
  });
  
  return {
    commitment: commitmentScVal,
    proof: proofScVal,
    salt,
    publicInputs: proof.publicInputs,
    hand: Number(handOut), // Extracted from proof outputs
    parity: Number(parityOut), // Extracted from proof outputs
    totalGuess: Number(totalOut), // Extracted from proof outputs
    jackpotHit: jackpotHitBool,
  };
}

/**
 * Verify a proof (optional, mainly for testing)
 */
export async function verifyProof(
  proof: Uint8Array,
  publicInputs: string[]
): Promise<boolean> {
  const { backend } = await initializeProver();
  
  try {
    const isValid = await backend.verifyProof({
      proof,
      publicInputs,
    });
    
    console.log('[NoirProver] Proof verification:', isValid ? '✅ VALID' : '❌ INVALID');
    return isValid;
  } catch (error) {
    console.error('[NoirProver] Verification failed:', error);
    return false;
  }
}
