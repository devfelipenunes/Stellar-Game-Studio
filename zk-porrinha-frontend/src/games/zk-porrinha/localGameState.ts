/**
 * Local Game State Manager
 * Armazena mãos jogadas localmente e gerencia auto-resolução
 */

export interface LocalHand {
  roomId: bigint;
  playerAddress: string;
  hand: number; // 0-5 dedos
  salt: string;
  commitment: string;
  parityGuess: number; // 0: Par, 1: Ímpar
  exactSumGuess: number; // 0-10
  timestamp: number;
}

// Internal storage format (BigInt serializado como string)
interface StoredHand {
  roomId: string;
  playerAddress: string;
  hand: number;
  salt: string;
  commitment: string;
  parityGuess: number;
  exactSumGuess: number;
  timestamp: number;
}

const STORAGE_KEY = 'zk-porrinha-hands';
const STORAGE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 horas

export class LocalGameStateManager {
  /**
   * Salva a mão jogada localmente
   */
  saveHand(hand: LocalHand): void {
    try {
      const stored = this.getAllHands();
      
      // Remove mãos antigas desta sala
      const filtered = stored.filter(
        h => !(h.roomId === hand.roomId && h.playerAddress === hand.playerAddress)
      );
      
      filtered.push(hand);
      
      // Converte BigInt para string antes de serializar
      const serializable = filtered.map(h => ({
        ...h,
        roomId: h.roomId.toString(),
      }));
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
      console.log(`[LocalGameState] Hand saved for room ${hand.roomId}, player ${hand.playerAddress.slice(0, 8)}...`);
    } catch (e) {
      console.error('[LocalGameState] Failed to save hand:', e);
    }
  }

  /**
   * Busca a mão de um jogador em uma sala específica
   */
  getHand(roomId: bigint, playerAddress: string): LocalHand | null {
    const hands = this.getAllHands();
    return hands.find(
      h => h.roomId === roomId && h.playerAddress === playerAddress
    ) || null;
  }

  /**
   * Busca todas as mãos de uma sala
   */
  getRoomHands(roomId: bigint): LocalHand[] {
    const hands = this.getAllHands();
    return hands.filter(h => h.roomId === roomId);
  }

  /**
   * Verifica se ambos jogadores commitaram e temos as mãos salvas
   */
  canAutoResolve(roomId: bigint, player1: string, player2: string): {
    canResolve: boolean;
    hand1?: LocalHand;
    hand2?: LocalHand;
  } {
    const hand1 = this.getHand(roomId, player1);
    const hand2 = this.getHand(roomId, player2);

    const canResolve = !!(hand1 && hand2);

    return {
      canResolve,
      hand1: hand1 || undefined,
      hand2: hand2 || undefined,
    };
  }

  /**
   * Remove mãos de uma sala após resolução
   */
  clearRoom(roomId: bigint): void {
    try {
      const stored = this.getAllHands();
      const filtered = stored.filter(h => h.roomId !== roomId);
      
      // Converte BigInt para string antes de serializar
      const serializable = filtered.map(h => ({
        roomId: typeof h.roomId === 'bigint' ? h.roomId.toString() : h.roomId,
        playerAddress: h.playerAddress,
        hand: h.hand,
        salt: h.salt,
        commitment: h.commitment,
        timestamp: h.timestamp,
      }));
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
      console.log(`[LocalGameState] Cleared room ${roomId}`);
    } catch (e) {
      console.error('[LocalGameState] Failed to clear room:', e);
    }
  }

  /**
   * Busca todas as mãos salvas (remove expiradas)
   */
  private getAllHands(): LocalHand[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];

      const hands: StoredHand[] = JSON.parse(stored);
      const now = Date.now();

      // Filtra mãos expiradas e converte roomId de string para BigInt
      const valid = hands
        .filter(h => {
          const age = now - h.timestamp;
          return age < STORAGE_EXPIRY_MS;
        })
        .map(h => ({
          ...h,
          roomId: BigInt(h.roomId),
        }));

      // Se removeu alguma, salva de volta
      if (valid.length !== hands.length) {
        const serializable = valid.map(h => ({
          ...h,
          roomId: h.roomId.toString(),
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
      }

      return valid;
    } catch (e) {
      console.error('[LocalGameState] Failed to load hands:', e);
      return [];
    }
  }

  /**
   * Limpa todo o estado (útil para debug/reset)
   */
  clearAll(): void {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[LocalGameState] All hands cleared');
  }
}

// Singleton instance
export const localGameState = new LocalGameStateManager();
