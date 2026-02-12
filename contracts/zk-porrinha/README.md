# ZK-Porrinha Game

A two-player Zero-Knowledge game on Stellar demonstrating Protocol 25 (X-Ray) cryptographic primitives for fair, hidden-information gameplay.

## 🎯 Overview

**Porrinha** is a traditional Brazilian hand game where players simultaneously reveal a number of fingers (0-5) and guess the total. This implementation uses **Zero-Knowledge proofs** to solve the classic "simultaneous move" problem in blockchain games.

**The Challenge:**
- Players must commit simultaneously (no front-running)
- Commitments must be binding (can't change after seeing opponent)
- Values must be provably valid (can't submit hand=10)
- Resolution must be fair (deterministic on-chain computation)

**The ZK Solution:**
- ✅ **Commit-Reveal Protocol**: Players submit ZK proofs that hide their hand but prove validity
- ✅ **BN254 Verification**: Uses Stellar Protocol 25 native elliptic curve operations
- ✅ **Poseidon2 Hashing**: ZK-friendly hash function for commitments
- ✅ **Noir Circuits**: Groth16 proofs generated with Barretenberg, verified on-chain

## 🔐 How ZK Makes This Fair

### Traditional Approach (Broken)
```
Player 1 → Submit hand=3 → ❌ Player 2 sees it and can respond optimally
```

### Naive Hash Approach (Still Broken)
```
Player 1 → hash(3, salt) → Player 2 → hash(2, salt)
Problem: No proof that "3" is valid (could be 100)
```

### ZK Approach (This Implementation)
```
Player 1 → ZK proof of valid hand → Commitment stored → Player 2 → ZK proof
Both proofs verified → Hands revealed simultaneously → Winner computed on-chain
```

**ZK Circuit Constraints (circuits/zk-porrinha/src/main.nr):**
```noir
assert(hand_value <= 5);           // Can't submit invalid hand
assert(parity_guess <= 1);         // Must guess odd or even
assert(total_guess <= 10);         // Total can't exceed 10
assert(jackpot_guess == secret);   // Jackpot commitment binding
```

## Features

- **Zero-Knowledge Proofs**: Noir circuits with Groth16 proving system
- **Protocol 25 Native**: BN254 curve + Poseidon2 hash (no external verifiers needed)
- **Commit-Reveal**: Provably fair simultaneous moves
- **Hidden Information**: Hands remain private until both players commit
- **Verifiable Computation**: All game logic computed deterministically on-chain
- **Jackpot Mechanism**: Accumulated pool with verifiable random distribution
- **Token Distribution**: 80% to winner, 20% to jackpot accumulation

## 🏗️ Architecture

### Contracts
```
contracts/zk-porrinha/    ← Game logic + state management
contracts/noir-verifier/  ← BN254 proof verification (Soroban native)
circuits/zk-porrinha/     ← Noir circuit definition
```

### Game Flow

**Phase 1: Create Room**
```rust
create_room(bet_amount, token) → room_id
```

**Phase 2: Commit (Both Players)**
```rust
// Player generates proof locally (Noir.js + Barretenberg WASM)
proof = generate_proof(hand, parity, total_guess, jackpot_guess, salt)

// Submit commitment + proof on-chain
commit_hand(room_id, commitment, proof, hand, parity, total_guess, jackpot_hit)
// ✅ Proof verified but hand stays private
```

**Phase 3: Finalize**
```rust
finalize_round(room_id)
// ✅ Hands revealed simultaneously
// ✅ Real total = hand1 + hand2
// ✅ Real parity = total % 2
// ✅ Winner determined on-chain
// ✅ Tokens distributed fairly
```

## 🔬 Technical Deep Dive

### Why This Works (Cryptographically)

**1. Commitment Binding**
```noir
// In circuits/zk-porrinha/src/main.nr
let commitment = poseidon2_permutation([
    hand_value,
    parity_guess,
    combined_guess,
    salt
], 4)
```
- Poseidon2 is collision-resistant → can't find two inputs with same output
- Salt prevents rainbow table attacks
- Commitment published before opponent moves → binding

**2. Proof of Validity**
```noir
assert(hand_value <= 5);  // Range proof
assert(parity_guess <= 1);
assert(total_guess <= 10);
```
- Circuit only generates valid proof if constraints satisfied
- Verifier checks proof on-chain (BN254 pairing)
- Impossible to submit hand=100 (proof generation fails)

**3. Simultaneous Reveal**
```rust
// In contracts/zk-porrinha/src/lib.rs
pub fn finalize_round(env: Env, room_id: u32) {
    require!(p1.has_committed && p2.has_committed);
    
    // Revealed values come from verified proofs
    let hand1 = p1.revealed_hand.unwrap();
    let hand2 = p2.revealed_hand.unwrap();
    
    let real_total = hand1 + hand2;
    // ... determine winner
}
```
- Values revealed only when BOTH committed
- Values come from ZK proof public outputs
- No way to see opponent's move first

### Protocol 25 Integration

**BN254 Operations (contracts/noir-verifier/src/lib.rs):**
```rust
pub fn verify(env: Env, proof: Bytes, public_inputs: Vec<BytesN<32>>) -> bool {
    // Uses Soroban's native BN254 pairing check
    env.crypto().bn254_verify_proof(
        vk_alpha_g1, vk_beta_g2, vk_gamma_g2, vk_delta_g2,
        vk_ic, proof_points, public_inputs
    )
}
```

**Why This Matters:**
- ✅ Native Soroban ops (not external oracle)
- ✅ Gas-efficient verification
- ✅ Same curve used by Noir/Barretenberg
- ✅ Battle-tested cryptography (Groth16)

## Contract Methods

### `start_game`
Start a new game between two players.

**Parameters:**
- `player1: Address` - First player's address
- `player2: Address` - Second player's address

**Returns:** `u32` - The game ID

**Auth:** Requires authentication from both players

### `make_guess`
Make a guess for a game.

**Parameters:**
- `game_id: u32` - The ID of the game
- `player: Address` - Address of the player making the guess
- `guess: u32` - The guessed number (must be 1-10)

**Returns:** `Result<(), Error>`

**Auth:** Requires authentication from the guessing player

### `reveal_winner`
Reveal the winner after both players have guessed.

**Parameters:**
- `game_id: u32` - The ID of the game

**Returns:** `Result<Address, Error>` - Address of the winning player

**Note:** Can only be called after both players have made their guesses. If both players are equidistant from the winning number, player1 wins.

### `get_game`
Get the current state of a game.

**Parameters:**
- `game_id: u32` - The ID of the game

**Returns:** `Result<Game, Error>` - The game state

## Game Flow

1. Two players call `start_game` to create a new game
2. A random number between 1-10 is generated using PRNG
3. Each player calls `make_guess` with their guess (1-10)
4. Once both players have guessed, anyone can call `reveal_winner`
5. The winner is determined by who guessed closest to the random number
6. The game is marked as ended and the winner is recorded

## Events

- **GameStartedEvent**: Emitted when a new game begins
  - `game_id: u32`
  - `player1: Address`
  - `player2: Address`

- **GuessMadeEvent**: Emitted when a player makes a guess
  - `game_id: u32`
  - `player: Address`
  - `guess: u32`

- **WinnerRevealedEvent**: Emitted when the winner is revealed
  - `game_id: u32`
  - `winner: Address`
  - `winning_number: u32`

## Error Codes

- `GameNotFound` (1): The specified game ID doesn't exist
- `GameAlreadyStarted` (2): Game has already been started
- `NotPlayer` (3): Caller is not a player in this game
- `AlreadyGuessed` (4): Player has already made their guess
- `BothPlayersNotGuessed` (5): Cannot reveal winner until both players guess
- `GameAlreadyEnded` (6): Game has already ended

## Building

```bash
stellar contract build
```

Output: `target/wasm32v1-none/release/number_guess.wasm`

## Testing

```bash
cargo test
```

## Example Usage

```rust
use soroban_sdk::{Address, Env};

// Create game
let game_id = contract.start_game(&player1, &player2);

// Players make guesses
contract.make_guess(&game_id, &player1, &5);
contract.make_guess(&game_id, &player2, &7);

// Reveal winner
let winner = contract.reveal_winner(&game_id);
```

## Technical Details

- **PRNG Warning**: The contract uses Soroban's PRNG which is unsuitable for generating secrets or high-stakes applications. It's perfectly fine for game mechanics where the random number is revealed immediately after use.
- **Storage**: Uses persistent storage for game state
- **Gas Optimization**: Minimal storage footprint per game
