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
  const response = await fetch('/circuit.json');
  if (!response.ok) {
    throw new Error('Failed to load circuit. Make sure circuit.json is in /public folder');
  }
  
  const circuit = await response.json();
  console.log('[NoirProver] Circuit loaded successfully');
  
  // Initialize backend
  backendInstance = new BarretenbergBackend(circuit);
  console.log('[NoirProver] Backend initialized');
  
  // Initialize Noir
  noirInstance = new Noir(circuit);
  console.log('[NoirProver] Noir instance created');

  // Extra info for debugging
  try {
    console.log('[NoirProver] Circuit info:', {
      publicInputs: (circuit as any).public_inputs?.length || (circuit as any).publicInputs?.length || 'unknown',
      functions: Object.keys((circuit as any).functions || {}).length,
    });
  } catch (e) {
    // ignore
  }
  
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
  // Both players' secrets must be provided to generate proof
  hand1: number;
  salt1Hex: string;
  hand2: number;
  salt2Hex: string;
  // Commitments (public) as hex or 32-byte buffers
  h1: string | Buffer;
  h2: string | Buffer;
}

export interface RealProverOutput {
  proofBytes: Uint8Array;
  totalSum: number;
}

/**
 * Generate a real ZK proof using Noir + Barretenberg
 */
export async function generateRealProof(input: RealProverInput): Promise<RealProverOutput> {
  const { hand1, salt1Hex, hand2, salt2Hex, h1, h2 } = input;
  // Basic validation
  if (hand1 < 0 || hand1 > 3 || hand2 < 0 || hand2 > 3) throw new Error('Hand values must be between 0 and 3');

  const { noir, backend } = await initializeProver();

  // Converter salt de hex para formato Field que o Noir entende
  // CRÍTICO: Usar o MESMO formato que usamos no poseidon.ts para calcular commitment
  const formatSalt = (saltHex: string): string => {
    // Remove 0x se existir
    let cleaned = saltHex.startsWith('0x') ? saltHex.slice(2) : saltHex;
    
    // Converte para BigInt e de volta para garantir formato consistente
    const saltBigInt = BigInt('0x' + cleaned);
    
    // Retorna em formato 0x... que Noir entende
    return '0x' + saltBigInt.toString(16);
  };

  const circuitInputs: any = {
    hand1: hand1.toString(),
    salt1: formatSalt(salt1Hex),
    hand2: hand2.toString(),
    salt2: formatSalt(salt2Hex),
    h1: typeof h1 === 'string' ? h1 : '0x' + Buffer.from(h1 as Buffer).toString('hex'),
    h2: typeof h2 === 'string' ? h2 : '0x' + Buffer.from(h2 as Buffer).toString('hex'),
  };

  console.log('[NoirProver] Circuit inputs:', {
    hand1: circuitInputs.hand1,
    salt1: circuitInputs.salt1.substring(0, 20) + '...',
    hand2: circuitInputs.hand2,
    salt2: circuitInputs.salt2.substring(0, 20) + '...',
    h1: circuitInputs.h1.substring(0, 20) + '...',
    h2: circuitInputs.h2.substring(0, 20) + '...',
  });

  console.log('[NoirProver] Executing circuit with provided secrets...');
  const execStart = performance.now();
  const { witness, returnValue } = await noir.execute(circuitInputs);
  const execElapsed = ((performance.now() - execStart) / 1000).toFixed(2);
  console.log(`[NoirProver] Circuit execution complete in ${execElapsed}s`);

  const proofStart = performance.now();
  const proof = await backend.generateProof(witness);
  const proofElapsed = ((performance.now() - proofStart) / 1000).toFixed(2);
  console.log(`[NoirProver] Proof generated in ${proofElapsed}s`);

  const proofBuffer = Buffer.from(proof.proof);

  // total sum should be in returnValue (field) or in publicInputs
  let totalSum = 0;
  try {
    const rv = returnValue || proof.publicInputs[0];
    const s = String(rv);
    if (s.startsWith('0x')) {
      totalSum = Number(BigInt(s));
    } else {
      totalSum = Number(BigInt(s));
    }
  } catch (e) {
    console.warn('[NoirProver] Unable to parse total sum from return value', e);
  }

  return { proofBytes: proofBuffer, totalSum };
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
