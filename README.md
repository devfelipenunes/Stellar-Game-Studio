# 🎲 ZK-Porrinha

> *"Luck alone is not enough. You also need a lot of math."*

**ZK-Porrinha** brings one of Brazil's most beloved bar games onto the Stellar blockchain — powered by Zero-Knowledge proofs and Protocol 25 (X-Ray) native cryptographic primitives.

---

## 🍺 The Game: A Carioca Legend

In the late 19th century, at the rowdy tables of the botequins of Lapa and the suburbs of Rio de Janeiro, one of the greatest traditions of carioca culture was born: **porrinha**.

Descended from the Roman game *Morra* — played by Caesar's soldiers between battles — the game was brought to Brazil by Italian immigrants and transformed into something uniquely Brazilian. Like samba and capoeira, it was adopted, given ginga, and made entirely our own. Matchsticks replaced fingers, bar tables became arenas, and the stakes were always the same: **whoever loses pays the bill**.

The rules are deceptively simple. Each player hides 0 to 3 matchsticks in a closed fist. Simultaneously, everyone reveals their hand. The player who correctly guesses the **total** across all fists wins. A hand with zero matchsticks is called **"lona"** — and you can't open with lona on the first round.

What makes porrinha great is that it's *equal parts luck, bluff, and probability*. You read your opponent's face. You calculate. You lie with your eyes. It's the kind of game where a mathematics professor and a bricklayer sit across from each other on equal terms, because neither can see inside the other's fist.

**That simultaneous hidden-information problem is exactly what ZK-Porrinha solves on-chain.**

---

## 🔐 The Problem: Blockchain Can't Hide Hands

Traditional blockchain games have a fundamental tension with hidden information:

```
Player 1 submits hand = 3 → ❌ Player 2 sees it on-chain and can respond optimally
```

A naive hash approach gets closer but still falls short:

```
Player 1 → hash(3, salt) → stored on-chain
Player 2 → hash(2, salt) → stored on-chain
Problem: No proof that "3" is actually valid. Could be hand = 100.
```

ZK-Porrinha solves both problems simultaneously.

---

## ✅ The ZK Solution

```
Player 1 → ZK proof: "my hand ∈ [0,3], my guess ∈ [0,6], commitment is valid"
Player 2 → ZK proof: same guarantees
Both proofs verified on-chain → Hands revealed simultaneously → Winner computed deterministically
```

**No trust required. No oracle. No arbitration.**

The circuit enforces the rules of porrinha at the cryptographic level:

```noir
// circuits/zk-porrinha/src/main.nr
assert(hand1 <= 3);              // Can't hide more than 3 matchsticks
assert(hand2 <= 3);
assert(parity1 <= 1);            // Guess: 0 = even total, 1 = odd total
assert(parity2 <= 1);
assert(exact1 <= 6);             // Exact sum guess: max is 3+3=6
assert(exact2 <= 6);

// Commitment binds hand + guesses + salt together
let commitment = poseidon2_permutation([hand, parity, exact_guess, salt], 4);
```

Once committed, a player **cannot** change their hand or their guesses after seeing the opponent's move. The Poseidon2 hash seals everything together.

---

## 🏗️ Architecture

```
contracts/
├── zk-porrinha/          # Game logic, room state, payout logic
└── noir-verifier/        # UltraHonk proof verifier (Soroban native)

circuits/
└── zk-porrinha/
    └── src/main.nr       # Noir circuit — the heart of the game
```

### Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | Stellar (Soroban) |
| ZK Proving System | UltraHonk (Barretenberg) |
| Circuit Language | Noir v1.0.0-beta.9 |
| Hash Function | Poseidon2 (ZK-friendly) |
| Verifier | `ultrahonk-soroban-verifier` (on-chain) |
| Protocol | Stellar Protocol 25 (X-Ray) |

---

## 🔁 Game Flow

### Phase 1 — Create Room
```rust
create_room(bet_amount) → room_id
// Player 1 deposits XLM and waits for an opponent
```

### Phase 2 — Join Room
```rust
join_room(room_id, player2)
// Player 2 matches the bet — game starts
```

### Phase 3 — Commit (Both Players, Independently)
```rust
// Each player generates their ZK commitment locally:
// commitment = Poseidon2(hand, parity_guess, exact_guess, salt)

commit(room_id, commitment, parity_guess, exact_guess)
// ✅ Hand stays private. Guesses are sealed. No going back.
```

### Phase 4 — Resolve (Anyone can call, once both committed)
```rust
resolve(room_id, proof, total_sum, nullifier)
// ✅ ZK proof verified on-chain by ultrahonk-soroban-verifier
// ✅ total_sum = hand1 + hand2, proven correct
// ✅ Payout distributed automatically
// ✅ Nullifier prevents replay
```

---

## 💰 Payout Logic

The total pot is split between two pools:

| Pool | Share | Condition |
|---|---|---|
| Parity Pool | 80% | Goes to whoever correctly guessed even/odd |
| Jackpot | 20% | Accumulated until someone guesses the exact sum |

**Parity:** If both guess right or both guess wrong, the pool is split evenly.

**Jackpot:** If no one hits the exact sum, the 20% accumulates. When someone finally hits it, they claim the entire accumulated jackpot. If both players hit exact on the same round, the jackpot is split.

This creates interesting strategic depth — do you prioritize a safe parity guess, or swing for the exact sum and the jackpot?

---

## 🔬 Technical Deep Dive

### Commitment Scheme

The Poseidon2 permutation binds four values together into a single 32-byte field element:

```noir
let commitment = poseidon2_permutation(
    [hand as Field, parity_guess as Field, exact_guess as Field, salt],
    4
)[0];
```

- **Collision-resistant**: Can't find two inputs with the same output
- **ZK-friendly**: Efficient inside arithmetic circuits (much cheaper than SHA-256)
- **Salt**: Prevents brute-force enumeration (only 7 possible hands, but 2^128 salts)

The commitment is published on-chain during `commit()`. The actual values are revealed only inside the ZK proof during `resolve()`, where the circuit checks that the private inputs hash to the public commitment.

### UltraHonk Verification

Proof verification is performed on-chain by the `noir-verifier` contract using the `ultrahonk-soroban-verifier` library:

```rust
// contracts/noir-verifier/src/lib.rs
use ultrahonk_soroban_verifier::verifier::UltraHonkVerifier;

let verified = UltraHonkVerifier::verify(&env, &proof, &public_inputs, &vk_bytes);
```

Public inputs passed to the verifier (in order):
1. `h1` — Player 1's commitment
2. `h2` — Player 2's commitment  
3. `parity1` — Player 1's parity guess
4. `parity2` — Player 2's parity guess
5. `exact1` — Player 1's exact sum guess
6. `exact2` — Player 2's exact sum guess
7. `total_sum` — The proven sum of both hands

### Anti-Replay

Each `resolve()` call requires a unique `nullifier` (32 bytes). Once used, it's stored on-chain and any replay attempt returns `NullifierUsed`.

---

## 🔑 Verification Key Management

The Verification Key (VK) is the cryptographic fingerprint of the circuit. It must be regenerated whenever the Noir circuit changes.

### Regenerating the VK

```bash
# 1. Compile inside Docker (glibc compatibility)
docker build -t noir-compiler -f dockerfile-vk .
docker run --rm -it -v $(pwd)/circuits/zk-porrinha:/circuit noir-compiler bash

# 2. Inside container:
nargo compile
bb write_vk -b target/zk_porrinha.json -o target --scheme ultra_honk --oracle_hash keccak

# 3. Compute new hash
sha256sum circuits/zk-porrinha/target/vk

# 4. Update both constants in Rust:
#    contracts/zk-porrinha/src/lib.rs   → VK_HASH
#    contracts/noir-verifier/src/lib.rs → VK_HASH_EXPECTED

# 5. Rebuild and redeploy
bun run build noir-verifier zk-porrinha
bun run deploy noir-verifier zk-porrinha
```

> ⚠️ A mismatch between the local VK hash and the deployed constant means all proofs will be rejected on-chain — even perfectly valid ones. The deploy script validates this automatically.

---

## 🛠️ Building & Testing

### Prerequisites

- Rust + `wasm32v1-none` target
- Stellar CLI
- Nargo v1.0.0-beta.9
- Barretenberg (bb) v0.87.0
- Bun

### Build

```bash
stellar contract build
```

### Test the Noir circuit

```bash
cd circuits/zk-porrinha
nargo test
```

All tests:

| Test | Expected |
|---|---|
| `test_valid_round_with_guesses` | ✅ Pass |
| `test_both_zero` | ✅ Pass |
| `test_maximum_sum` | ✅ Pass |
| `test_different_salts_same_hand` | ✅ Pass |
| `test_hand_out_of_range` | ✅ Fail (should_fail) |
| `test_tampered_hand_fails` | ✅ Fail (should_fail) |
| `test_tampered_parity_fails` | ✅ Fail (should_fail) |
| `test_tampered_exact_guess_fails` | ✅ Fail (should_fail) |
| `test_swapped_commitments` | ✅ Fail (should_fail) |
| `test_parity_out_of_range` | ✅ Fail (should_fail) |
| `test_exact_guess_over_max` | ✅ Fail (should_fail) |

### End-to-end proof test

```bash
# Generate witness + proof
cd circuits/zk-porrinha
nargo execute witness
bb prove -b target/zk_porrinha.json -w target/witness.gz -o target \
  --scheme ultra_honk --oracle_hash keccak

# Verify locally
bb verify -k target/vk -p target/proof --scheme ultra_honk --oracle_hash keccak

# Run full on-chain integration test
bun run scripts/test-real-prover.ts
```

---

## 📋 Contract Reference

### `create_room(player, bet_amount) → u64`
Creates a new game room. Player deposits XLM. Returns `room_id`.

### `join_room(room_id, player)`
Second player joins and matches the bet. Starts the session and notifies GameHub.

### `commit(room_id, player, commitment, parity, exact_guess)`
Player submits their sealed commitment. Commitment binds hand + guesses + salt via Poseidon2.

### `resolve(room_id, proof, total_sum, nullifier)`
Verifies the UltraHonk ZK proof on-chain. Distributes payouts. Notifies GameHub. Burns nullifier.

### `get_room(room_id) → Room`
Returns the current state of a room.

### `get_jackpot() → i128`
Returns the current accumulated jackpot balance.

---

## ❗ Error Codes

| Code | Name | Description |
|---|---|---|
| 1 | `RoomNotFound` | No room with this ID |
| 2 | `NotPlayer` | Caller is not in this game |
| 3 | `InvalidPhase` | Action not allowed in current phase |
| 4 | `AlreadyCommitted` | Player already submitted commitment |
| 5 | `InvalidProof` | ZK proof verification failed |
| 6 | `NullifierUsed` | This proof has already been used |
| 7 | `InvalidBet` | Bet amount must be positive |
| 11 | `SelfPlay` | Can't play against yourself |

---

## 🎯 Why This Matters

Porrinha has been played in carioca bars for over a century. Generations of people have settled debates, avoided paying for beers, and spent hours at bar tables with a handful of matchsticks. The game works because both players reveal simultaneously — you can't cheat what you can't see.

On a public blockchain, *everything* is visible. ZK-Porrinha restores that simultaneous reveal using cryptographic proofs instead of trust. The same game that Roman soldiers played between battles, that Italian immigrants brought to Brazilian bars, that became a fixture of Rio's street culture — now runs on Stellar, with no referee and no possibility of cheating.

**A game of matchsticks, proven in zero knowledge.**

---

## 🔗 Deployed Contracts (Stellar Testnet)

| Contract | Address |
|---|---|
| ZK-Porrinha | `CBLO…7QSQ` |
| Noir Verifier | `CBBG…LNN4` |
| GameHub | `CB4V…EMYG` |

> Replace with full contract IDs after final deploy.

---

## 📜 License

MIT