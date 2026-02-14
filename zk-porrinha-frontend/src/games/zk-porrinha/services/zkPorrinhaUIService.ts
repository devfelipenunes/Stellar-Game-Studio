import { zkPorrinhaService } from '../zkPorrinhaService';
import type { Client as ZkPorrinhaClient } from '../bindings';
import { devWalletService } from '@/services/devWalletService';

let _actionLock = false;

export async function runAction(action: () => Promise<void>) {
  if (_actionLock) return;
  _actionLock = true;
  try {
    await action();
  } finally {
    _actionLock = false;
  }
}

export function logMessage(message: string) {
  const ts = new Date().toLocaleTimeString();
  return `[${ts}] ${message}`;
}

export async function createRoomAction(
  playerAddress: string,
  signer: Pick<any, 'signTransaction' | 'signAuthEntry'>,
  betAmount: bigint
): Promise<{ roomId: bigint; txHash: string } | null> {
  const result = await zkPorrinhaService.createRoom(playerAddress, signer, betAmount);
  return result;
}

export async function joinRoomAction(
  roomId: bigint,
  playerAddress: string,
  signer: Pick<any, 'signTransaction' | 'signAuthEntry'>
): Promise<{ success: boolean; txHash?: string; betAmount?: bigint }> {
  const result = await zkPorrinhaService.joinRoom(roomId, playerAddress, signer);
  return result;
}

export async function commitHandAction(
  roomId: bigint,
  playerAddress: string,
  signer: Pick<any, 'signTransaction' | 'signAuthEntry'>,
  hand: number,
  parity: number,
  totalGuess: number
): Promise<{ 
  success: boolean; 
  salt?: string; 
  txHash?: string; 
  autoResolved?: boolean; 
  resolveTxHash?: string;
  winner?: string;
  totalSum?: number;
}> {
  const result = await zkPorrinhaService.commitHandWithProof(roomId, playerAddress, signer, hand, parity, totalGuess);
  
  if (!result.success) {
    return result;
  }

  console.log('⏳ Waiting 1s before checking auto-resolve...');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const autoResolveResult = await zkPorrinhaService.tryAutoResolve(roomId, playerAddress, signer);
  
  if (autoResolveResult.autoResolved) {
    console.log('🎉 Game auto-resolved!');
    
    if (autoResolveResult.winner) {
      console.log('');
      console.log('═══════════════════════════════════');
      console.log('🏆 GAME RESULT 🏆');
      console.log('═══════════════════════════════════');
      console.log('Winner:', autoResolveResult.winner.substring(0, 12) + '...');
      console.log('Total Sum:', autoResolveResult.totalSum);
      console.log('═══════════════════════════════════');
      console.log('');
    }
    
    return {
      ...result,
      autoResolved: true,
      resolveTxHash: autoResolveResult.txHash,
      winner: autoResolveResult.winner,
      totalSum: autoResolveResult.totalSum,
    };
  }

  return {
    ...result,
    autoResolved: false,
  };
}

export async function revealAndResolveAction(
  roomId: bigint,
  playerAddress: string,
  signer: Pick<any, 'signTransaction' | 'signAuthEntry'>,
  mySecret: { hand: number; saltHex: string },
  otherSecret: { hand: number; saltHex: string }
): Promise<{ success: boolean; txHash?: string }>{
  const res = await zkPorrinhaService.resolveWithProof(roomId, playerAddress, signer, mySecret, otherSecret);
  return res;
}

export async function getRoomAction(roomId: bigint) {
  return await zkPorrinhaService.getRoom(roomId);
}

export async function listRecentRoomsAction(limit = 10) {
  return await zkPorrinhaService.listRecentRooms(limit);
}

export function determineRoomPhase(room: any): 'lobby' | 'commit' | 'settled' {
  if (!room) return 'lobby';
  const status = room.status as { tag: string };
  switch (status.tag) {
    case 'Lobby':
      return 'lobby';
    case 'Commit':
      return 'commit';
    case 'Settled':
      return 'settled';
    default:
      return 'lobby';
  }
}

export function formatXLM(stroops: bigint | number): string {
  return (Number(stroops) / 10000000).toFixed(1);
}

export function startNewGameState() {
  return {
    currentRoomId: null as bigint | null,
    currentRoom: null,
    roomPhase: 'lobby' as 'lobby' | 'commit' | 'settled',
    loading: false,
    error: null as string | null,
    success: null as string | null,
    betAmount: '1000000',
    selectedHand: 3,
    selectedParity: 1,
    savedSalt: '',
    committedValues: {} as Record<string, { hand: number; parity: number; salt: string }> ,
  };
}

export async function quickstartAction(betAmount: string) {
  const logs: string[] = [];
  function L(m: string) { logs.push(logMessage(m)); }

  try {
    L('Quickstart: starting');
    const originalPlayer = devWalletService.getCurrentPlayer();

    let player1Address = '';
    let player2Address = '';
    let player1Signer: any = null;
    let player2Signer: any = null;

    try {
      await devWalletService.initPlayer(1);
      player1Address = devWalletService.getPublicKey();
      player1Signer = devWalletService.getSigner();
      L(`Quickstart: player1 init ${player1Address}`);

      await devWalletService.initPlayer(2);
      player2Address = devWalletService.getPublicKey();
      player2Signer = devWalletService.getSigner();
      L(`Quickstart: player2 init ${player2Address}`);
    } finally {
      if (originalPlayer) {
        await devWalletService.initPlayer(originalPlayer);
      }
    }

    if (!player1Signer || !player2Signer) throw new Error('Failed to init dev signers');
    if (player1Address === player2Address) throw new Error('Quickstart requires two different dev wallets');

    L('Quickstart: player1 creating room');
    const res = await createRoomAction(player1Address, player1Signer, BigInt(betAmount));
    if (!res) throw new Error('Failed to create room');
    L(`Quickstart: created room ${res.roomId}`);

    await new Promise(r => setTimeout(r, 1000));

    L('Quickstart: player2 joining room');
    await joinRoomAction(res.roomId, player2Address, player2Signer);

    const updatedRoom = await getRoomAction(res.roomId);
    L('Quickstart: complete');
    return { success: true, logs, updatedRoom, roomId: res.roomId, txHash: res.txHash };
  } catch (e: any) {
    L(`Quickstart failed: ${e.message}`);
    return { success: false, logs, error: e.message };
  }
}

export async function handleCreateRoomAction(
  userAddress: string,
  signer: Pick<any, 'signTransaction' | 'signAuthEntry'>,
  betAmount: string
) {
  const logs: string[] = [];
  try {
    logs.push(logMessage('Creating room...'));
    const res = await createRoomAction(userAddress, signer, BigInt(betAmount));
    if (!res) throw new Error('createRoom returned null');
    logs.push(logMessage(`Room ${res.roomId} created (tx ${String(res.txHash).slice(0,8)}...)`));
    return { success: true, roomId: res.roomId, txHash: res.txHash, logs };
  } catch (e: any) {
    const msg = e?.message || String(e);
    logs.push(logMessage(`Create room failed: ${msg}`));
    return { success: false, error: msg, logs };
  }
}

export async function handleJoinRoomAction(
  roomId: bigint,
  userAddress: string,
  signer: Pick<any, 'signTransaction' | 'signAuthEntry'>
) {
  const logs: string[] = [];
  try {
    logs.push(logMessage(`Joining room ${roomId}...`));
    const res = await joinRoomAction(roomId, userAddress, signer);
    if (!res || !res.success) throw new Error('joinRoom failed');
    logs.push(logMessage(`Joined room ${roomId} (tx ${String(res.txHash).slice(0,8)}...)`));
    return { success: true, txHash: res.txHash, betAmount: res.betAmount, logs };
  } catch (e: any) {
    const msg = e?.message || String(e);
    logs.push(logMessage(`Join room failed: ${msg}`));
    return { success: false, error: msg, logs };
  }
}

export async function handleCommitAction(
  roomId: bigint,
  userAddress: string,
  signer: Pick<any, 'signTransaction' | 'signAuthEntry'>,
  hand: number,
  parity: number,
  totalGuess: number
) {
  const logs: string[] = [];
  try {
    logs.push(logMessage('Generating proof and submitting commitment...'));
    const res = await commitHandAction(roomId, userAddress, signer, hand, parity, totalGuess);
    if (!res || !res.success) throw new Error('commit failed');
    logs.push(logMessage(`Committed (tx ${String(res.txHash).slice(0,8)}...)`));
    
    if (res.autoResolved && res.winner) {
      logs.push(logMessage(`🏆 Auto-resolved! Winner: ${res.winner.slice(0, 8)}...`));
    }
    
    return { 
      success: true, 
      salt: res.salt, 
      txHash: res.txHash, 
      logs,
      autoResolved: res.autoResolved,
      resolveTxHash: res.resolveTxHash,
      winner: res.winner,
      totalSum: res.totalSum,
    };
  } catch (e: any) {
    const msg = e?.message || String(e);
    logs.push(logMessage(`Commit failed: ${msg}`));
    return { success: false, error: msg, logs };
  }
}

export async function handleQuickstartAction(betAmount: string) {
  const res = await quickstartAction(betAmount);
  return res;
}
