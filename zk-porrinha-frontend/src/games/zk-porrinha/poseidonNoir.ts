import { Noir } from '@noir-lang/noir_js';
import { BarretenbergBackend } from '@noir-lang/backend_barretenberg';
import { Buffer } from 'buffer';
import circuit from '../../../../circuits/zk-porrinha-hasher/target/zk_porrinha_hasher.json';

let noir: Noir | null = null;
let backend: BarretenbergBackend | null = null;

async function initHasher() {
  if (!noir || !backend) {
    backend = new BarretenbergBackend(circuit as any);
    noir = new Noir(circuit as any);
  }
  return { noir, backend };
}

/**
 * Compute Poseidon2 commitment using Noir circuit (100% compatible)
 * Commitment = Poseidon2(hand, parity_guess, exact_sum_guess, salt)
 * This binds ALL game decisions inside the ZK proof.
 */
export async function computeNoirCommitment(
  hand: number,
  parity: number,
  exact: number,
  saltHex: string
): Promise<Buffer> {
  const { noir } = await initHasher();
  
  // Format salt (remove 0x if present)
  const cleanSalt = saltHex.startsWith('0x') ? saltHex.slice(2) : saltHex;
  const saltWithPrefix = '0x' + cleanSalt;
  
  // Execute the hasher circuit with 4-argument Poseidon2
  const inputs = {
    hand: hand.toString(),
    parity_guess: parity.toString(),
    exact_sum_guess: exact.toString(),
    salt: saltWithPrefix,
  };
  
  console.log('[NoirCommitment] Computing with Noir hasher:', {
    hand,
    parity,
    exact,
    salt: cleanSalt.substring(0, 20) + '...',
  });
  
  const { returnValue } = await noir.execute(inputs);
  
  // returnValue is the commitment (Field)
  const commitmentStr = String(returnValue);
  let commitmentHex: string;
  
  if (commitmentStr.startsWith('0x')) {
    commitmentHex = commitmentStr.slice(2);
  } else {
    // Convert BigInt to hex
    const commitmentBigInt = BigInt(commitmentStr);
    commitmentHex = commitmentBigInt.toString(16);
  }
  
  // Pad to 32 bytes (64 hex chars)
  commitmentHex = commitmentHex.padStart(64, '0');
  
  console.log('[NoirCommitment] Computed:', commitmentHex);
  
  return Buffer.from(commitmentHex, 'hex');
}

/**
 * Alias for compatibility
 */
export async function computePoseidon2Commitment(
  hand: number,
  parity: number,
  exact: number,
  saltHex: string
): Promise<Buffer> {
  return computeNoirCommitment(hand, parity, exact, saltHex);
}

export async function computeCommitment(
  hand: number,
  parity: number,
  exact: number,
  saltHex: string
): Promise<Buffer> {
  return computeNoirCommitment(hand, parity, exact, saltHex);
}

/**
 * Convert commitment Buffer to hex string
 */
export function commitmentToHex(commitment: Buffer): string {
  return commitment.toString('hex');
}
