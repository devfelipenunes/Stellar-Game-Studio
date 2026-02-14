import { useState, useEffect, useRef } from 'react';
import React from 'react';
import { zkPorrinhaService } from './zkPorrinhaService';
import {
  createRoomAction,
  joinRoomAction,
  commitHandAction,
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
import PixelLayout from './PixelLayout';
import LogPanel from './components/LogPanel';
import QuickstartCard from './components/QuickstartCard';
import PlayerBalances from './components/PlayerBalances';
import RevealForm from './components/RevealForm';
import { loadSecret } from './secrets';
import { useWallet } from '@/hooks/useWallet';
import { devWalletService, DevWalletService } from '@/services/devWalletService';
import { BalanceDisplay } from './BalanceDisplay';
import { TransferQueue } from './TransferAnimation';
import { TransactionInfo } from './TransactionInfo';
import type { Room } from './bindings';

interface ZkPorrinhaGameProps {
  userAddress: string;
  currentEpoch: number;
  availablePoints: bigint;
  onStandingsRefresh: () => void;
  onGameComplete: () => void;
}

type RoomPhase = 'lobby' | 'commit' | 'settled';

interface TransferItem {
  id: string;
  from: string;
  to: string;
  amount: string;
  type: 'bet' | 'jackpot';
}

export function ZkPorrinhaGame({
  userAddress,
  onGameComplete
}: ZkPorrinhaGameProps) {
  const DEFAULT_BET = '1000000'; // 0.1 XLM in stroops
  const { getContractSigner, walletType } = useWallet();
  
  // State
  const [currentRoomId, setCurrentRoomId] = useState<bigint | null>(null);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [rooms, setRooms] = useState<Array<{ id: bigint; room: Room | null }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [roomPhase, setRoomPhase] = useState<RoomPhase>('lobby');
  const [uiLog, setUiLog] = useState<string[]>([]);
  const [isGeneratingProof, setIsGeneratingProof] = useState<boolean>(false);
  
  // Game inputs
  const [betAmount, setBetAmount] = useState(DEFAULT_BET);
  const [selectedHand, setSelectedHand] = useState<number>(3);
  const [selectedParity, setSelectedParity] = useState<number>(1); // 1=odd, 0=even
  const [selectedTotalGuess, setSelectedTotalGuess] = useState<number>(5); // 0-10
  const [savedSalt, setSavedSalt] = useState<string>('');

  // Feature flags
  const quickstartAvailable = walletType === 'dev';
  const ONLY_QUICKSTART = true; // show only quickstart UI for now
  const [quickstartRunning, setQuickstartRunning] = useState<boolean>(false);
  const quickstartRunningRef = useRef<boolean>(false);
  const quickstartButtonRef = useRef<HTMLButtonElement | null>(null);

  // small inline SVG spinner
  const Spinner = ({ size = 14 }: { size?: number }) => (
    <svg className="inline-block align-middle mr-2" width={size} height={size} viewBox="0 0 50 50">
      <circle cx="25" cy="25" r="20" fill="none" stroke="#FBBF24" strokeWidth="5" strokeLinecap="round" strokeDasharray="31.4 31.4">
        <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.9s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
  
  // Store committed values per room to display correctly in reveal phase
  const [committedValues, setCommittedValues] = useState<{
    [roomId: string]: { hand: number; parity: number; salt: string }
  }>({});
  
  // Transfer animations
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [showTransfers, setShowTransfers] = useState(false);
  

  // Tx / result feedback
  const [lastTxHash, setLastTxHash] = useState<string | undefined>(undefined);
  const [gameWinner, setGameWinner] = useState<string | undefined>(undefined);
  const [gameWinAmount, setGameWinAmount] = useState<bigint | undefined>(undefined);

  const runAction = async (action: () => Promise<void>) => {
    await runActionService(action);
  };

  function pushLog(message: string) {
    const msg = logMessageService(message);
    setUiLog((p) => [msg, ...p].slice(0, 12));
  }

  useEffect(() => {
    if (currentRoomId) pushLog(`Room set to #${currentRoomId}`);
  }, [currentRoomId]);

  useEffect(() => {
    if (lastTxHash) pushLog(`TX: ${lastTxHash.slice(0,8)}...`);
  }, [lastTxHash]);

  const loadRooms = async () => {
    try {
      const rows = await listRecentRoomsAction(10);
      setRooms(rows);
    } catch (e) {
      console.error('loadRooms failed', e);
    }
  };

  const refreshRoom = async () => {
    try {
      if (!currentRoomId) return;
      const room = await getRoomAction(currentRoomId);
      setCurrentRoom(room);
      setRoomPhase(determineRoomPhase(room));
    } catch (e) {
      console.error('refreshRoom failed', e);
    }
  };
  
  const updatePhaseFromRoom = (room: Room | null) => {
    if (!room) return;
    setRoomPhase(determineRoomPhase(room));
  };
  
  const handleStartNewGame = () => {
    if (currentRoom && roomPhase === 'settled') {
      onGameComplete();
    }
    setCurrentRoomId(null);
    setCurrentRoom(null);
    setRoomPhase('lobby');
    setLoading(false);
    setError(null);
    setSuccess(null);
    setBetAmount(DEFAULT_BET);
    setSelectedHand(3);
    setSelectedParity(1);
    setSavedSalt('');
    setCommittedValues({}); // Clear committed values
    loadRooms();
  };
  
  const handleCreateRoom = async () => {
    await runActionService(async () => {
      setLoading(true);
      setError(null);
      setSuccess(null);
      setLastTxHash(undefined);
      setGameWinner(undefined);
      setGameWinAmount(undefined);
      try {
        const signer = await getContractSigner();
        if (!signer) throw new Error('No signer available');
        const res = await handleCreateRoomAction(userAddress, signer, betAmount);
        res.logs.forEach(l => pushLog(l));
        if (res.success) {
          setSuccess(`Room ${res.roomId} created! TX: ${String(res.txHash).slice(0,8)}...`);
          setLastTxHash(res.txHash);
          setCurrentRoomId(res.roomId!);
          await refreshRoom();
          await loadRooms();
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
  
  const handleJoinRoom = async (roomId: bigint) => {
    await runActionService(async () => {
      setLoading(true);
      setError(null);
      setSuccess(null);
      try {
        const signer = await getContractSigner();
        if (!signer) throw new Error('No signer available');
        const res = await handleJoinRoomAction(roomId, userAddress, signer);
        res.logs.forEach(l => pushLog(l));
        if (res.success) {
          const betXlm = res.betAmount ? (Number(res.betAmount) / 10_000_000).toFixed(1) : '?';
          setSuccess(`Joined room! Prize pool: ${(parseFloat(betXlm) * 2).toFixed(1)} XLM. TX: ${String(res.txHash).slice(0,8)}...`);
          setCurrentRoomId(roomId);
          await refreshRoom();
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
  
  const handleCommit = async () => {
    if (!currentRoomId) return;
    await runActionService(async () => {
      setLoading(true);
      setError(null);
      setSuccess(null);
      setIsGeneratingProof(true);
      try {
        pushLog(`Commit: hand=${selectedHand} parity=${selectedParity} total=${selectedTotalGuess}`);
        const signer = await getContractSigner();
        if (!signer) throw new Error('No signer available');
        const res = await handleCommitAction(currentRoomId, userAddress, signer, selectedHand, selectedParity, selectedTotalGuess);
        res.logs.forEach(l => pushLog(l));
        if (res.success) {
          const saltValue = res.salt!;
          setSavedSalt(saltValue);
          setCommittedValues(prev => ({
            ...prev,
            [currentRoomId.toString()]: { hand: selectedHand, parity: selectedParity, salt: saltValue }
          }));

          if (res.autoResolved && res.winner) {
            setGameWinner(res.winner);
            if (res.totalSum) {
              const betAmount = currentRoom?.bet_amount || BigInt(0);
              setGameWinAmount(betAmount * BigInt(2)); // Total pot
            }
            if (res.resolveTxHash) {
              setLastTxHash(res.resolveTxHash);
            }
            setSuccess('🏆 Game auto-resolved! Check the winner below.');
          } else {
            setSuccess('Commitment submitted with ZK proof! Keep your values safe until reveal phase.');
          }
          
          await refreshRoom();
        } else {
          setError(res.error || 'Failed to commit hand');
        }
      } catch (e: any) {
        setError(e.message || 'Failed to commit hand');
      } finally {
        setLoading(false);
        setIsGeneratingProof(false);
      }
    });
  };

  const handleResolve = async (otherHand: number, otherSaltHex: string) => {
    if (!currentRoomId) return;
    await runAction(async () => {
      setLoading(true);
      try {
        const signer = await getContractSigner();
        if (!signer) throw new Error('No signer');
        const mySecret = loadSecret(currentRoomId, userAddress);
        if (!mySecret) throw new Error('Missing your secret (salt/hand). You must have committed from this browser/session.');
        const res = await revealAndResolveAction(currentRoomId, userAddress, signer, mySecret, { hand: otherHand, saltHex: otherSaltHex });
        if (res.success) {
          pushLog('Resolved round on-chain');
          await refreshRoom();
        } else {
          setError('Resolve failed');
        }
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    });
  };
  
  const handleQuickstart = async () => {
    if (!quickstartAvailable) return;
    if (quickstartRunningRef.current) return;
    if (quickstartButtonRef.current) {
      try { quickstartButtonRef.current.disabled = true; } catch (e) { /* ignore */ }
    }
    quickstartRunningRef.current = true;
    setQuickstartRunning(true);
    await runActionService(async () => {
      setLoading(true);
      setError(null);
      setSuccess(null);
      try {
        const res = await handleQuickstartAction(betAmount);
        (res.logs || []).forEach(l => pushLog(l));
        if (res.success) {
          if (res.updatedRoom) {
            setCurrentRoom(res.updatedRoom);
            setCurrentRoomId(res.roomId);
            setRoomPhase(determineRoomPhase(res.updatedRoom));
          }
          setSuccess('Quickstart complete! Both players are in the room. Now commit your hands.');
          await loadRooms();
        } else {
          setError(res.error || 'Quickstart failed');
        }
      } catch (e: any) {
        setError(`Quickstart failed: ${e.message}`);
      } finally {
        setLoading(false);
        quickstartRunningRef.current = false;
        setQuickstartRunning(false);
        if (quickstartButtonRef.current) {
          try { quickstartButtonRef.current.disabled = false; } catch (e) { /* ignore */ }
        }
      }
    });
  };
  
  const isPlayer1 = currentRoom?.player1.address === userAddress;
  const isPlayer2 = currentRoom?.player2?.address === userAddress;
  const isPlayer = isPlayer1 || isPlayer2;
  
  const hasCommitted = isPlayer1 
    ? currentRoom?.player1.has_committed 
    : currentRoom?.player2?.has_committed;
  
  const formatXLM = (stroops: bigint | number): string => formatXLMService(stroops);
  
  return (
    <PixelLayout
      statusLeft={
        (isGeneratingProof || quickstartRunning) ? (
          <span className="text-yellow-300 flex items-center">
            <Spinner />
            <span>› Gerando Prova ZK...</span>
          </span>
        ) : (
          `Room: ${currentRoomId ? currentRoomId.toString() : '-'}`
        )
      }
      statusRight={`Studio • ZK Porrinha`}
    >
      <div className="game-header bg-[#5c4033] border-b-4 border-black text-white text-center py-3 px-2">
        <h2 className="text-lg font-bold uppercase tracking-wider">🎲 ZK Porrinha</h2>
        <p className="game-subtitle text-xs mt-1 opacity-90">Zero-knowledge hand game with instant results and jackpot</p>
      </div>
      <LogPanel uiLog={uiLog} onClear={() => setUiLog([])} onToggleTransfers={() => setShowTransfers(s => !s)} showTransfers={showTransfers} />
      
      <PlayerBalances currentRoom={currentRoom} myAddress={userAddress} />
      
      {showTransfers && (
        <TransferQueue
          transfers={transfers}
          onAllComplete={() => {
            setShowTransfers(false);
            setTransfers([]);
          }}
        />
      )}
      
      {error && (
        <div className="notice error" style={{ marginBottom: '1rem' }}>
          ❌ {error}
        </div>
      )}
      {success && (
        <div className="notice success" style={{ marginBottom: '1rem' }}>
          ✅ {success}
        </div>
      )}
      
      {/* Current Room Info */}
      {currentRoom && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button
              onClick={async () => {
                try {
                  await refreshRoom();
                  console.log('DEBUG: currentRoom:', currentRoom);
                } catch (e) {
                  console.error('DEBUG: refreshRoom failed', e);
                }
              }}
              className="button tertiary small"
              style={{ marginBottom: '0.5rem' }}
            >
              🐞 Dump Room State
            </button>
          </div>
          <h3>Room #{currentRoomId?.toString()}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            <div>
              <div className="label">Status</div>
              <div className="value">{(currentRoom.status as any).tag}</div>
            </div>
            <div>
              <div className="label">Bet Amount</div>
              <div className="value">{formatXLM(currentRoom.bet_amount)} XLM</div>
            </div>
            <div>
              <div className="label">Total Pot</div>
              <div className="value">{formatXLM(BigInt(currentRoom.bet_amount) * 2n)} XLM</div>
            </div>
            <div>
              <div className="label">Session ID</div>
              <div className="value">#{currentRoom.session_id || 0}</div>
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem' }}>
            <div className="player-info">
              <div className="label">Player 1 {isPlayer1 && '(You)'}</div>
              <div className="value mono small">{currentRoom.player1.address.substring(0, 10)}...</div>
              <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                <div>Hand: 🔒</div>
                <div>Guess: 🔒</div>
              </div>
            </div>
            <div className="player-info">
              <div className="label">Player 2 {isPlayer2 && '(You)'}</div>
              <div className="value mono small">
                {currentRoom.has_player2 && currentRoom.player2?.address 
                  ? `${currentRoom.player2.address.substring(0, 10)}...`
                  : 'Waiting...'}
              </div>
              {currentRoom.has_player2 && (
                <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                  <div>Hand: 🔒</div>
                  <div>Guess: 🔒</div>
                </div>
              )}
            </div>
          </div>
          
          {roomPhase === 'settled' && (
            <div className="notice success" style={{ marginTop: '1rem' }}>
              � Game Settled! Check transaction for results.
            </div>
          )}
          
          {/* Transaction Info Component */}
          <TransactionInfo
            txHash={lastTxHash}
            winner={gameWinner}
            winAmount={gameWinAmount}
            betAmount={currentRoom.bet_amount}
            userAddress={userAddress}
            network="testnet"
          />
        </div>
      )}
      
      {/* Phase: Lobby (no current room) */}
      {roomPhase === 'lobby' && !currentRoom && (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {quickstartAvailable && (
            <QuickstartCard
              quickstartAvailable={quickstartAvailable}
              isQuickstarting={quickstartRunning}
              onQuickstart={handleQuickstart}
              quickstartButtonRef={quickstartButtonRef}
            />
          )}

          {!ONLY_QUICKSTART && (
            <>
              <div className="card">
                <h3>Create New Room</h3>
                <div style={{ marginTop: '1rem' }}>
                  <label className="label">Bet Amount (stroops)</label>
                  <input
                    type="number"
                    value={betAmount}
                    onChange={(e) => setBetAmount(e.target.value)}
                    className="input"
                    style={{ marginTop: '0.5rem' }}
                  />
                  <div style={{ fontSize: '0.875rem', color: 'var(--color-ink-muted)', marginTop: '0.25rem' }}>
                    = {formatXLM(BigInt(betAmount || '0'))} XLM
                  </div>
                  <button
                    onClick={handleCreateRoom}
                    disabled={loading}
                    className="w-full bg-[#22c55e] border-4 border-black text-white font-bold py-3 rounded-md shadow-[4px_4px_0px_0px_#166534]"
                  >
                    {loading ? 'Creating...' : 'Create Room'}
                  </button>
                </div>
              </div>

              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3>Available Rooms</h3>
                  <button
                    onClick={loadRooms}
                    className="button secondary small"
                  >
                    🔄 Refresh
                  </button>
                </div>
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {rooms.length === 0 && (
                    <p style={{ color: 'var(--color-ink-muted)', textAlign: 'center', padding: '2rem' }}>
                      No rooms available. Create one above!
                    </p>
                  )}
                  {rooms.map(({ id, room }) => {
                    if (!room) return null;
                    const status = (room.status as any).tag;
                    const needsPlayer2 = !room.has_player2 && status === 'Lobby';
                    
                    return (
                      <div key={id.toString()} className="room-row border-b py-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="font-bold">Room {id.toString()}</div>
                            <div className="text-xs text-gray-400">Status: {status}</div>
                          </div>
                          <div className="flex gap-2">
                            {needsPlayer2 && (
                              <button onClick={() => handleJoinRoom(id)} className="button primary small">Join</button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}
      
      {/* Phase: Commit */}
      {roomPhase === 'commit' && currentRoom && isPlayer && (
        <div className="card">
          <h3>Commit Phase</h3>
          {!hasCommitted ? (
            <div className="mt-4 space-y-4">
              <div>
                <label className="label">Select Hand (0-5 fingers)</label>
                <div className="grid grid-cols-4 gap-3 mt-2">
                  {[0, 1, 2, 3].map((num) => (
                    <button
                      key={num}
                      onClick={() => setSelectedHand(num)}
                      className={
                        `aspect-square border-4 border-black rounded-sm flex items-center justify-center text-2xl font-bold cursor-pointer ` +
                        (selectedHand === num
                          ? 'bg-[#FFC107] text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'
                          : 'bg-[#E3C099] text-black')
                      }
                    >
                      {num} {selectedHand === num && '✓'}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-sm text-[#9ca3af]">Selected: <strong className="text-[#60a5fa]">{selectedHand}</strong></p>
              </div>

              <div>
                <label className="label">Select Parity Guess</label>
                <div className="flex gap-3 mt-2">
                  <button
                    onClick={() => setSelectedParity(1)}
                    className={`flex-1 border-4 border-black py-3 rounded-sm font-bold ${selectedParity === 1 ? 'bg-[#FFC107] text-black' : 'bg-[#E3C099] text-black'}`}
                  >
                    Odd (1) {selectedParity === 1 && '✓'}
                  </button>
                  <button
                    onClick={() => setSelectedParity(0)}
                    className={`flex-1 border-4 border-black py-3 rounded-sm font-bold ${selectedParity === 0 ? 'bg-[#FFC107] text-black' : 'bg-[#E3C099] text-black'}`}
                  >
                    Even (0) {selectedParity === 0 && '✓'}
                  </button>
                </div>
                <p className="mt-2 text-sm text-[#9ca3af]">Selected: <strong className="text-[#a78bfa]">{selectedParity === 1 ? 'Odd (1)' : 'Even (0)'}</strong></p>
              </div>

              <div>
                <label className="label">Guess Total (Sum of Both Hands)</label>
                <div className="grid grid-cols-6 gap-2 mt-2">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                    <button
                      key={num}
                      onClick={() => setSelectedTotalGuess(num)}
                      className={
                        `aspect-square border-4 border-black rounded-sm flex items-center justify-center font-bold ` +
                        (selectedTotalGuess === num ? 'bg-[#10b981] text-white shadow-[4px_4px_0px_0px_#065f46]' : 'bg-[#E3C099] text-black')
                      }
                    >
                      {num} {selectedTotalGuess === num && '✓'}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-sm text-[#9ca3af]">Selected: <strong className="text-[#34d399]">{selectedTotalGuess}</strong></p>
              </div>

              <div className="bg-[#E3C099] border-4 border-black p-3 rounded-md text-sm">
                <strong>🔐 Commit-Reveal Protocol</strong><br />
                <strong>1. Commit:</strong> Both players lock in their choices with ZK proofs (hands stay hidden)<br />
                <strong>2. Reveal:</strong> After both commit, players reveal to determine the winner<br />
                <strong>3. Winner:</strong> Decided by total fingers and parity guess<br />
                <br />
                ℹ️ Your choices will be hidden using zero-knowledge cryptography until both players commit.
              </div>

              <button
                onClick={handleCommit}
                disabled={loading}
                className="w-full bg-[#22c55e] border-4 border-black text-white font-bold py-5 rounded-md shadow-[4px_4px_0px_0px_#166534]"
              >
                {loading ? 'Generating Proof & Committing...' : '🔒 Commit Hand'}
              </button>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
              <div className="value">You have committed!</div>
              <p style={{ color: 'var(--color-ink-muted)', marginTop: '0.5rem' }}>
                Waiting for opponent to commit their hand...
              </p>
            </div>
          )}
        </div>
      )}

      {/* If both players committed, show Reveal/Resolve panel to allow proof generation */}
      {roomPhase === 'commit' && currentRoom && currentRoom.player1.has_committed && currentRoom.player2?.has_committed && (
        <div className="mt-4">
          <RevealForm
            roomId={currentRoomId}
            myAddress={userAddress}
            mySecretAvailable={!!loadSecret(currentRoomId!, userAddress)}
            onResolve={async (otherHand, otherSaltHex) => {
              await handleResolve(otherHand, otherSaltHex);
            }}
          />
        </div>
      )}
      
      {/* Phase: Settled (Results) */}
      {roomPhase === 'settled' && currentRoom && (
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎉</div>
          <h2 style={{ marginBottom: '2rem' }}>Game Complete!</h2>
          
          {/* Nota: Winner e revealed hands não disponíveis on-chain (ZK proof mantém privacidade) */}
          <div style={{ 
            marginBottom: '2rem', 
            padding: '1.5rem', 
            backgroundColor: '#3b82f6', 
            borderRadius: '0.5rem',
            color: 'white'
          }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              🎮 Game Resolved!
            </div>
            <div style={{ fontSize: '0.95rem', opacity: 0.9 }}>
              The game was settled on-chain using zero-knowledge proofs.<br/>
              Check the transaction hash for payout details.
            </div>
          </div>

          {/* Game Info */}
          <div style={{ marginBottom: '2rem', textAlign: 'left', backgroundColor: '#1f2937', padding: '1.5rem', borderRadius: '0.5rem' }}>
            <div style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: 'bold' }}>Game Details</div>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <div>
                <span style={{ opacity: 0.7 }}>Bet Amount:</span> {formatXLM(currentRoom.bet_amount)} XLM
              </div>
              <div>
                <span style={{ opacity: 0.7 }}>Total Pot:</span> {formatXLM(BigInt(currentRoom.bet_amount) * 2n)} XLM
              </div>
              <div>
                <span style={{ opacity: 0.7 }}>Session ID:</span> #{currentRoom.session_id}
              </div>
            </div>
          </div>

          {/* Players (without revealed data) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
            <div className="player-info" style={{ padding: '1rem', backgroundColor: '#1f2937', borderRadius: '0.5rem' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>
                Player 1 {userAddress === currentRoom.player1.address && '(You)'}
              </div>
              <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', opacity: 0.7 }}>
                {currentRoom.player1.address.substring(0, 10)}...
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                ✅ Committed
              </div>
            </div>
            <div className="player-info" style={{ padding: '1rem', backgroundColor: '#1f2937', borderRadius: '0.5rem' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>
                Player 2 {userAddress === currentRoom.player2.address && '(You)'}
              </div>
              <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', opacity: 0.7 }}>
                {currentRoom.player2.address.substring(0, 10)}...
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                ✅ Committed
              </div>
            </div>
          </div>

          {/* Result Info */}
          <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#065f46', borderRadius: '0.5rem', color: 'white' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              🔐 Zero-Knowledge Privacy
            </div>
            <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>
              Hands were never revealed on-chain. Winner determined via ZK proof.
            </div>
          </div>
          
          <button
            onClick={handleStartNewGame}
            className="w-full bg-[#22c55e] border-4 border-black text-white font-bold py-3 rounded-md shadow-[4px_4px_0px_0px_#166534]"
            style={{ fontSize: '1.1rem' }}
          >
            ← Back to Lobby
          </button>
        </div>
      )}
      
      {/* Waiting for player 2 */}
      {roomPhase === 'lobby' && currentRoom && !currentRoom.has_player2 && (
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
          <h3>Waiting for Player 2</h3>
          <p style={{ color: 'var(--color-ink-muted)', marginTop: '0.5rem' }}>
            Share Room ID <strong>#{currentRoomId?.toString()}</strong> with another player
          </p>
          <button
            onClick={handleStartNewGame}
            className="button secondary"
            style={{ marginTop: '1rem' }}
          >
            Cancel & Back to Lobby
          </button>
        </div>
      )}
    </PixelLayout>
  );
}
