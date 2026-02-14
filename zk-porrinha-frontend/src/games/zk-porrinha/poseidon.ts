import { BarretenbergSync, Fr } from '@aztec/bb.js';
import { Buffer } from 'buffer';

let barretenberg: BarretenbergSync | null = null;

async function getBarretenberg(): Promise<BarretenbergSync> {
  if (!barretenberg) {
    barretenberg = await BarretenbergSync.initSingleton();
  }
  return barretenberg;
}

export async function computePoseidon2Commitment(
  hand: number,
  saltHex: string
): Promise<Buffer> {
  const bb = await getBarretenberg();
  
  // Remove 0x prefix if present and convert to BigInt
  const cleanSalt = saltHex.startsWith('0x') ? saltHex.slice(2) : saltHex;
  const saltBigInt = BigInt('0x' + cleanSalt);
  
  // Barretenberg's poseidon2Hash expects an array of Fr (Field elements)
  // Noir circuit uses: poseidon2_permutation([hand, salt, 0, 0], 4)[0]
  // Salt is 30 bytes (240 bits), fits perfectly in BN254 field (254 bits)
  const inputs = [
    new Fr(BigInt(hand)),
    new Fr(saltBigInt),
    new Fr(0n),
    new Fr(0n)
  ];
  
  // Call Barretenberg's Poseidon2 hash (same as Noir)
  const hashResult = bb.poseidon2Hash(inputs);
  
  // Convert result to hex for logging
  const hashBuffer = hashResult.toBuffer();
  const hashHex = Buffer.from(hashBuffer).toString('hex');
  
  console.log('[Poseidon] Computed commitment (Barretenberg):', {
    hand,
    salt: cleanSalt,
    result: hashHex
  });
  
  // Convert result to 32-byte buffer (pad if needed)
  const out32 = Buffer.alloc(32);
  const rbuf = Buffer.from(hashBuffer);
  const offset = Math.max(0, 32 - rbuf.length);
  rbuf.copy(out32, offset, 0, Math.min(rbuf.length, 32));
  
  return out32;
}

/**
 * Synchronous version for immediate use
 * Note: First call will be async to initialize Barretenberg
 */
export function computeCommitmentSync(hand: number, saltHex: string): Buffer {
  if (!barretenberg) {
    throw new Error('Barretenberg not initialized. Call computePoseidon2Commitment first or use await.');
  }
  
  const cleanSalt = saltHex.startsWith('0x') ? saltHex.slice(2) : saltHex;
  const saltBigInt = BigInt('0x' + cleanSalt);
  
  const inputs = [
    new Fr(BigInt(hand)),
    new Fr(saltBigInt),
    new Fr(0n),
    new Fr(0n)
  ];
  
  const hashResult = barretenberg.poseidon2Hash(inputs);
  const hashBuffer = hashResult.toBuffer();
  
  const out32 = Buffer.alloc(32);
  const rbuf = Buffer.from(hashBuffer);
  const offset = Math.max(0, 32 - rbuf.length);
  rbuf.copy(out32, offset, 0, Math.min(rbuf.length, 32));
  
  return out32;
}

/**
 * Compute commitment (alias for compatibility)
 */
export async function computeCommitment(
  hand: number,
  saltHex: string
): Promise<Buffer> {
  return computePoseidon2Commitment(hand, saltHex);
}

