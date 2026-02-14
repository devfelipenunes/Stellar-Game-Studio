import { Buffer } from 'buffer';
import { computeCommitment as computePoseidon, computeCommitmentSync } from './poseidon';

/**
 * Utilities for salt generation and Poseidon commitment matching the Noir circuit
 */

export function generateSaltHex(): string {
  const bytes = new Uint8Array(30);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('hex');
}

export function saltHexToBigInt(saltHex: string): bigint {
  if (saltHex.startsWith('0x')) saltHex = saltHex.slice(2);
  return BigInt('0x' + saltHex);
}

export function saltHexToBytes32(saltHex: string): Buffer {
  const buf = Buffer.from(saltHex, 'hex');
  const out = Buffer.alloc(32);
  buf.copy(out, 32 - buf.length);
  return out;
}

export function handToField(hand: number): bigint {
  return BigInt(hand);
}

/**
 * Compute a Poseidon2 commitment using poseidon-lite library
 * This matches the Noir circuit's poseidon2_permutation call
 */
export async function computeCommitment(hand: number, saltHex: string): Promise<Buffer> {
  return computePoseidon(hand, saltHex);
}

/**
 * Synchronous version for immediate use
 */
export function computeCommitmentSyncLocal(hand: number, saltHex: string): Buffer {
  return computeCommitmentSync(hand, saltHex);
}

export function commitmentToHex(commitmentBuf: Buffer): string {
  return '0x' + commitmentBuf.toString('hex');
}

