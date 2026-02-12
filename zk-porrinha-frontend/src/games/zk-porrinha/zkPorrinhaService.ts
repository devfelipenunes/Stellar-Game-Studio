import { Client as ZkPorrinhaClient, type Room } from './bindings';
import { config } from '@/config';
import { NETWORK_PASSPHRASE, RPC_URL } from '@/utils/constants';
import { contract } from '@stellar/stellar-sdk';
import { generateMockProof } from './mockProver';
import { generateRealProof, saltToBytes32 } from './realProver';
import { Buffer } from 'buffer';

type ClientOptions = contract.ClientOptions;

// Using REAL ZK prover with compatible versions
// Nargo 0.36.0 + noir_js 0.36.0 + backend_barretenberg 0.36.0
const USE_MOCK_PROVER = false;

export class ZkPorrinhaService {
  private baseClient: ZkPorrinhaClient;
  private contractId: string;

  constructor(contractId: string) {
    this.contractId = contractId;
    this.baseClient = new ZkPorrinhaClient({
      contractId: this.contractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
    });
    
    console.log(`[ZkPorrinhaService] Prover mode: ${USE_MOCK_PROVER ? 'MOCK (dev)' : 'REAL (production)'}`);
  }

  private createSigningClient(
    publicKey: string,
    signer: Pick<ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ): ZkPorrinhaClient {
    const options: ClientOptions = {
      contractId: this.contractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey,
      ...signer,
    };
    return new ZkPorrinhaClient(options);
  }

  async getRoom(roomId: bigint): Promise<Room | null> {
    try {
      const tx = await this.baseClient.get_room({ room_id: roomId });
      const res = await tx.simulate();
      
      if (res.result && typeof (res.result as any).isOk === 'function') {
        if ((res.result as any).isOk()) {
          return (res.result as any).unwrap();
        }
      }
      
      return null;
    } catch (e) {
      console.error('[ZkPorrinhaService] getRoom failed', e);
      return null;
    }
  }

  async getRoomCount(): Promise<bigint> {
    try {
      const tx = await this.baseClient.get_room_count();
      const res = await tx.simulate();
      return res.result as bigint;
    } catch (e) {
      console.error('[ZkPorrinhaService] getRoomCount failed', e);
      return 0n;
    }
  }

  async listRecentRooms(limit = 10): Promise<Array<{ id: bigint; room: Room | null }>> {
    const total = await this.getRoomCount();
    const count = Number(total);
    if (count === 0) return [];
    
    const start = Math.max(1, count - limit + 1);
    const ids = Array.from({ length: count - start + 1 }, (_, i) => BigInt(start + i));
    
    const rows = await Promise.all(
      ids.map(async (id) => ({ id, room: await this.getRoom(id) }))
    );
    
    return rows.reverse();
  }

  async createRoom(
    playerAddress: string,
    signer: Pick<ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    betAmount: bigint
  ): Promise<{ roomId: bigint; txHash: string } | null> {
    try {
      console.log('[🎮 ZK-Porrinha] Creating room...');
      console.log('  Player:', playerAddress);
      console.log('  Bet Amount:', betAmount.toString(), 'stroops (', (Number(betAmount) / 10_000_000).toFixed(1), 'XLM )');
      
      const client = this.createSigningClient(playerAddress, signer);
      
      const tx = await client.create_room({
        player: playerAddress,
        bet_amount: betAmount,
      });
      
      const sent = await tx.signAndSend();
      
      // Extract TX hash from Stellar SDK response
      const txHash = (sent as any).sendTransactionResponse?.hash 
        || (sent as any).getTransactionResponse?.hash
        || (sent as any).hash 
        || 'unknown';
      
      console.log('[✅ Room Created]');
      console.log('  TX Hash:', txHash);
      console.log('  TX Explorer:', `https://stellar.expert/explorer/testnet/tx/${txHash}`);
      
      let roomId: bigint;
      if (sent.result && typeof (sent.result as any).isOk === 'function') {
        if ((sent.result as any).isOk()) {
          roomId = (sent.result as any).unwrap() as bigint;
        } else {
          roomId = sent.result as unknown as bigint;
        }
      } else {
        roomId = sent.result as unknown as bigint;
      }
      
      console.log('  Room ID:', roomId.toString());
      console.log('  💰 Deposited:', (Number(betAmount) / 10_000_000).toFixed(1), 'XLM');
      
      return { roomId, txHash };
    } catch (e) {
      console.error('[❌ ZkPorrinhaService] createRoom failed', e);
      return null;
    }
  }

  async joinRoom(
    roomId: bigint,
    playerAddress: string,
    signer: Pick<ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ): Promise<{ success: boolean; txHash?: string; betAmount?: bigint }> {
    try {
      const room = await this.getRoom(roomId);
      if (!room) {
        throw new Error('Room not found');
      }
      
      console.log('[🎮 ZK-Porrinha] Joining room...');
      console.log('  Room ID:', roomId.toString());
      console.log('  Player:', playerAddress);
      console.log('  Bet Amount:', room.bet_amount.toString(), 'stroops (', (Number(room.bet_amount) / 10_000_000).toFixed(1), 'XLM )');
      
      const client = this.createSigningClient(playerAddress, signer);
      
      const tx = await client.join_room({
        room_id: roomId,
        player: playerAddress,
      });
      
      const sent = await tx.signAndSend();
      
      // Extract TX hash from Stellar SDK response
      const txHash = (sent as any).sendTransactionResponse?.hash 
        || (sent as any).getTransactionResponse?.hash
        || (sent as any).hash 
        || 'unknown';
      
      console.log('[✅ Joined Room]');
      console.log('  TX Hash:', txHash);
      console.log('  TX Explorer:', `https://stellar.expert/explorer/testnet/tx/${txHash}`);
      console.log('  💰 Deposited:', (Number(room.bet_amount) / 10_000_000).toFixed(1), 'XLM');
      console.log('  🎲 Total Prize Pool:', (Number(room.bet_amount) * 2 / 10_000_000).toFixed(1), 'XLM');
      console.log('  🏆 Winner takes:', (Number(room.bet_amount) * 2 / 10_000_000).toFixed(1), 'XLM + Jackpot (if hit)');
      
      return { success: true, txHash, betAmount: room.bet_amount };
    } catch (e) {
      console.error('[❌ ZkPorrinhaService] joinRoom failed', e);
      return { success: false };
    }
  }

  async commitHandWithProof(
    roomId: bigint,
    playerAddress: string,
    signer: Pick<ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    hand: number,
    parity: number,
    totalGuess: number
  ): Promise<{ success: boolean; salt?: string; txHash?: string }> {
    try {
      const room = await this.getRoom(roomId);
      if (!room) {
        throw new Error('Room not found');
      }
      
      console.log('[🔐 ZK-Porrinha] Committing hand with ZK proof...');
      console.log('  Room ID:', roomId.toString());
      console.log('  Player:', playerAddress);
      console.log('  Hand:', hand, 'fingers');
  console.log('  Parity guess:', parity === 1 ? 'ODD (impar)' : 'EVEN (par)');
      console.log('  Total guess:', totalGuess, 'fingers');
      
      const jackpotAccumulated = Number(room.jackpot_accumulated);
      const jackpotGuess = jackpotAccumulated % 100;
      
      console.log('  🎰 Jackpot accumulated (private):', jackpotAccumulated);
      console.log('  🎯 Jackpot number to guess:', jackpotGuess);
      console.log('  💎 Current jackpot pool:', (Number(room.jackpot_pool) / 10_000_000).toFixed(1), 'XLM');
      
      // Check if player guessed the jackpot correctly (validated by ZK circuit)
      let jackpotHit = (jackpotGuess === jackpotAccumulated % 100);

      // Use real or mock prover based on environment
      let commitment, proof, salt;

      if (USE_MOCK_PROVER) {
        console.log('[⚡ Mock Prover] Generating instant proof...');
        const mockResult = await generateMockProof({
          hand,
          parity,
          jackpotGuess,
          jackpotAccumulated,
        });
        commitment = mockResult.commitment;
        proof = mockResult.proof;
        salt = mockResult.salt;
        // In mock mode we keep the locally computed jackpotHit (mock doesn't return it)
      } else {
        console.log('[🔮 Real ZK Prover] Generating zero-knowledge proof (may take 2-5s)...');
        const realResult = await generateRealProof({
          hand,
          parity,
          totalGuess,
          jackpotGuess,
          jackpotAccumulated,
        });
        commitment = realResult.commitment;
        proof = realResult.proof;
        salt = realResult.salt;
        console.log('[✅ ZK Proof] Generated successfully!');
        // Override jackpotHit with the value extracted from the proof outputs
        if (typeof (realResult as any).jackpotHit === 'boolean') {
          jackpotHit = (realResult as any).jackpotHit;
        }
      }
      
      const client = this.createSigningClient(playerAddress, signer);
      
      const commitmentBuffer = commitment.bytes();
      const proofBuffer = proof.bytes();
      
      console.log('[📤 Blockchain] Submitting commitment...');
      
      // TODO: These values will eventually be extracted from the proof outputs
      // For now, we send them as parameters (the ZK proof validates they're correct)
      const tx = await client.commit_hand({
        room_id: roomId,
        player: playerAddress,
        commitment: commitmentBuffer,
        proof: proofBuffer,
        hand: hand,
        parity: parity,
        total_guess: totalGuess,
        jackpot_hit: jackpotHit,
      });
      
      const sent = await tx.signAndSend();
      
      // Extract TX hash from Stellar SDK response
      const txHash = (sent as any).sendTransactionResponse?.hash 
        || (sent as any).getTransactionResponse?.hash
        || (sent as any).hash 
        || 'unknown';
      
      console.log('[✅ Committed]');
      console.log('  TX Hash:', txHash);
      console.log('  TX Explorer:', `https://stellar.expert/explorer/testnet/tx/${txHash}`);
      console.log('  ✨ Winner will be calculated automatically after both players commit!');
      
      return { success: true, salt, txHash };
    } catch (e) {
      console.error('[❌ ZkPorrinhaService] commitHandWithProof failed', e);
      return { success: false };
    }
  }

  async claimTimeout(
    roomId: bigint,
    claimerAddress: string,
    signer: Pick<ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ): Promise<boolean> {
    try {
      const client = this.createSigningClient(claimerAddress, signer);
      
      const tx = await client.claim_timeout({
        room_id: roomId,
        claimer: claimerAddress,
      });
      
      await tx.signAndSend();
      return true;
    } catch (e) {
      console.error('[ZkPorrinhaService] claimTimeout failed', e);
      return false;
    }
  }
}

export const zkPorrinhaService = new ZkPorrinhaService(
  config.ZK_PORRINHA_CONTRACT_ID || ''
);
