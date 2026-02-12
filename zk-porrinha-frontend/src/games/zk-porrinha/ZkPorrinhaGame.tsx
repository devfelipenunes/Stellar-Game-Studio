import { useState, useEffect, useRef } from 'react';
import { zkPorrinhaService } from './zkPorrinhaService';
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
  
  // Game inputs
  const [betAmount, setBetAmount] = useState(DEFAULT_BET);
  const [selectedHand, setSelectedHand] = useState<number>(3);
  const [selectedParity, setSelectedParity] = useState<number>(1); // 1=odd, 0=even
  const [selectedTotalGuess, setSelectedTotalGuess] = useState<number>(5); // 0-10
  const [savedSalt, setSavedSalt] = useState<string>('');

  // Feature flags
  const quickstartAvailable = walletType === 'dev';
  
  // Store committed values per room to display correctly in reveal phase
  const [committedValues, setCommittedValues] = useState<{
    [roomId: string]: { hand: number; parity: number; salt: string }
  }>({});
  
  // Transfer animations
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [showTransfers, setShowTransfers] = useState(false);
  const actionLock = useRef(false);

  // Tx / result feedback
  const [lastTxHash, setLastTxHash] = useState<string | undefined>(undefined);
  const [gameWinner, setGameWinner] = useState<string | undefined>(undefined);
  const [gameWinAmount, setGameWinAmount] = useState<number | undefined>(undefined);

  const runAction = async (action: () => Promise<void>) => {
    if (actionLock.current || loading) return;
    actionLock.current = true;
    try {
      await action();
    } finally {
      actionLock.current = false;
    }
  };

  const loadRooms = async () => {
    try {
      const rows = await zkPorrinhaService.listRecentRooms(10);
      setRooms(rows);
    } catch (e) {
      console.error('loadRooms failed', e);
    }
  };

  const refreshRoom = async () => {
    try {
      if (!currentRoomId) return;
      const room = await zkPorrinhaService.getRoom(currentRoomId);
      setCurrentRoom(room);
      updatePhaseFromRoom(room);
    } catch (e) {
      console.error('refreshRoom failed', e);
    }
  };
  
  const updatePhaseFromRoom = (room: Room | null) => {
    if (!room) return;
    
    const status = room.status as { tag: string };
    
    switch (status.tag) {
      case 'Lobby':
        setRoomPhase('lobby');
        break;
      case 'Commit':
        setRoomPhase('commit');
        break;
      case 'Settled':
        setRoomPhase('settled');
        break;
    }
  };
  
  const handleStartNewGame = () => {
    if (currentRoom?.last_winner) {
      onGameComplete();
    }
    
    actionLock.current = false;
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
    await runAction(async () => {
      setLoading(true);
      setError(null);
      setSuccess(null);
      setLastTxHash(undefined);
      setGameWinner(undefined);
      setGameWinAmount(undefined);
      
      try {
        const signer = await getContractSigner();
        if (!signer) throw new Error('No signer available');
        
        const result = await zkPorrinhaService.createRoom(
          userAddress,
          signer,
          BigInt(betAmount)
        );
        
        if (result) {
          setSuccess(`Room ${result.roomId} created! TX: ${result.txHash.slice(0, 8)}...`);
          setLastTxHash(result.txHash);
          setCurrentRoomId(result.roomId);
          await refreshRoom();
          await loadRooms();
        } else {
          throw new Error('Failed to create room');
        }
      } catch (e: any) {
        setError(e.message || 'Failed to create room');
      } finally {
        setLoading(false);
      }
    });
  };
  
  const handleJoinRoom = async (roomId: bigint) => {
    await runAction(async () => {
      setLoading(true);
      setError(null);
      setSuccess(null);
      
      try {
        const signer = await getContractSigner();
        if (!signer) throw new Error('No signer available');
        
        const result = await zkPorrinhaService.joinRoom(roomId, userAddress, signer);
        
        if (result.success) {
          const betXlm = result.betAmount ? (Number(result.betAmount) / 10_000_000).toFixed(1) : '?';
          setSuccess(`Joined room! Prize pool: ${(parseFloat(betXlm) * 2).toFixed(1)} XLM. TX: ${result.txHash?.slice(0, 8)}...`);
          setCurrentRoomId(roomId);
          await refreshRoom();
        } else {
          throw new Error('Failed to join room');
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
    
    await runAction(async () => {
      setLoading(true);
      setError(null);
      setSuccess(null);
      
      try {
        const signer = await getContractSigner();
        if (!signer) throw new Error('No signer available');
        
        console.log(`Committing hand=${selectedHand}, parity=${selectedParity}, totalGuess=${selectedTotalGuess}`);
        
        const result = await zkPorrinhaService.commitHandWithProof(
          currentRoomId,
          userAddress,
          signer,
          selectedHand,
          selectedParity,
          selectedTotalGuess
        );
        
        if (result.success && result.salt) {
          const saltValue = result.salt; // Garantir que não é undefined
          setSavedSalt(saltValue);
          // Save committed values AND salt for this room
          setCommittedValues(prev => ({
            ...prev,
            [currentRoomId.toString()]: { 
              hand: selectedHand, 
              parity: selectedParity,
              salt: saltValue
            }
          }));
          setSuccess('Commitment submitted with ZK proof! Keep your values safe until reveal phase.');
          await refreshRoom();
        } else {
          throw new Error('Failed to commit hand');
        }
      } catch (e: any) {
        setError(e.message || 'Failed to commit hand');
      } finally {
        setLoading(false);
      }
    });
  };
  
  const handleQuickstart = async () => {
    if (!quickstartAvailable) return;
    
    await runAction(async () => {
      setLoading(true);
      setError(null);
      setSuccess(null);
      
      try {
        const originalPlayer = devWalletService.getCurrentPlayer();
        
        let player1Address = '';
        let player2Address = '';
        let player1Signer: ReturnType<typeof devWalletService.getSigner> | null = null;
        let player2Signer: ReturnType<typeof devWalletService.getSigner> | null = null;
        
        try {
          // Initialize player 1
          await devWalletService.initPlayer(1);
          player1Address = devWalletService.getPublicKey();
          player1Signer = devWalletService.getSigner();
          
          // Initialize player 2
          await devWalletService.initPlayer(2);
          player2Address = devWalletService.getPublicKey();
          player2Signer = devWalletService.getSigner();
        } finally {
          if (originalPlayer) {
            await devWalletService.initPlayer(originalPlayer);
          }
        }
        
        if (!player1Signer || !player2Signer) {
          throw new Error('Failed to initialize dev wallet signers');
        }
        
        if (player1Address === player2Address) {
          throw new Error('Quickstart requires two different dev wallets');
        }
        
        // Player 1 creates room
        setSuccess('Quickstart: Player 1 creating room...');
        const result = await zkPorrinhaService.createRoom(
          player1Address,
          player1Signer,
          BigInt(betAmount)
        );
        
        if (!result) throw new Error('Failed to create room');
        
        setCurrentRoomId(result.roomId);
        await new Promise(r => setTimeout(r, 1000));
        
        // Player 2 joins
        setSuccess('Quickstart: Player 2 joining room...');
        await zkPorrinhaService.joinRoom(result.roomId, player2Address, player2Signer);
        
        await refreshRoom();
        setSuccess('Quickstart complete! Both players are in the room. Now commit your hands.');
        await loadRooms();
      } catch (e: any) {
        setError(`Quickstart failed: ${e.message}`);
      } finally {
        setLoading(false);
      }
    });
  };
  
  const isPlayer1 = currentRoom?.player1.address === userAddress;
  const isPlayer2 = currentRoom?.player2?.address === userAddress;
  const isPlayer = isPlayer1 || isPlayer2;
  
  const hasCommitted = isPlayer1 
    ? currentRoom?.player1.has_committed 
    : currentRoom?.player2?.has_committed;
  
  const formatXLM = (stroops: bigint | number): string => {
    return (Number(stroops) / 10000000).toFixed(1);
  };
  
  return (
    <div className="game-container">
      <div className="game-header">
        <h2>🎲 ZK Porrinha</h2>
        <p className="game-subtitle">Zero-knowledge hand game with instant results and jackpot</p>
      </div>
      
      {/* Player Balances Panel */}
      {currentRoom && (
        <div
          style={{
            marginBottom: '1.5rem',
            padding: '1rem',
            backgroundColor: '#f9fafb',
            borderRadius: '12px',
            border: '2px solid #e5e7eb',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '16px', color: '#374151' }}>💰 Saldos dos Jogadores</h3>
            <div
              style={{
                padding: '6px 12px',
                backgroundColor: '#dbeafe',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 'bold',
                color: '#1e40af',
              }}
            >
              Aposta: {formatXLM(currentRoom.bet_amount)} XLM
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600' }}>
                Player 1 {isPlayer1 && '(Você)'}
              </div>
              <BalanceDisplay
                address={currentRoom.player1.address}
                highlight={isPlayer1}
              />
            </div>
            {currentRoom.has_player2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600' }}>
                  Player 2 {isPlayer2 && '(Você)'}
                </div>
                <BalanceDisplay
                  address={currentRoom.player2.address}
                  highlight={isPlayer2}
                />
              </div>
            )}
          </div>
          {currentRoom.jackpot_pool > 0 && (
            <div
              style={{
                marginTop: '1rem',
                padding: '8px 12px',
                backgroundColor: '#fef3c7',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '14px',
                fontWeight: '600',
                color: '#92400e',
              }}
            >
              🎰 Jackpot: {formatXLM(currentRoom.jackpot_pool)} XLM
            </div>
          )}
        </div>
      )}
      
      {/* Transfer Animations */}
      {showTransfers && (
        <TransferQueue
          transfers={transfers}
          onAllComplete={() => {
            setShowTransfers(false);
            setTransfers([]);
          }}
        />
      )}
      
      {/* Messages */}
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
              <div className="label">Jackpot Pool</div>
              <div className="value">{formatXLM(currentRoom.jackpot_pool)} XLM</div>
            </div>
            <div>
              <div className="label">Jackpot Number</div>
              <div className="value">{Number(currentRoom.jackpot_accumulated) % 100}</div>
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
          
          {currentRoom.last_winner && (
            <div className="notice success" style={{ marginTop: '1rem' }}>
              🏆 Winner: {currentRoom.last_winner}
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
            <div className="card highlight">
              <h3>⚡ Quickstart (Dev Mode)</h3>
              <p style={{ color: 'var(--color-ink-muted)', marginTop: '0.5rem', marginBottom: '1rem' }}>
                Auto-create room with Player 1 and auto-join with Player 2
              </p>
              <button
                onClick={handleQuickstart}
                disabled={loading}
                className="button primary"
                style={{ width: '100%' }}
              >
                {loading ? 'Starting...' : '⚡ Quickstart Game'}
              </button>
            </div>
          )}
          
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
                className="button primary"
                style={{ marginTop: '1rem', width: '100%' }}
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
                const canJoin = needsPlayer2 && room.player1.address !== userAddress;
                
                return (
                  <div key={id.toString()} className="list-item" style={{ marginBottom: '0.5rem' }}>
                    <div>
                      <div className="value">Room #{id.toString()}</div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--color-ink-muted)', marginTop: '0.25rem' }}>
                        Bet: {formatXLM(room.bet_amount)} XLM • Status: {status}
                      </div>
                    </div>
                    {canJoin && (
                      <button
                        onClick={() => handleJoinRoom(id)}
                        disabled={loading}
                        className="button success small"
                      >
                        Join
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      
      {/* Phase: Commit */}
      {roomPhase === 'commit' && currentRoom && isPlayer && (
        <div className="card">
          <h3>Commit Phase</h3>
          {!hasCommitted ? (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label className="label">Select Hand (0-5 fingers)</label>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {[0, 1, 2, 3, 4, 5].map((num) => (
                    <button
                      key={num}
                      onClick={() => setSelectedHand(num)}
                      style={{ 
                        flex: 1, 
                        padding: '1rem',
                        backgroundColor: selectedHand === num ? '#3b82f6' : '#374151',
                        color: 'white',
                        border: selectedHand === num ? '3px solid #60a5fa' : '1px solid #4b5563',
                        borderRadius: '0.5rem',
                        fontSize: '1.2rem',
                        fontWeight: selectedHand === num ? 'bold' : 'normal',
                        cursor: 'pointer',
                        transform: selectedHand === num ? 'scale(1.05)' : 'scale(1)',
                        transition: 'all 0.2s'
                      }}
                    >
                      {num} {selectedHand === num && '✓'}
                    </button>
                  ))}
                </div>
                <p style={{ marginTop: '0.5rem', color: '#9ca3af', fontSize: '0.9rem' }}>
                  Selected: <strong style={{ color: '#60a5fa' }}>{selectedHand}</strong>
                </p>
              </div>
              
              <div style={{ marginBottom: '1.5rem' }}>
                <label className="label">Select Parity Guess</label>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    onClick={() => setSelectedParity(1)}
                    style={{ 
                      flex: 1, 
                      padding: '1rem',
                      backgroundColor: selectedParity === 0 ? '#8b5cf6' : '#374151',
                      color: 'white',
                      border: selectedParity === 0 ? '3px solid #a78bfa' : '1px solid #4b5563',
                      borderRadius: '0.5rem',
                      fontSize: '1.1rem',
                      fontWeight: selectedParity === 0 ? 'bold' : 'normal',
                      cursor: 'pointer',
                      transform: selectedParity === 0 ? 'scale(1.05)' : 'scale(1)',
                      transition: 'all 0.2s'
                    }}
                    >
                    Odd (1) {selectedParity === 1 && '✓'}
                  </button>
                  <button
                    onClick={() => setSelectedParity(0)}
                    style={{ 
                      flex: 1, 
                      padding: '1rem',
                      backgroundColor: selectedParity === 1 ? '#8b5cf6' : '#374151',
                      color: 'white',
                      border: selectedParity === 1 ? '3px solid #a78bfa' : '1px solid #4b5563',
                      borderRadius: '0.5rem',
                      fontSize: '1.1rem',
                      fontWeight: selectedParity === 1 ? 'bold' : 'normal',
                      cursor: 'pointer',
                      transform: selectedParity === 1 ? 'scale(1.05)' : 'scale(1)',
                      transition: 'all 0.2s'
                    }}
                    >
                    Even (0) {selectedParity === 0 && '✓'}
                  </button>
                </div>
                <p style={{ marginTop: '0.5rem', color: '#9ca3af', fontSize: '0.9rem' }}>
                  Selected: <strong style={{ color: '#a78bfa' }}>{selectedParity === 1 ? 'Odd (1)' : 'Even (0)'}</strong>
                </p>
              </div>
              
              <div style={{ marginBottom: '1.5rem' }}>
                <label className="label">Guess Total (Sum of Both Hands)</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                    <button
                      key={num}
                      onClick={() => setSelectedTotalGuess(num)}
                      style={{
                        padding: '0.75rem',
                        backgroundColor: selectedTotalGuess === num ? '#10b981' : '#374151',
                        color: 'white',
                        border: selectedTotalGuess === num ? '3px solid #34d399' : '1px solid #4b5563',
                        borderRadius: '0.5rem',
                        fontSize: '1rem',
                        fontWeight: selectedTotalGuess === num ? 'bold' : 'normal',
                        cursor: 'pointer',
                        transform: selectedTotalGuess === num ? 'scale(1.05)' : 'scale(1)',
                        transition: 'all 0.2s'
                      }}
                    >
                      {num} {selectedTotalGuess === num && '✓'}
                    </button>
                  ))}
                </div>
                <p style={{ marginTop: '0.5rem', color: '#9ca3af', fontSize: '0.9rem' }}>
                  Selected: <strong style={{ color: '#34d399' }}>{selectedTotalGuess}</strong>
                </p>
              </div>
              
              <div className="notice info" style={{ marginBottom: '1rem' }}>
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
                className="button primary"
                style={{ width: '100%' }}
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
      
      {/* Phase: Settled (Results) */}
      {roomPhase === 'settled' && currentRoom && (
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎉</div>
          <h2 style={{ marginBottom: '2rem' }}>Game Complete!</h2>
          
          {/* Winner Info */}
          {currentRoom.last_winner ? (
            <div style={{ 
              marginBottom: '2rem', 
              padding: '1.5rem', 
              backgroundColor: currentRoom.last_winner === userAddress ? '#10b981' : '#3b82f6', 
              borderRadius: '0.5rem',
              color: 'white'
            }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                {currentRoom.last_winner === userAddress ? '🏆 YOU WON! 🏆' : '🎮 Winner'}
              </div>
              <div style={{ 
                fontFamily: 'monospace', 
                fontSize: '0.85rem',
                wordBreak: 'break-all',
                opacity: 0.9
              }}>
                {currentRoom.last_winner}
              </div>
              {currentRoom.last_winner === userAddress && (
                <div style={{ marginTop: '0.75rem', fontSize: '1.2rem', fontWeight: 'bold' }}>
                  🎊 Congratulations! 🎊
                </div>
              )}
            </div>
          ) : (
            <div style={{ 
              marginBottom: '2rem', 
              padding: '1.5rem', 
              backgroundColor: '#6b7280', 
              borderRadius: '0.5rem',
              color: 'white'
            }}>
              <div style={{ fontSize: '1.2rem' }}>🤝 Draw / No Winner</div>
            </div>
          )}
          
          {/* Game Details */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr', 
            gap: '1rem', 
            marginBottom: '2rem',
            textAlign: 'left'
          }}>
            <div style={{ 
              padding: '1rem', 
              backgroundColor: currentRoom.player1.address === userAddress ? '#1e40af' : '#1f2937',
              borderRadius: '0.5rem',
              border: currentRoom.last_winner === currentRoom.player1.address ? '3px solid #fbbf24' : 'none'
            }}>
              <div style={{ 
                color: '#9ca3af', 
                fontSize: '0.9rem',
                marginBottom: '0.25rem'
              }}>
                Player 1 {currentRoom.player1.address === userAddress && '(You)'}
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#60a5fa' }}>
                {typeof currentRoom.player1.revealed_hand === 'number' 
                  ? currentRoom.player1.revealed_hand 
                  : '?'}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                {typeof currentRoom.player1.revealed_parity === 'number'
                  ? (currentRoom.player1.revealed_parity === 1 ? '📊 Guessed Odd' : '📊 Guessed Even')
                  : 'Not revealed'}
              </div>
            </div>
            
            <div style={{ 
              padding: '1rem', 
              backgroundColor: currentRoom.player2?.address === userAddress ? '#1e40af' : '#1f2937',
              borderRadius: '0.5rem',
              border: currentRoom.last_winner === currentRoom.player2?.address ? '3px solid #fbbf24' : 'none'
            }}>
              <div style={{ 
                color: '#9ca3af', 
                fontSize: '0.9rem',
                marginBottom: '0.25rem'
              }}>
                Player 2 {currentRoom.player2?.address === userAddress && '(You)'}
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#a78bfa' }}>
                {typeof currentRoom.player2?.revealed_hand === 'number'
                  ? currentRoom.player2.revealed_hand 
                  : '?'}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                {typeof currentRoom.player2?.revealed_parity === 'number'
                  ? (currentRoom.player2.revealed_parity === 1 ? '📊 Guessed Odd' : '📊 Guessed Even')
                  : 'Not revealed'}
              </div>
            </div>
            
            <div style={{ 
              padding: '1.25rem', 
              backgroundColor: '#0f172a', 
              borderRadius: '0.5rem',
              gridColumn: '1 / -1',
              border: '2px solid #fbbf24'
            }}>
              <div style={{ color: '#fbbf24', fontSize: '0.9rem', fontWeight: 'bold' }}>🎲 Total Fingers</div>
              <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#fbbf24', marginTop: '0.5rem' }}>
                {(() => {
                  const p1 = typeof currentRoom.player1.revealed_hand === 'number' ? currentRoom.player1.revealed_hand : 0;
                  const p2 = typeof currentRoom.player2?.revealed_hand === 'number' ? currentRoom.player2.revealed_hand : 0;
                  return p1 + p2;
                })()}
              </div>
              <div style={{ fontSize: '1rem', color: '#fbbf24', marginTop: '0.5rem', fontWeight: 'bold' }}>
                {(() => {
                  const p1 = typeof currentRoom.player1.revealed_hand === 'number' ? currentRoom.player1.revealed_hand : 0;
                  const p2 = typeof currentRoom.player2?.revealed_hand === 'number' ? currentRoom.player2.revealed_hand : 0;
                  const total = p1 + p2;
                  return total % 2 === 0 ? '✅ EVEN' : '✅ ODD';
                })()}
              </div>
            </div>
          </div>
          
          <button
            onClick={handleStartNewGame}
            className="button primary"
            style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }}
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
    </div>
  );
}
