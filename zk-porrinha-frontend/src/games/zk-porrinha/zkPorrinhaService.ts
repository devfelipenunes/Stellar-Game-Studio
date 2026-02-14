import { Client as ZkPorrinhaClient, type Room } from "./bindings";
import { config } from "@/config";
import { NETWORK_PASSPHRASE, RPC_URL } from "@/utils/constants";
import { contract } from "@stellar/stellar-sdk";
import { generateRealProof } from "./realProver";
import { computeCommitment, commitmentToHex } from './poseidonNoir'; // USE NOIR HASHER
import { saveSecret } from './secrets';
import { verifyProofOnChain } from './verifier';
import { localGameState, type LocalHand } from './localGameState';

type ClientOptions = contract.ClientOptions;

function extractTxHash(sent: any): string {
  return (
    sent?.sendTransactionResponse?.hash ||
    sent?.getTransactionResponse?.hash ||
    sent?.hash ||
    "unknown"
  );
}

async function signAndSendTx(tx: any) {
  const sent = await tx.signAndSend();
  const txHash = extractTxHash(sent);
  return { sent, txHash };
}

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
  }

  private createSigningClient(
    publicKey: string,
    signer: Pick<ClientOptions, "signTransaction" | "signAuthEntry">,
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

      if (res.result && typeof (res.result as any).isOk === "function") {
        if ((res.result as any).isOk()) {
          return (res.result as any).unwrap();
        }
      }

      return null;
    } catch (e) {
      console.error("[ZkPorrinhaService] getRoom failed", e);
      return null;
    }
  }

  async getRoomCount(): Promise<bigint> {
    try {
      const tx = await this.baseClient.get_room_count();
      const res = await tx.simulate();
      return res.result as bigint;
    } catch (e) {
      console.error("[ZkPorrinhaService] getRoomCount failed", e);
      return 0n;
    }
  }

  async listRecentRooms(
    limit = 10,
  ): Promise<Array<{ id: bigint; room: Room | null }>> {
    const total = await this.getRoomCount();
    const count = Number(total);
    if (count === 0) return [];

    const start = Math.max(1, count - limit + 1);
    const ids = Array.from({ length: count - start + 1 }, (_, i) =>
      BigInt(start + i),
    );

    const rows = await Promise.all(
      ids.map(async (id) => ({ id, room: await this.getRoom(id) })),
    );

    return rows.reverse();
  }

  async createRoom(
    playerAddress: string,
    signer: Pick<ClientOptions, "signTransaction" | "signAuthEntry">,
    betAmount: bigint,
  ): Promise<{ roomId: bigint; txHash: string } | null> {
    try {
      const client = this.createSigningClient(playerAddress, signer);
      const tx = await client.create_room({
        player: playerAddress,
        bet_amount: betAmount,
      });
      const { sent, txHash } = await signAndSendTx(tx);
      let roomId: bigint;
      if (sent.result && typeof (sent.result as any).isOk === "function") {
        if ((sent.result as any).isOk()) {
          roomId = (sent.result as any).unwrap() as bigint;
        } else {
          roomId = sent.result as unknown as bigint;
        }
      } else {
        roomId = sent.result as unknown as bigint;
      }
      return { roomId, txHash };
    } catch (e) {
      console.error("[ZkPorrinhaService] createRoom failed", e);
      return null;
    }
  }

  async joinRoom(
    roomId: bigint,
    playerAddress: string,
    signer: Pick<ClientOptions, "signTransaction" | "signAuthEntry">,
  ): Promise<{ success: boolean; txHash?: string; betAmount?: bigint }> {
    try {
      const room = await this.getRoom(roomId);
      if (!room) throw new Error("Room not found");
      const client = this.createSigningClient(playerAddress, signer);
      const tx = await client.join_room({
        room_id: roomId,
        player: playerAddress,
      });
      const { txHash } = await signAndSendTx(tx);
      return { success: true, txHash, betAmount: room.bet_amount };
    } catch (e) {
      console.error("[ZkPorrinhaService] joinRoom failed", e);
      return { success: false };
    }
  }

  async commitHandWithProof(
    roomId: bigint,
    playerAddress: string,
    signer: Pick<ClientOptions, "signTransaction" | "signAuthEntry">,
    hand: number,
    parity: number,
    totalGuess: number,
  ): Promise<{ success: boolean; salt?: string; txHash?: string }> {
    try {
      const room = await this.getRoom(roomId);
      if (!room) throw new Error("Room not found");

      const { generateSalt } = await import('./realProver');
      const saltHex = generateSalt();
      const commitmentBuf = await computeCommitment(hand, saltHex);
      const commitmentHex = commitmentToHex(commitmentBuf);

      saveSecret(roomId, playerAddress, { hand, saltHex });

      const localHand: LocalHand = {
        roomId,
        playerAddress,
        hand,
        salt: saltHex,
        commitment: commitmentHex,
        parityGuess: parity,
        exactSumGuess: totalGuess,
        timestamp: Date.now(),
      };
      localGameState.saveHand(localHand);
      console.log('💾 Hand saved locally for auto-resolution');

      const client = this.createSigningClient(playerAddress, signer);
      const tx = await client.commit({
        room_id: roomId,
        player: playerAddress,
        commitment: commitmentBuf,
        parity: parity,
        exact_guess: totalGuess,
      });
      const { txHash } = await signAndSendTx(tx);
      
      console.log('✅ Commit successful, checking for auto-resolve...');
      
      return { success: true, salt: saltHex, txHash };
    } catch (e) {
      console.error("[ZkPorrinhaService] commitHandWithProof failed", e);
      return { success: false };
    }
  }


  async resolveWithProof(
    roomId: bigint,
    playerAddress: string,
    signer: Pick<ClientOptions, "signTransaction" | "signAuthEntry">,
    mySecret: { hand: number; saltHex: string },
    otherSecret: { hand: number; saltHex: string },
    verifyOnChain = true, 
  ): Promise<{ success: boolean; txHash?: string; verificationResult?: boolean }> {
    try {
      const room = await this.getRoom(roomId);
      if (!room) throw new Error('Room not found');

      const { computePoseidon2Commitment } = await import('./poseidonNoir');
      const h1Buf = await computePoseidon2Commitment(mySecret.hand, mySecret.saltHex);
      const h2Buf = await computePoseidon2Commitment(otherSecret.hand, otherSecret.saltHex);
      
      console.log('[DEBUG] Commitments recalculated locally (not from contract)');

      const proverInput = {
        hand1: mySecret.hand,
        salt1Hex: mySecret.saltHex,
        hand2: otherSecret.hand,
        salt2Hex: otherSecret.saltHex,
        h1: h1Buf,
        h2: h2Buf,
      };

      console.log('🔐 Generating ZK proof...');
      console.log('[DEBUG] Prover inputs:', {
        hand1: proverInput.hand1,
        salt1: proverInput.salt1Hex.substring(0, 20) + '...',
        hand2: proverInput.hand2,
        salt2: proverInput.salt2Hex.substring(0, 20) + '...',
        h1: Buffer.from(proverInput.h1).toString('hex'),
        h2: Buffer.from(proverInput.h2).toString('hex'),
      });
      
      const { proofBytes, totalSum } = await generateRealProof(proverInput);
      console.log('✅ Proof generated successfully');

      const nullifierData = Buffer.concat([
        Buffer.from(roomId.toString()),
        h1Buf,
        h2Buf,
      ]);
      
      const hashBuffer = await crypto.subtle.digest('SHA-256', nullifierData);
      const nullifier = Buffer.from(hashBuffer);

      let verificationResult = false;
      if (verifyOnChain) {
        console.log('🔍 Verifying proof on-chain...');
        const publicInputs = [h1Buf, h2Buf]; // Public commitments
        verificationResult = await verifyProofOnChain(
          proofBytes,
          publicInputs.map(buf => new Uint8Array(buf)),
          playerAddress
        );
        
        if (!verificationResult) {
          console.warn('⚠️ On-chain verification failed, but proceeding with game contract...');
        } else {
          console.log('✅ Proof verified on-chain successfully');
        }
      }

      console.log('📤 Submitting proof to game contract...');
      const client = this.createSigningClient(playerAddress, signer);
      const tx = await client.resolve({ 
        room_id: roomId, 
        proof: Buffer.from(proofBytes), 
        total_sum: totalSum,
        nullifier: nullifier,
      });
      const { txHash } = await signAndSendTx(tx);
      
      console.log('✅ Proof submitted successfully. TxHash:', txHash);
      
      return { success: true, txHash, verificationResult };
    } catch (e) {
      console.error('[ZkPorrinhaService] resolveWithProof failed', e);
      return { success: false, verificationResult: false };
    }
  }

  async tryAutoResolve(
    roomId: bigint,
    currentPlayerAddress: string,
    signer: Pick<ClientOptions, "signTransaction" | "signAuthEntry">,
  ): Promise<{ 
    autoResolved: boolean; 
    txHash?: string; 
    error?: string;
    winner?: string;
    totalSum?: number;
  }> {
    try {
      const room = await this.getRoom(roomId);
      if (!room) {
        return { autoResolved: false, error: 'Room not found' };
      }

      if (!room.player1.has_committed || !room.player2.has_committed) {
        console.log('⏳ Waiting for both players to commit...');
        return { autoResolved: false };
      }

      const player1Addr = room.player1.address;
      const player2Addr = room.player2.address;
      
      const state = localGameState.canAutoResolve(roomId, player1Addr, player2Addr);
      
      if (!state.canResolve || !state.hand1 || !state.hand2) {
        console.warn('⚠️ Both players committed but hands not found locally. Cannot auto-resolve.');
        return { autoResolved: false, error: 'Missing local hand data' };
      }

      console.log('🎲 Both players committed! Auto-resolving game...');

      const result = await this.resolveWithProof(
        roomId,
        currentPlayerAddress,
        signer,
        { hand: state.hand1.hand, saltHex: state.hand1.salt }, 
        { hand: state.hand2.hand, saltHex: state.hand2.salt }, 
        false 
      );

      if (result.success) {
        console.log('🎉 Game auto-resolved successfully!');
        
        const resolvedRoom = await this.getRoom(roomId);
        
        if (resolvedRoom && resolvedRoom.winner) {
          const winnerAddr = resolvedRoom.winner;
          const isPlayer1Winner = winnerAddr === resolvedRoom.player1.address;
          const winnerName = isPlayer1Winner ? 'Player 1' : 'Player 2';
          const winnerShort = winnerAddr.substring(0, 8) + '...';
          
          console.log('🏆 WINNER:', winnerName, winnerShort);
          console.log('🎲 Total sum revealed:', resolvedRoom.total_sum || 'unknown');
          console.log('💰 Bet amount:', resolvedRoom.bet_amount, 'stroops per player');
          console.log('💵 Total pot:', (BigInt(resolvedRoom.bet_amount) * 2n).toString(), 'stroops');
          
          console.log('📊 Player 1 guesses:', {
            parity: resolvedRoom.player1.parity_guess === 0 ? 'Par' : 'Ímpar',
            exact: resolvedRoom.player1.exact_sum_guess,
          });
          console.log('📊 Player 2 guesses:', {
            parity: resolvedRoom.player2.parity_guess === 0 ? 'Par' : 'Ímpar',
            exact: resolvedRoom.player2.exact_sum_guess,
          });
        }
        
        localGameState.clearRoom(roomId);
        return { 
          autoResolved: true, 
          txHash: result.txHash,
          winner: resolvedRoom?.winner,
          totalSum: resolvedRoom?.total_sum,
        };
      } else {
        return { autoResolved: false, error: 'Resolution failed' };
      }
    } catch (e) {
      console.error('[ZkPorrinhaService] tryAutoResolve failed', e);
      return { autoResolved: false, error: String(e) };
    }
  }
}

export const zkPorrinhaService = new ZkPorrinhaService(
  config.ZK_PORRINHA_CONTRACT_ID || "",
);
