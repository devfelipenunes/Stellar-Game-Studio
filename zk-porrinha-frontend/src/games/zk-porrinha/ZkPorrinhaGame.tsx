import { useState, useEffect, useRef, useCallback } from 'react';
import React from 'react';
import { zkPorrinhaService } from './zkPorrinhaService';
import {
  listRecentRoomsAction,
  getRoomAction,
  determineRoomPhase,
  formatXLM as formatXLMService,
  runAction as runActionService,
  logMessage as logMessageService,
  handleCreateRoomAction,
  handleJoinRoomAction,
  handleCommitAction,
  revealAndResolveAction,
  handleQuickstartAction,
} from './services/zkPorrinhaUIService';
import RevealForm from './components/RevealForm';
import IntroScreen from './components/IntroScreen';
import { loadSecret } from './secrets';
import { useWallet } from '@/hooks/useWallet';
import { TransferQueue } from './TransferAnimation';
import type { Room } from './bindings';

interface ZkPorrinhaGameProps {
  userAddress: string;
  currentEpoch: number;
  availablePoints: bigint;
  onStandingsRefresh: () => void;
  onGameComplete: () => void;
}

type RoomPhase = 'lobby' | 'commit' | 'settled';

// ZK status log steps shown one-liner while proof is being generated
const ZK_LOG_STEPS = [
  '> Computing Poseidon commitment...',
  '> Building ZK circuit witness...',
  '> Generating ZK proof (~10s)...',
  '> Proof ready. Signing transaction...',
  '> Broadcasting to Stellar testnet...',
  '> Waiting for on-chain confirmation...',
  '> Verifying state on-chain...',
];

const STELLAR_EXPLORER = 'https://stellar.expert/explorer/testnet/tx/';

function TxLink({ hash }: { hash: string }) {
  return (
    <a
      href={`${STELLAR_EXPLORER}${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block mt-2 px-3 py-1 bg-[#0d1117] border-2 border-[#22c55e] text-[#22c55e] text-[12px] tracking-widest hover:bg-[#22c55e] hover:text-black transition-colors"
      style={{ fontFamily: "'Press Start 2P', monospace" }}
    >
      🔗 VIEW ON EXPLORER ›
    </a>
  );
}

export function ZkPorrinhaGame({
  userAddress,
  onGameComplete,
}: ZkPorrinhaGameProps) {
  const DEFAULT_BET = '1000000'; // 0.1 XLM in stroops
  const { getContractSigner, walletType } = useWallet();

  // Intro gate
  const [showIntro, setShowIntro] = useState(true);

  // State
  const [currentRoomId, setCurrentRoomId] = useState<bigint | null>(null);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [roomPhase, setRoomPhase] = useState<RoomPhase>('lobby');

  // ZK one-liner log
  const [zkLogStep, setZkLogStep] = useState<string>('');
  const zkLogIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Game inputs (hands 0-3 for real porrinha)
  const [betAmount] = useState(DEFAULT_BET);
  const [selectedHand, setSelectedHand] = useState<number>(0);
  const [selectedParity, setSelectedParity] = useState<number>(1); // 1=odd, 0=even
  const [selectedTotalGuess, setSelectedTotalGuess] = useState<number>(3); // 0-6 (max sum)
  const [savedSalt, setSavedSalt] = useState<string>('');
  const [committedValues, setCommittedValues] = useState<Record<string, { hand: number; parity: number; salt: string }>>({});

  // Quickstart
  const quickstartAvailable = walletType === 'dev';
  const [quickstartRunning, setQuickstartRunning] = useState<boolean>(false);
  const quickstartRunningRef = useRef<boolean>(false);
  const quickstartButtonRef = useRef<HTMLButtonElement | null>(null);

  // TX feedback + winner
  const [lastTxHash, setLastTxHash] = useState<string | undefined>(undefined);
  const [commitTxHash, setCommitTxHash] = useState<string | undefined>(undefined);
  const [zkProofLog, setZkProofLog] = useState<string[]>([]);
  const [gameWinner, setGameWinner] = useState<string | undefined>(undefined);
  const [gameWinAmount, setGameWinAmount] = useState<bigint | undefined>(undefined);
  const [roomPot, setRoomPot] = useState<bigint | null>(null);
  const [jackpot, setJackpot] = useState<bigint | null>(null);

  // Lobby room list
  const [lobbyRooms, setLobbyRooms] = useState<Array<{ id: bigint; room: Room | null }>>([]);
  const [lobbyLoading, setLobbyLoading] = useState(false);

  // Search room by ID
  const [searchRoomId, setSearchRoomId] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<{ id: bigint; room: Room } | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Settled room viewer (click on settled room in lobby to inspect)
  const [viewingSettled, setViewingSettled] = useState<{ id: bigint; room: Room } | null>(null);

  const formatXLM = (stroops: bigint | number): string => formatXLMService(stroops);

  // Start/stop ZK log animation
  const startZkLog = useCallback(() => {
    let i = 0;
    setZkLogStep(ZK_LOG_STEPS[0]);
    zkLogIntervalRef.current = setInterval(() => {
      i = (i + 1) % ZK_LOG_STEPS.length;
      setZkLogStep(ZK_LOG_STEPS[i]);
    }, 1800);
  }, []);

  const stopZkLog = useCallback((finalMsg = '') => {
    if (zkLogIntervalRef.current) clearInterval(zkLogIntervalRef.current);
    setZkLogStep(finalMsg);
  }, []);

  useEffect(() => () => { if (zkLogIntervalRef.current) clearInterval(zkLogIntervalRef.current); }, []);

  const refreshRoom = async () => {
    try {
      if (!currentRoomId) return;
      const room = await getRoomAction(currentRoomId);
      setCurrentRoom(room);
      setRoomPhase(determineRoomPhase(room));
      const pot = await zkPorrinhaService.getRoomPot(currentRoomId);
      setRoomPot(pot);
      const jk = await zkPorrinhaService.getJackpot();
      setJackpot(jk);
    } catch (e) {
      console.error('refreshRoom failed', e);
    }
  };

  const refreshLobby = async () => {
    setLobbyLoading(true);
    try {
      const rooms = await listRecentRoomsAction(20);
      setLobbyRooms(rooms);
      // Also refresh jackpot display
      const jk = await zkPorrinhaService.getJackpot();
      setJackpot(jk);
    } catch (e) {
      console.error('refreshLobby failed', e);
    } finally {
      setLobbyLoading(false);
    }
  };

  // Auto-refresh lobby on mount and when returning to lobby
  useEffect(() => {
    if (roomPhase === 'lobby' && !currentRoom && !showIntro) {
      refreshLobby();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomPhase, currentRoom, showIntro]);

  const handleJoinRoom = async (roomId: bigint) => {
    await runActionService(async () => {
      setLoading(true);
      setError(null);
      setSuccess(null);
      try {
        const signer = await getContractSigner();
        if (!signer) throw new Error('No signer available');
        const res = await handleJoinRoomAction(roomId, userAddress, signer);
        if (res.success) {
          const room = await getRoomAction(roomId);
          setCurrentRoomId(roomId);
          setCurrentRoom(room);
          setRoomPhase(determineRoomPhase(room!));
          setSuccess(`Joined room #${roomId}! Now commit your hand.`);
        } else {
          setError(res.error || 'Failed to join room');
        }
      } catch (e: any) {
        setError(e.message || 'Failed to join room');
      } finally {
        setLoading(false);
      }
    });
  };

  const handleCreateRoom = async () => {
    await runActionService(async () => {
      setLoading(true);
      setError(null);
      setSuccess(null);
      try {
        const signer = await getContractSigner();
        if (!signer) throw new Error('No signer available');
        const res = await handleCreateRoomAction(userAddress, signer, betAmount);
        if (res.success && res.roomId !== undefined) {
          const room = await getRoomAction(res.roomId);
          setCurrentRoomId(res.roomId);
          setCurrentRoom(room);
          setRoomPhase(determineRoomPhase(room!));
          setSuccess(`Room #${res.roomId} created! Waiting for opponent...`);
        } else {
          setError(res.error || 'Failed to create room');
        }
      } catch (e: any) {
        setError(e.message || 'Failed to create room');
      } finally {
        setLoading(false);
      }
    });
  };

  const handleStartNewGame = () => {
    if (currentRoom && roomPhase === 'settled') onGameComplete();
    setCurrentRoomId(null);
    setCurrentRoom(null);
    setRoomPhase('lobby');
    setLoading(false);
    setError(null);
    setSuccess(null);
    setLastTxHash(undefined);
    setCommitTxHash(undefined);
    setZkProofLog([]);
    setGameWinner(undefined);
    setGameWinAmount(undefined);
    setSelectedHand(0);
    setSelectedParity(1);
    setSavedSalt('');
    setCommittedValues({});
    setZkLogStep('');
    setSearchRoomId('');
    setSearchResult(null);
    setSearchError(null);
    setViewingSettled(null);
  };

  const handleSearchRoom = async () => {
    const idStr = searchRoomId.trim();
    if (!idStr || isNaN(Number(idStr))) {
      setSearchError('Enter a valid room number');
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    setSearchResult(null);
    setViewingSettled(null);
    try {
      const roomId = BigInt(idStr);
      const res = await getRoomAction(roomId);
      if (res) {
        const tag = (res.status as any).tag;
        if (tag === 'Settled') {
          setViewingSettled({ id: roomId, room: res });
        } else {
          setSearchResult({ id: roomId, room: res });
        }
      } else {
        setSearchError(`Room #${idStr} not found`);
      }
    } catch {
      setSearchError(`Room #${idStr} not found`);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!currentRoomId) return;
    await runActionService(async () => {
      setLoading(true);
      setError(null);
      setSuccess(null);
      startZkLog();
      try {
        const signer = await getContractSigner();
        if (!signer) throw new Error('No signer available');
        const res = await handleCommitAction(currentRoomId, userAddress, signer, selectedHand, selectedParity, selectedTotalGuess);
        if (res.success) {
          const saltValue = res.salt!;
          setSavedSalt(saltValue);
          setCommittedValues(prev => ({
            ...prev,
            [currentRoomId.toString()]: { hand: selectedHand, parity: selectedParity, salt: saltValue },
          }));
          if (res.autoResolved && res.winner) {
            setGameWinner(res.winner);
            if (currentRoom?.bet_amount) setGameWinAmount(BigInt(currentRoom.bet_amount) * 2n);
            if (res.resolveTxHash) setLastTxHash(res.resolveTxHash);
            stopZkLog(`> Game auto-resolved! TX: ${res.resolveTxHash?.slice(0, 12) ?? ''}... 🏆`);
            setSuccess('🏆 Game auto-resolved!');
          } else {
            const shortSalt = saltValue.replace('0x', '').slice(0, 12);
            const shortTx = res.txHash?.slice(0, 14) ?? '';
            if (res.txHash) setCommitTxHash(res.txHash);
            setZkProofLog([
              `> Poseidon commitment built`,
              `> Commitment hash: 0x${shortSalt}...`,
              `> ZK proof generated & verified`,
              `> TX broadcast to Stellar testnet`,
              `> TX hash: ${shortTx}...`,
              `> State updated on-chain ✓`,
            ]);
            stopZkLog(`> Committed [0x${shortSalt}...] · TX: ${shortTx}... ✓`);
            setSuccess('Hand committed with ZK proof!');
          }
          await refreshRoom();
        } else {
          stopZkLog('> Error during commit.');
          setError(res.error || 'Failed to commit hand');
        }
      } catch (e: any) {
        stopZkLog('> Error: ' + (e?.message || String(e)));
        setError(e.message || 'Failed to commit hand');
      } finally {
        setLoading(false);
      }
    });
  };

  const handleResolve = async (otherHand: number, otherSaltHex: string) => {
    if (!currentRoomId) return;
    await runActionService(async () => {
      setLoading(true);
      startZkLog();
      try {
        const signer = await getContractSigner();
        if (!signer) throw new Error('No signer');
        const mySecret = loadSecret(currentRoomId, userAddress);
        if (!mySecret) throw new Error('Secret not found. You must commit from this browser/session.');
        const res = await revealAndResolveAction(currentRoomId, userAddress, signer, mySecret, { hand: otherHand, saltHex: otherSaltHex });
        if (res.success) {
          stopZkLog('> Round resolved on-chain. ✓');
          if (res.txHash) setLastTxHash(res.txHash);
          await refreshRoom();
        } else {
          stopZkLog('> Resolve failed.');
          setError('Resolve failed');
        }
      } catch (e: any) {
        stopZkLog('> Error: ' + (e?.message || String(e)));
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    });
  };

  const handleQuickstart = async () => {
    if (!quickstartAvailable || quickstartRunningRef.current) return;
    if (quickstartButtonRef.current) quickstartButtonRef.current.disabled = true;
    quickstartRunningRef.current = true;
    setQuickstartRunning(true);
    await runActionService(async () => {
      setLoading(true);
      setError(null);
      setSuccess(null);
      startZkLog();
      try {
        const res = await handleQuickstartAction(betAmount);
        if (res.success) {
          if (res.updatedRoom) {
            setCurrentRoom(res.updatedRoom);
            setCurrentRoomId(res.roomId);
            setRoomPhase(determineRoomPhase(res.updatedRoom));
          }
          stopZkLog('> Both players are in. ✓');
          setSuccess('Quickstart done! Both players joined. Now commit your hands.');
        } else {
          stopZkLog('> Quickstart failed.');
          setError(res.error || 'Quickstart failed');
        }
      } catch (e: any) {
        stopZkLog('> Error: ' + (e?.message || String(e)));
        setError(`Quickstart failed: ${e.message}`);
      } finally {
        setLoading(false);
        quickstartRunningRef.current = false;
        setQuickstartRunning(false);
        if (quickstartButtonRef.current) quickstartButtonRef.current.disabled = false;
      }
    });
  };

  const isPlayer1 = currentRoom?.player1.address === userAddress;
  const isPlayer2 = currentRoom?.player2?.address === userAddress;
  const isPlayer = isPlayer1 || isPlayer2;
  const hasCommitted = isPlayer1 ? currentRoom?.player1.has_committed : currentRoom?.player2?.has_committed;

  // ── Intro gate ──────────────────────────────────────────────────────────────
  if (showIntro) {
    return <IntroScreen onEnter={() => setShowIntro(false)} />;
  }

  // ── Pixel font style ─────────────────────────────────────────────────────────
  const px: React.CSSProperties = { fontFamily: "'Press Start 2P', monospace" };

  return (
    <div style={{ background: '#A0522D', minHeight: '100vh', ...px }}>

      {/* ── HEADER ── */}
      <div className="bg-[#1a0a00] border-b-4 border-black px-4 py-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[#fbbf24] text-[13px] tracking-widest" style={{ textShadow: '2px 2px 0 #000' }}>
              🍺 BAR DO ADRIANO
            </div>
            <div className="text-[#9ca3af] text-[12px] tracking-widest mt-0.5">
              LAPA · RIO DE JANEIRO · ON-CHAIN
            </div>
            <div className="text-[#374151] text-[11px] mt-0.5 font-mono">
              CONTRACT: {zkPorrinhaService.getContractId().slice(0,8)}...
            </div>
          </div>
          <div className="flex gap-2 text-[13px]">
            <div className="bg-[#111] border-2 border-[#fbbf24] px-2 py-1 text-white text-center">
              <div className="text-[12px] text-[#9ca3af]">MESA</div>
              <span className="text-[#fbbf24]">{roomPot != null ? formatXLM(roomPot) : '—'}</span>
              <span className="text-[#9ca3af] text-[12px]"> XLM</span>
            </div>
            <div className="bg-[#1a0000] border-2 border-[#ef4444] px-2 py-1 text-white text-center" style={{ boxShadow: jackpot ? '0 0 8px #ef4444' : 'none' }}>
              <div className="text-[12px] text-[#9ca3af]">JACKPOT</div>
              <span className="text-[#ef4444]">{jackpot != null ? formatXLM(jackpot) : '—'}</span>
              <span className="text-[#9ca3af] text-[12px]"> XLM</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── ZK LOG (one-liner) ── */}
      {zkLogStep && (
        <div className="bg-[#0d0d0d] border-b-2 border-[#22c55e] px-4 py-2 text-[#22c55e] text-[14px] tracking-wider truncate">
          {zkLogStep}
          <span className="animate-pulse ml-1">▋</span>
        </div>
      )}

      {/* ── ERROR / SUCCESS banners ── */}
      {error && (
        <div className="bg-[#7f1d1d] border-2 border-[#ef4444] mx-4 mt-3 px-3 py-2 text-[#fca5a5] text-[14px]">
          ✗ {error}
        </div>
      )}
      {success && !error && (
        <div className="bg-[#064e3b] border-2 border-[#22c55e] mx-4 mt-3 px-3 py-2 text-[#6ee7b7] text-[14px]">
          ✓ {success}
        </div>
      )}
      {lastTxHash && (
        <div className="mx-4 mt-1 text-center">
          <TxLink hash={lastTxHash} />
        </div>
      )}

      <div className="p-4 pb-8">

        {/* ── LOBBY: no room ── */}
        {roomPhase === 'lobby' && !currentRoom && (
          <div className="mt-4">

            {/* Tagline */}
            <div className="text-center mb-5">
              <div className="text-[#fde68a] text-[12px] tracking-widest">🌊 WELCOME TO BAR DO ADRIANO 🌊</div>
              <div className="text-[#9ca3af] text-[13px] mt-1">The most trustless bar in Lapa, Rio de Janeiro</div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={handleCreateRoom}
                disabled={loading}
                className="flex-1 bg-[#22c55e] border-4 border-black text-black font-bold py-3 text-[14px] tracking-widest shadow-[4px_4px_0_#000] disabled:opacity-50"
              >
                {loading ? '⏳...' : '🍺 OPEN TABLE'}
              </button>
              <button
                onClick={refreshLobby}
                disabled={lobbyLoading}
                className="bg-[#374151] border-4 border-black text-white py-3 px-3 text-[14px] tracking-widest shadow-[4px_4px_0_#000] disabled:opacity-50"
              >
                {lobbyLoading ? '⏳' : '🔄'}
              </button>
            </div>

            {/* Search room by ID */}
            <div className="mb-4 bg-[#111827] border-4 border-[#3b82f6] p-3">
              <div className="text-[#3b82f6] text-[13px] tracking-widest mb-2">🔍 JOIN BY TABLE ID</div>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  value={searchRoomId}
                  onChange={e => { setSearchRoomId(e.target.value); setSearchError(null); setSearchResult(null); setViewingSettled(null); }}
                  onKeyDown={e => e.key === 'Enter' && handleSearchRoom()}
                  placeholder="Room #"
                  className="flex-1 bg-black border-2 border-[#374151] text-white px-3 py-2 text-[14px] outline-none focus:border-[#3b82f6]"
                  style={{ fontFamily: "'Press Start 2P', monospace" }}
                />
                <button
                  onClick={handleSearchRoom}
                  disabled={searchLoading || !searchRoomId.trim()}
                  className="bg-[#3b82f6] border-2 border-black text-white font-bold px-4 py-2 text-[14px] tracking-widest shadow-[3px_3px_0_#000] disabled:opacity-40"
                >
                  {searchLoading ? '⏳' : 'GO'}
                </button>
              </div>
              {searchError && (
                <div className="text-[#ef4444] text-[13px] mt-2">{searchError}</div>
              )}
              {/* Search result: open/commit room */}
              {searchResult && (() => {
                const tag = (searchResult.room.status as any).tag;
                const r = searchResult.room;
                const isYours = r.player1.address === userAddress || r.player2?.address === userAddress;
                const canJoin = tag === 'Lobby' && !r.has_player2 && r.player1.address !== userAddress;
                return (
                  <div className="mt-3 bg-[#0d1117] border-2 border-[#3b82f6] p-3">
                    <div className="text-[#3b82f6] text-[13px] tracking-widest mb-1">TABLE #{searchResult.id.toString()}</div>
                    <div className="text-[#9ca3af] text-[13px]">Status: <span className="text-white">{tag}</span></div>
                    <div className="text-[#9ca3af] text-[13px]">Bet: <span className="text-[#fbbf24]">{formatXLM(r.bet_amount)} XLM</span></div>
                    <div className="text-[#9ca3af] text-[13px]">Host: {r.player1.address.slice(0,8)}...</div>
                    <div className="flex gap-2 mt-2">
                      {canJoin && (
                        <button onClick={() => handleJoinRoom(searchResult.id)} disabled={loading}
                          className="flex-1 bg-[#22c55e] border-2 border-black text-black font-bold py-2 text-[13px] tracking-widest shadow-[3px_3px_0_#000] disabled:opacity-40">
                          JOIN TABLE
                        </button>
                      )}
                      {isYours && tag === 'Commit' && (
                        <button onClick={() => { setCurrentRoomId(searchResult.id); setCurrentRoom(searchResult.room); setRoomPhase('commit'); }}
                          className="flex-1 bg-[#3b82f6] border-2 border-black text-white font-bold py-2 text-[13px] tracking-widest shadow-[3px_3px_0_#000]">
                          REJOIN
                        </button>
                      )}
                      {!canJoin && !isYours && tag !== 'Settled' && (
                        <div className="text-[#9ca3af] text-[13px] mt-1">Game in progress</div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Settled room viewer (from search or lobby click) */}
            {viewingSettled && (() => {
              const r = viewingSettled.room;
              const iWon = r.winner === userAddress;
              const isDraw = !r.winner;
              return (
                <div className="mb-4 bg-[#0d0d0d] border-4 border-[#9ca3af] p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[#9ca3af] text-[13px] tracking-widest">📜 TABLE #{viewingSettled.id.toString()} — SETTLED</div>
                    <button onClick={() => setViewingSettled(null)}
                      className="text-[#9ca3af] text-[13px] border border-[#374151] px-2 py-1">✕</button>
                  </div>
                  <div className="space-y-2 text-[13px]">
                    <div className="flex justify-between">
                      <span className="text-[#9ca3af]">WINNER:</span>
                      <span className={isDraw ? 'text-[#fbbf24]' : iWon ? 'text-[#22c55e]' : 'text-[#ef4444]'}>
                        {isDraw ? '🤝 TIE' : iWon ? '👑 YOU' : `${r.winner!.slice(0,8)}...`}
                      </span>
                    </div>
                    {r.total_sum !== undefined && r.total_sum !== null && (
                      <div className="flex justify-between">
                        <span className="text-[#9ca3af]">TOTAL FINGERS:</span>
                        <span className="text-[#fbbf24]">{r.total_sum} ({r.total_sum % 2 === 0 ? 'EVEN' : 'ODD'})</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-[#9ca3af]">BET:</span>
                      <span className="text-white">{formatXLM(r.bet_amount)} XLM each</span>
                    </div>
                    <div className="border-t border-[#374151] pt-2 mt-2">
                      <div className="text-[#6b7280] text-[12px] mb-1">PLAYERS:</div>
                      <div className="text-[#9ca3af] text-[12px]">P1: {r.player1.address.slice(0,10)}... · {r.player1.parity_guess === 1 ? 'ODD' : 'EVEN'} · exact={r.player1.exact_sum_guess}</div>
                      {r.has_player2 && (
                        <div className="text-[#9ca3af] text-[12px]">P2: {r.player2.address.slice(0,10)}... · {r.player2.parity_guess === 1 ? 'ODD' : 'EVEN'} · exact={r.player2.exact_sum_guess}</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {quickstartAvailable && (
              <div className="bg-[#111827] border-4 border-[#fbbf24] p-3 mb-4">
                <div className="text-[#fbbf24] text-[14px] mb-1 tracking-widest">⚡ DEV QUICKSTART</div>
                <div className="text-[#9ca3af] text-[13px] mb-3">Two dev wallets. Instant game. Local only.</div>
                <button
                  ref={quickstartButtonRef}
                  disabled={!quickstartAvailable || quickstartRunning || loading}
                  onClick={handleQuickstart}
                  className="w-full bg-[#fbbf24] border-4 border-black text-black font-bold py-2 text-[14px] tracking-widest shadow-[4px_4px_0_#000] disabled:opacity-50"
                >
                  {quickstartRunning ? '⏳ SETTING UP...' : '🃏 QUICKSTART'}
                </button>
              </div>
            )}

            {/* Room list */}
            <div className="mt-2">
              <div className="text-[#fde68a] text-[13px] tracking-widest mb-2 flex items-center justify-between">
                <span>🏓 ACTIVE TABLES</span>
                <span className="text-[#9ca3af]">{lobbyRooms.filter(r => r.room?.status && (r.room.status as any).tag === 'Lobby' && !r.room.has_player2).length} open</span>
              </div>

              {lobbyLoading && (
                <div className="text-center text-[#9ca3af] text-[13px] py-4">⏳ Loading tables...</div>
              )}

              {!lobbyLoading && lobbyRooms.length === 0 && (
                <div className="bg-[#111827] border-2 border-[#374151] p-4 text-center">
                  <div className="text-[#9ca3af] text-[13px]">No tables open right now.</div>
                  <div className="text-[#9ca3af] text-[13px] mt-1">Be the first! Open a table 🍺</div>
                </div>
              )}

              {/* Open rooms (Lobby + no player2) */}
              {lobbyRooms.filter(r => r.room && (r.room.status as any).tag === 'Lobby' && !r.room.has_player2).map(({ id, room }) => (
                <div key={id.toString()} className="bg-[#1a2e1a] border-2 border-[#22c55e] p-3 mb-2 flex items-center justify-between">
                  <div>
                    <div className="text-[#22c55e] text-[14px] tracking-widest">TABLE #{id.toString()}</div>
                    <div className="text-[#9ca3af] text-[13px] mt-0.5">
                      Host: {room!.player1.address.slice(0,6)}... · Bet: {formatXLM(room!.bet_amount)} XLM
                    </div>
                    <div className="text-[#fbbf24] text-[13px]">⏳ Waiting for challenger...</div>
                  </div>
                  <button
                    onClick={() => handleJoinRoom(id)}
                    disabled={loading || room!.player1.address === userAddress}
                    className="bg-[#22c55e] border-2 border-black text-black font-bold px-3 py-2 text-[13px] tracking-widest shadow-[3px_3px_0_#000] disabled:opacity-40"
                  >
                    {room!.player1.address === userAddress ? 'YOURS' : 'JOIN'}
                  </button>
                </div>
              ))}

              {/* Commit-phase rooms */}
              {lobbyRooms.filter(r => r.room && (r.room.status as any).tag === 'Commit').map(({ id, room }) => {
                const isMyRoom = room!.player1.address === userAddress || room!.player2.address === userAddress;
                return (
                  <div key={id.toString()} className="bg-[#1a1a2e] border-2 border-[#3b82f6] p-3 mb-2 flex items-center justify-between">
                    <div>
                      <div className="text-[#3b82f6] text-[14px] tracking-widest">TABLE #{id.toString()}</div>
                      <div className="text-[#9ca3af] text-[13px] mt-0.5">
                        Full · Bet: {formatXLM(room!.bet_amount)} XLM
                      </div>
                      <div className="text-[#60a5fa] text-[13px]">🔒 Committing hands...</div>
                    </div>
                    {isMyRoom && (
                      <button
                        onClick={() => {
                          setCurrentRoomId(id);
                          setCurrentRoom(room);
                          setRoomPhase('commit');
                        }}
                        className="bg-[#3b82f6] border-2 border-black text-white font-bold px-3 py-2 text-[13px] tracking-widest shadow-[3px_3px_0_#000]"
                      >
                        REJOIN
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Settled rooms history */}
              {lobbyRooms.filter(r => r.room && (r.room.status as any).tag === 'Settled').length > 0 && (
                <div className="mt-4">
                  <div className="text-[#9ca3af] text-[13px] tracking-widest mb-2">📜 RECENT RESULTS</div>
                  {lobbyRooms.filter(r => r.room && (r.room.status as any).tag === 'Settled').slice(0,5).map(({ id, room }) => {
                    const winnerShort = room!.winner ? `${room!.winner.slice(0,6)}...` : 'TIE';
                    const iWon = room!.winner === userAddress;
                    const isExpanded = viewingSettled?.id === id;
                    return (
                      <div key={id.toString()}>
                        <div
                          className="bg-[#0d0d0d] border border-[#374151] p-2 mb-1 flex items-center justify-between cursor-pointer hover:border-[#9ca3af] transition-colors"
                          onClick={() => setViewingSettled(isExpanded ? null : { id, room: room! })}
                        >
                          <div className="text-[#9ca3af] text-[13px]">#{id.toString()} · {formatXLM(room!.bet_amount)} XLM</div>
                          <div className={`text-[13px] font-bold ${iWon ? 'text-[#22c55e]' : 'text-[#9ca3af]'}`}>
                            {iWon ? '🏆 YOU WON' : `🏆 ${winnerShort}`}
                            {room!.total_sum !== null && room!.total_sum !== undefined && (
                              <span className="text-[#6b7280] ml-1">sum={room!.total_sum}</span>
                            )}
                            <span className="text-[#374151] ml-2">{isExpanded ? '▲' : '▼'}</span>
                          </div>
                        </div>
                        {isExpanded && (() => {
                          const r = room!;
                          const iWonThis = r.winner === userAddress;
                          const isDraw = !r.winner;
                          return (
                            <div className="bg-[#111827] border border-[#9ca3af] border-t-0 p-3 mb-1 text-[13px] space-y-1">
                              <div className="flex justify-between">
                                <span className="text-[#9ca3af]">WINNER:</span>
                                <span className={isDraw ? 'text-[#fbbf24]' : iWonThis ? 'text-[#22c55e]' : 'text-[#ef4444]'}>
                                  {isDraw ? '🤝 TIE' : iWonThis ? '👑 YOU' : `${r.winner!.slice(0,8)}...`}
                                </span>
                              </div>
                              {r.total_sum !== undefined && r.total_sum !== null && (
                                <div className="flex justify-between">
                                  <span className="text-[#9ca3af]">TOTAL FINGERS:</span>
                                  <span className="text-[#fbbf24]">{r.total_sum} ({r.total_sum % 2 === 0 ? 'EVEN' : 'ODD'})</span>
                                </div>
                              )}
                              <div className="text-[#6b7280] text-[12px] pt-1">P1: {r.player1.address.slice(0,10)}... · {r.player1.parity_guess === 1 ? 'ODD' : 'EVEN'} · exact={r.player1.exact_sum_guess}</div>
                              {r.has_player2 && <div className="text-[#6b7280] text-[12px]">P2: {r.player2.address.slice(0,10)}... · {r.player2.parity_guess === 1 ? 'ODD' : 'EVEN'} · exact={r.player2.exact_sum_guess}</div>}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── LOBBY: waiting for player 2 ── */}
        {roomPhase === 'lobby' && currentRoom && !currentRoom.has_player2 && (
          <div className="mt-4 text-center">
            <div className="text-5xl mb-3">🌊</div>
            <div className="text-[#fde68a] text-[13px] tracking-widest mb-1">TABLE OPEN!</div>
            <div className="text-[#fde68a] text-[14px] tracking-widest mb-3">WAITING FOR CHALLENGER</div>
            <div className="bg-[#111827] border-2 border-[#374151] p-3 mb-4 text-[13px]">
              <div className="text-[#9ca3af]">Share this Table ID with your challenger:</div>
              <div className="text-[#fbbf24] text-[14px] mt-1">#{currentRoomId?.toString()}</div>
              <div className="text-[#9ca3af] mt-1">Bet: {currentRoom.bet_amount ? formatXLM(currentRoom.bet_amount) : '—'} XLM</div>
            </div>
            <div className="text-[#9ca3af] text-[13px] mb-4 italic">
              Waiting for someone brave enough to sit down...<br/>
              Share the table ID and let the game begin!
            </div>
            <button
              onClick={handleStartNewGame}
              className="px-4 py-2 bg-[#374151] border-4 border-black text-white text-[14px] tracking-widest shadow-[4px_4px_0_#000]"
            >
              ← BACK TO LOBBY
            </button>
          </div>
        )}

        {/* ── COMMIT PHASE ── */}
        {roomPhase === 'commit' && currentRoom && isPlayer && !hasCommitted && (
          <div className="mt-2">
            {/* Back + flavor header */}
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={handleStartNewGame}
                className="px-3 py-2 bg-[#374151] border-2 border-black text-white text-[13px] tracking-widest shadow-[2px_2px_0_#000]"
              >
                ← LOBBY
              </button>
              <div className="text-center">
                <div className="text-[#fde68a] text-[14px] tracking-widest">🎲 PORRINHA!</div>
                <div className="text-[#9ca3af] text-[13px] mt-0.5">The blockchain never lies.</div>
              </div>
              <div className="text-[#9ca3af] text-[13px]">#{currentRoomId?.toString()}</div>
            </div>

            {/* Fingers 0-3 */}
            <div className="text-[#fde68a] text-[14px] tracking-widest mb-3 text-center">
              HOW MANY FINGERS? (0–3):
            </div>
            <div className="grid grid-cols-4 gap-3 mb-5">
              {[0, 1, 2, 3].map(num => (
                <button
                  key={num}
                  onClick={() => setSelectedHand(num)}
                  className={
                    'aspect-square border-4 border-black flex items-center justify-center text-2xl font-bold ' +
                    (selectedHand === num
                      ? 'bg-[#fbbf24] text-black shadow-[4px_4px_0_#000]'
                      : 'bg-[#E3C099] text-black')
                  }
                >
                  {num}
                </button>
              ))}
            </div>

            {/* Parity */}
            <div className="text-[#fde68a] text-[14px] tracking-widest mb-2 text-center">
              PARITY GUESS:
            </div>
            <div className="flex gap-3 mb-5">
              {[{ label: '🎲 ODD', val: 1 }, { label: '✌️ EVEN', val: 0 }].map(({ label, val }) => (
                <button
                  key={val}
                  onClick={() => setSelectedParity(val)}
                  className={
                    'flex-1 border-4 border-black py-3 text-[14px] font-bold tracking-widest ' +
                    (selectedParity === val ? 'bg-[#fbbf24] text-black shadow-[4px_4px_0_#000]' : 'bg-[#E3C099] text-black')
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Total guess (0-6 max sum for 2 players with 0-3 each) */}
            <div className="text-[#fde68a] text-[14px] tracking-widest mb-1 text-center">
              EXACT SUM GUESS (0–6):
            </div>
            <div className="text-[#9ca3af] text-[13px] text-center mb-2">Nail the exact total and win the jackpot! 💰</div>
            <div className="grid grid-cols-7 gap-1 mb-5">
              {[0, 1, 2, 3, 4, 5, 6].map(num => (
                <button
                  key={num}
                  onClick={() => setSelectedTotalGuess(num)}
                  className={
                    'aspect-square border-4 border-black flex items-center justify-center font-bold text-sm ' +
                    (selectedTotalGuess === num ? 'bg-[#10b981] text-white shadow-[4px_4px_0_#065f46]' : 'bg-[#E3C099] text-black')
                  }
                >
                  {num}
                </button>
              ))}
            </div>

            {/* COMMIT button */}
            <button
              onClick={handleCommit}
              disabled={loading}
              className="w-full bg-[#22c55e] border-4 border-black text-black font-bold py-4 text-sm tracking-widest shadow-[6px_6px_0_#000] disabled:opacity-50"
            >
              {loading ? '⏳ GENERATING ZK PROOF...' : '🔒 LOCK IT IN! (Commit)'}
            </button>
          </div>
        )}

        {/* ── COMMIT PHASE: already committed ── */}
        {roomPhase === 'commit' && currentRoom && isPlayer && hasCommitted && (
          <div className="mt-8 text-center">
            <div className="text-4xl mb-3">🤫</div>
            <div className="text-[#22c55e] text-[13px] tracking-widest mb-1">HAND COMMITTED!</div>
            <div className="text-[#6ee7b7] text-[14px] mb-1">SEALED ON-CHAIN ✓</div>
            <div className="text-[#9ca3af] text-[14px] mb-4">Waiting for opponent to commit...</div>

            {/* ZK Proof log detalhado */}
            {zkProofLog.length > 0 && (
              <div className="mx-auto max-w-xs border-2 border-[#22c55e] bg-black text-left p-3 mb-4"
                style={{ fontFamily: "'Press Start 2P', monospace" }}>
                <div className="text-[#22c55e] text-[13px] mb-2 tracking-widest">⬡ ZK PROOF LOG</div>
                {zkProofLog.map((line, i) => (
                  <div key={i} className="text-[#86efac] text-[12px] leading-5">{line}</div>
                ))}
              </div>
            )}

            {/* TX link */}
            {commitTxHash && <TxLink hash={commitTxHash} />}

            <button
              onClick={handleStartNewGame}
              className="mt-4 px-4 py-2 bg-[#374151] border-4 border-black text-white text-[14px] tracking-widest shadow-[4px_4px_0_#000]"
            >
              ← BACK TO LOBBY
            </button>
          </div>
        )}

        {/* ── BOTH COMMITTED: reveal/resolve ── */}
        {roomPhase === 'commit' && currentRoom && currentRoom.player1.has_committed && currentRoom.player2?.has_committed && (
          <div className="mt-4">
            <RevealForm
              roomId={currentRoomId}
              myAddress={userAddress}
              mySecretAvailable={!!loadSecret(currentRoomId!, userAddress)}
              onResolve={handleResolve}
            />
          </div>
        )}

        {/* ── SETTLED ── */}
        {roomPhase === 'settled' && currentRoom && (() => {
          const winner = currentRoom.winner;
          const iWon = winner === userAddress;
          const isDraw = !winner;
          const winnerShort = winner ? `${winner.slice(0, 8)}...${winner.slice(-4)}` : null;
          const totalSumVal = currentRoom.total_sum;
          const totalPot = BigInt(currentRoom.bet_amount) * 2n;
          // 80% goes to parity winner, 20% accumulates in jackpot
          const parityPrize = (totalPot * 80n) / 100n;
          const jackpotContribution = totalPot - parityPrize; // 20%

          // Jackpot check: did either player guess the exact sum correctly?
          const p1HitJackpot = totalSumVal !== undefined && totalSumVal !== null && currentRoom.player1.exact_sum_guess === totalSumVal;
          const p2HitJackpot = totalSumVal !== undefined && totalSumVal !== null && currentRoom.player2?.exact_sum_guess === totalSumVal;
          const jackpotHit = p1HitJackpot || p2HitJackpot;
          const iHitJackpot = (isPlayer1 && p1HitJackpot) || (isPlayer2 && p2HitJackpot);

          return (
            <div className="mt-4 text-center">

              {/* 🎰 JACKPOT BANNER — shown only to the player who hit the exact sum */}
              {iHitJackpot && (
                <div className="mb-4 border-4 border-[#fbbf24] bg-[#1a1000] p-4 animate-pulse"
                  style={{ boxShadow: '0 0 24px #fbbf24, 0 0 48px #f59e0b' }}>
                  <div className="text-5xl mb-2">🎰</div>
                  <div className="text-[#fbbf24] text-[16px] tracking-widest"
                    style={{ textShadow: '4px 4px 0 #000, 0 0 30px #fbbf24' }}>
                    JACKPOT HIT!
                  </div>
                  <div className="text-[#fde68a] text-[14px] mt-2">
                    🏆 You nailed the exact sum and won the accumulated jackpot!
                  </div>
                  <div className="text-[#fbbf24] text-[13px] mt-1">
                    EXACT SUM: {totalSumVal}
                  </div>
                </div>
              )}
              {/* Opponent hit jackpot — notify this player they missed it */}
              {!iHitJackpot && jackpotHit && (
                <div className="mb-4 border-2 border-[#6b7280] bg-[#111] p-3 text-center">
                  <div className="text-2xl mb-1">🎰</div>
                  <div className="text-[#9ca3af] text-[13px]">Opponent guessed the exact sum and claimed the jackpot.</div>
                  <div className="text-[#6b7280] text-[12px] mt-1">EXACT SUM: {totalSumVal}</div>
                </div>
              )}

              {/* Winner banner */}
              {isDraw ? (
                <div className="mb-4">
                  <div className="text-5xl mb-2">🤝</div>
                  <div className="text-[#fbbf24] text-[14px] tracking-widest"
                    style={{ textShadow: '3px 3px 0 #000' }}>
                    IT&apos;S A TIE!
                  </div>
                  <div className="text-[#9ca3af] text-[14px] mt-1">Both players hit the exact sum. Lucky!</div>
                </div>
              ) : iWon ? (
                <div className="mb-4 animate-bounce">
                  <div className="text-6xl mb-2">🏆</div>
                  <div className="text-[#22c55e] text-[17px] tracking-widest"
                    style={{ textShadow: '4px 4px 0 #000, 0 0 20px #22c55e' }}>
                    YOU WIN!
                  </div>
                  <div className="text-[#6ee7b7] text-[14px] mt-1">Congratulations! 🍺 Drinks are on you!</div>
                  <div className="text-[#fbbf24] text-[13px] mt-2">
                    +{formatXLM(parityPrize)} XLM parity
                    {iHitJackpot && jackpot != null && jackpot > 0n && (
                      <span className="text-[#fbbf24]"> + {formatXLM(jackpot + jackpotContribution)} XLM jackpot 🎰</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mb-4">
                  <div className="text-5xl mb-2">💀</div>
                  <div className="text-[#ef4444] text-[15px] tracking-widest"
                    style={{ textShadow: '3px 3px 0 #000' }}>
                    YOU LOSE!
                  </div>
                  <div className="text-[#fca5a5] text-[14px] mt-1">Better luck next round!</div>
                </div>
              )}

              {/* Result details */}
              <div className="bg-[#111827] border-4 border-[#3b82f6] p-4 mb-3 text-left text-[14px] space-y-2">
                <div className="text-[#3b82f6] tracking-widest mb-2">⚄ MATCH RESULT</div>
                {winnerShort && (
                  <div className="text-white flex justify-between">
                    <span>WINNER:</span>
                    <span className={iWon ? 'text-[#22c55e]' : 'text-[#ef4444]'}>
                      {iWon ? '👑 YOU' : `${winnerShort}`}
                    </span>
                  </div>
                )}
                {totalSumVal !== undefined && totalSumVal !== null && (
                  <div className="text-white flex justify-between">
                    <span>TOTAL FINGERS:</span>
                    <span className="text-[#fbbf24]">{totalSumVal} ({totalSumVal % 2 === 0 ? 'EVEN' : 'ODD'})</span>
                  </div>
                )}
                <div className="text-white flex justify-between">
                  <span>BET:</span>
                  <span className="text-[#fbbf24]">{formatXLM(currentRoom.bet_amount)} XLM each</span>
                </div>
                <div className="text-white flex justify-between">
                  <span>TOTAL POT:</span>
                  <span className="text-[#fbbf24]">{formatXLM(totalPot)} XLM</span>
                </div>
                <div className="text-white flex justify-between">
                  <span>PARITY PRIZE (80%):</span>
                  <span className="text-[#22c55e]">{formatXLM(parityPrize)} XLM</span>
                </div>
                <div className="text-white flex justify-between">
                  <span>→ JACKPOT (20%):</span>
                  <span className="text-[#ef4444]">+{formatXLM(jackpotContribution)} XLM</span>
                </div>
                <div className="text-white flex justify-between">
                  <span>SESSION:</span>
                  <span className="text-[#9ca3af]">#{currentRoom.session_id}</span>
                </div>
              </div>

              {/* P1 vs P2 guesses */}
              <div className="bg-[#0d1117] border-2 border-[#374151] p-3 mb-3 text-[13px] text-left">
                <div className="text-[#6b7280] tracking-widest mb-2">PLAYER GUESSES</div>
                <div className="flex justify-between mb-1">
                  <span className="text-[#9ca3af]">Player 1 ({currentRoom.player1.address.slice(0,6)}...):</span>
                  <span className={`text-white ${p1HitJackpot ? 'text-[#fbbf24]' : ''}`}>
                    {currentRoom.player1.parity_guess === 1 ? 'ODD' : 'EVEN'} · exact={currentRoom.player1.exact_sum_guess}{p1HitJackpot ? ' 🎰' : ''}
                  </span>
                </div>
                {currentRoom.has_player2 && (
                  <div className="flex justify-between">
                    <span className="text-[#9ca3af]">Player 2 ({currentRoom.player2.address.slice(0,6)}...):</span>
                    <span className={`text-white ${p2HitJackpot ? 'text-[#fbbf24]' : ''}`}>
                      {currentRoom.player2.parity_guess === 1 ? 'ODD' : 'EVEN'} · exact={currentRoom.player2.exact_sum_guess}{p2HitJackpot ? ' 🎰' : ''}
                    </span>
                  </div>
                )}
              </div>

              <div className="bg-[#064e3b] border-4 border-[#22c55e] p-3 mb-3 text-[14px]">
                <div className="text-[#22c55e] tracking-widest mb-1">🔐 ZERO-KNOWLEDGE PROOF</div>
                <div className="text-[#6ee7b7]">Hands never revealed on-chain.<br />Winner proven by ZK circuit. 100% trustless.</div>
              </div>

              {lastTxHash && (
                <div className="mb-3">
                  <TxLink hash={lastTxHash} />
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleStartNewGame}
                  className="flex-1 bg-[#374151] border-4 border-black text-white font-bold py-3 text-[14px] tracking-widest shadow-[4px_4px_0_#000]"
                >
                  ← LOBBY
                </button>
                <button
                  onClick={handleStartNewGame}
                  className="flex-1 bg-[#fbbf24] border-4 border-black text-black font-bold py-3 text-[14px] tracking-widest shadow-[6px_6px_0_#000]"
                >
                  🍺 PLAY AGAIN
                </button>
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}


