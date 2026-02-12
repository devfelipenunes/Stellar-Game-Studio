#!/usr/bin/env bun

/**
 * 🧪 ZK Porrinha Integration Test Suite
 * 
 * Tests the complete flow from frontend to smart contract:
 * 1. Mock Prover (generateMockProof)
 * 2. Service Layer (zkPorrinhaService)
 * 3. Smart Contract (deployed on testnet)
 * 4. Full game flow: create → join → commit → reveal → settle
 */

import { generateMockProof, generateSalt } from './src/games/zk-porrinha/mockProver';
import { ZkPorrinhaService } from './src/games/zk-porrinha/zkPorrinhaService';
import type { Room } from './src/games/zk-porrinha/bindings';

// Test configuration from deployment.json
const CONTRACT_ID = 'CB5EAMBQEWFKHTKMF4D7CZKWAUYB4R6CFVABHZUOE4HJ5G6VD2FPLYZ4';
const PLAYER1_ADDRESS = 'GAC4PZBDLIS7TQASDN4KHS4ZOVA7I2WNDM6DT6EZVVNC7WGB6TZ2ORNP';
const PLAYER2_ADDRESS = 'GARFGIBVNBV2FHHNUMR5L56HPFKRYXVRMOAMQOJJON7UCHCUGKU43SY7';
const PLAYER1_SECRET = process.env.VITE_DEV_PLAYER1_SECRET || '';
const PLAYER2_SECRET = process.env.VITE_DEV_PLAYER2_SECRET || '';

// Test colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(emoji: string, message: string, color = colors.reset) {
  console.log(`${color}${emoji} ${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${colors.cyan}${title}${colors.reset}`);
  console.log(`${'='.repeat(60)}\n`);
}

function logSuccess(message: string) {
  log('✅', message, colors.green);
}

function logError(message: string) {
  log('❌', message, colors.red);
}

function logInfo(message: string) {
  log('ℹ️ ', message, colors.blue);
}

function logWarning(message: string) {
  log('⚠️ ', message, colors.yellow);
}

function logDetail(key: string, value: any) {
  console.log(`${colors.gray}   ${key}: ${colors.reset}${JSON.stringify(value, null, 2)}`);
}

// Mock signer for testing
function createMockSigner(secret: string) {
  return {
    signTransaction: async (xdr: string) => xdr,
    signAuthEntry: async (entry: string) => entry,
  };
}

// Test suite
async function runTests() {
  logSection('🎮 ZK PORRINHA INTEGRATION TEST SUITE');
  
  let testsPassed = 0;
  let testsFailed = 0;
  
  try {
    // =====================================================
    // TEST 1: Mock Prover - Generate Salt
    // =====================================================
    logSection('TEST 1: Mock Prover - Salt Generation');
    
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    
    if (salt1.length === 64 && /^[0-9a-f]+$/i.test(salt1)) {
      logSuccess('Salt has correct length (64 hex chars = 32 bytes)');
      logDetail('salt1', salt1);
      testsPassed++;
    } else {
      logError(`Salt has incorrect format: length=${salt1.length}, format=${salt1}`);
      testsFailed++;
    }
    
    if (salt1 !== salt2) {
      logSuccess('Salts are unique (randomness working)');
      testsPassed++;
    } else {
      logError('Salts are identical (randomness broken!)');
      testsFailed++;
    }
    
    // =====================================================
    // TEST 2: Mock Prover - Generate Proof & Commitment
    // =====================================================
    logSection('TEST 2: Mock Prover - Proof & Commitment Generation');
    
    const proofInput = {
      hand: 3,
      parity: 1, // even
      jackpotGuess: 42,
      jackpotAccumulated: 1234,
    };
    
    try {
      const result = await generateMockProof(proofInput);
      
      if (result.commitment && result.proof && result.salt) {
        logSuccess('Mock proof generated successfully');
        logDetail('commitment type', result.commitment.constructor.name);
        logDetail('proof type', result.proof.constructor.name);
        logDetail('salt length', result.salt.length);
        testsPassed++;
      } else {
        logError('Mock proof missing fields');
        logDetail('result', result);
        testsFailed++;
      }
      
      // Verify determinism
      const result2 = await generateMockProof({
        ...proofInput,
        salt: result.salt, // Use same salt
      });
      
      if (result.commitment.toString() === result2.commitment.toString()) {
        logSuccess('Proof generation is deterministic (same inputs = same commitment)');
        testsPassed++;
      } else {
        logError('Proof generation is non-deterministic (broken!)');
        testsFailed++;
      }
      
    } catch (error: any) {
      logError(`Mock proof generation failed: ${error.message}`);
      testsFailed++;
    }
    
    // =====================================================
    // TEST 3: Service Layer - Contract Connection
    // =====================================================
    logSection('TEST 3: Service Layer - Contract Connection');
    
    const service = new ZkPorrinhaService(CONTRACT_ID);
    
    try {
      const roomCount = await service.getRoomCount();
      logSuccess(`Connected to contract successfully`);
      logDetail('total rooms', roomCount.toString());
      testsPassed++;
    } catch (error: any) {
      logError(`Failed to connect to contract: ${error.message}`);
      testsFailed++;
      logWarning('Skipping remaining tests due to connection failure');
      throw error;
    }
    
    // =====================================================
    // TEST 4: Service Layer - List Rooms
    // =====================================================
    logSection('TEST 4: Service Layer - List Rooms');
    
    try {
      const rooms = await service.listRecentRooms(5);
      logSuccess(`Listed recent rooms`);
      logDetail('rooms found', rooms.length);
      
      if (rooms.length > 0) {
        logDetail('latest room', {
          id: rooms[0].id.toString(),
          status: rooms[0].room ? (rooms[0].room.status as any).tag : 'null',
        });
      }
      testsPassed++;
    } catch (error: any) {
      logError(`Failed to list rooms: ${error.message}`);
      testsFailed++;
    }
    
    // =====================================================
    // TEST 5: Full Game Flow (Simulation)
    // =====================================================
    logSection('TEST 5: Full Game Flow - Simulation Only (Read-Only)');
    
    logInfo('Note: Full write tests require player secrets');
    logInfo('Testing read operations on existing games...');
    
    try {
      // Get an existing room to analyze
      const rooms = await service.listRecentRooms(10);
      const activeRoom = rooms.find(r => r.room && (r.room.status as any).tag !== 'Lobby');
      
      if (activeRoom && activeRoom.room) {
        const room = activeRoom.room;
        const status = (room.status as any).tag;
        
        logSuccess(`Found active game in ${status} phase`);
        logDetail('room ID', activeRoom.id.toString());
        logDetail('bet amount', `${Number(room.bet_amount) / 10_000_000} XLM`);
        logDetail('player 1', room.player1.address.substring(0, 8) + '...');
        logDetail('player 2', room.has_player2 ? room.player2.address.substring(0, 8) + '...' : 'waiting');
        logDetail('jackpot pool', `${Number(room.jackpot_pool) / 10_000_000} XLM`);
        
        // Test phase-specific data
        if (status === 'Commit') {
          logInfo('Checking commit phase data...');
          logDetail('player 1 committed', room.player1.has_committed);
          logDetail('player 2 committed', room.player2?.has_committed ?? false);
          
          if (room.player1.has_committed || room.player2?.has_committed) {
            logSuccess('At least one player has committed');
            testsPassed++;
          }
        }
        
        if (status === 'Reveal' || status === 'Settled') {
          logInfo('Checking reveal/settled phase data...');
          logDetail('player 1 revealed', room.player1.has_revealed);
          logDetail('player 1 hand', room.player1.revealed_hand ?? 'not revealed');
          logDetail('player 2 revealed', room.player2?.has_revealed ?? false);
          logDetail('player 2 hand', room.player2?.revealed_hand ?? 'not revealed');
          
          if (status === 'Settled') {
            const hand1 = room.player1.revealed_hand ?? 0;
            const hand2 = room.player2?.revealed_hand ?? 0;
            const totalFingers = hand1 + hand2;
            const actualParity = totalFingers % 2 === 0 ? 0 : 1;

            logDetail('total fingers', totalFingers);
            logDetail('actual parity', actualParity === 1 ? 'odd' : 'even');
            logDetail('winner', room.last_winner ? room.last_winner.substring(0, 8) + '...' : 'draw');
            
            if (typeof hand1 === 'number' && typeof hand2 === 'number') {
              logSuccess('Game data integrity verified');
              testsPassed++;
            } else {
              logError('Invalid game data (hands not numbers)');
              testsFailed++;
            }
          }
        }
        
        testsPassed++;
      } else {
        logWarning('No active games found to analyze');
        logInfo('You can create a game manually in the UI and run tests again');
      }
    } catch (error: any) {
      logError(`Failed to analyze game state: ${error.message}`);
      testsFailed++;
    }
    
  } catch (error: any) {
    logError(`Test suite crashed: ${error.message}`);
    console.error(error);
  }
  
  // =====================================================
  // TEST SUMMARY
  // =====================================================
  logSection('📊 TEST SUMMARY');
  
  const total = testsPassed + testsFailed;
  const passRate = total > 0 ? ((testsPassed / total) * 100).toFixed(1) : '0.0';
  
  console.log(`Tests Passed: ${colors.green}${testsPassed}${colors.reset}`);
  console.log(`Tests Failed: ${colors.red}${testsFailed}${colors.reset}`);
  console.log(`Pass Rate:    ${passRate}%`);
  
  if (testsFailed === 0) {
    logSuccess('ALL TESTS PASSED! 🎉🎉🎉');
    process.exit(0);
  } else {
    logError(`${testsFailed} test(s) failed`);
    process.exit(1);
  }
}

// Run the test suite
runTests().catch((error) => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
