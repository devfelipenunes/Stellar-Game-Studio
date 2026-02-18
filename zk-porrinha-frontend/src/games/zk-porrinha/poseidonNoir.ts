import { Barretenberg, Fr } from '@aztec/bb.js';
import { Buffer } from 'buffer';

// Singleton — inicializado uma vez e reutilizado
let bbInstance: Barretenberg | null = null;

async function getBB(): Promise<Barretenberg> {
  if (!bbInstance) {
    bbInstance = await Barretenberg.new({ threads: 1 });
  }
  return bbInstance;
}

/**
 * Compute Poseidon2 commitment using @aztec/bb.js directly (no second circuit).
 *
 * Computes poseidon2_permutation([hand, parity, exact, salt])[0]
 * — mathematically identical to the assertion inside the main Noir circuit:
 *   let commitment = poseidon2_permutation([hand, parity, exact, salt], 4)[0];
 *   assert(commitment == h);
 *
 * Using bb.js natively is ~100x faster than loading + executing a second Noir circuit,
 * and removes the need for the zk-porrinha-hasher circuit entirely.
 */
export async function computeNoirCommitment(
  hand: number,
  parity: number,
  exact: number,
  saltHex: string
): Promise<Buffer> {
  const bb = await getBB();

  // Normalize salt — strip 0x if present, convert to bigint
  const cleanSalt = saltHex.startsWith('0x') ? saltHex.slice(2) : saltHex;
  const saltBigInt = BigInt('0x' + cleanSalt);

  const inputs: Fr[] = [
    new Fr(BigInt(hand)),
    new Fr(BigInt(parity)),
    new Fr(BigInt(exact)),
    new Fr(saltBigInt),
  ];

  console.log('[Poseidon2] Computing commitment via bb.js:', { hand, parity, exact, salt: cleanSalt.substring(0, 20) + '...' });

  // poseidon2Permutation returns the full permuted state [s0, s1, s2, s3]
  // The circuit uses index [0] — same as here.
  const permuted = await bb.poseidon2Permutation(inputs);
  const result = permuted[0];

  // toBuffer() returns a big-endian 32-byte Uint8Array
  const commitmentBuf = Buffer.from(result.toBuffer());

  console.log('[Poseidon2] Commitment:', commitmentBuf.toString('hex'));

  return commitmentBuf;
}

/** Alias used in resolveWithProof (zkPorrinhaService.ts) */
export async function computePoseidon2Commitment(
  hand: number,
  parity: number,
  exact: number,
  saltHex: string
): Promise<Buffer> {
  return computeNoirCommitment(hand, parity, exact, saltHex);
}

/** Alias used in commitHandWithProof (zkPorrinhaService.ts) */
export async function computeCommitment(
  hand: number,
  parity: number,
  exact: number,
  saltHex: string
): Promise<Buffer> {
  return computeNoirCommitment(hand, parity, exact, saltHex);
}

/** Convert commitment Buffer to hex string */
export function commitmentToHex(commitment: Buffer): string {
  return commitment.toString('hex');
}
