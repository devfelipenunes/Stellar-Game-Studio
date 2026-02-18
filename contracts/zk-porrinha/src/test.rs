#![cfg(test)]

use crate::{ZkPorrinhaContract, ZkPorrinhaContractClient, RoomStatus, TTL_LEDGERS};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env, Vec};

// ── Mock contracts ────────────────────────────────────────────────────────────

#[contract]
pub struct MockGameHub;
#[contractimpl]
impl MockGameHub {
    pub fn start_game(
        _env: Env, _game_id: Address, _session_id: u32,
        _player1: Address, _player2: Address, _p1: i128, _p2: i128,
    ) {}
    pub fn end_game(_env: Env, _session_id: u32, _player1_won: bool) {}
}

/// Accepts any non-empty proof with >= 2 valid 32-byte public inputs.
#[contract]
pub struct MockVerifier;
#[contractimpl]
impl MockVerifier {
    pub fn verify(_env: Env, proof: Bytes, public_inputs: Vec<BytesN<32>>) -> bool {
        proof.len() > 0 && public_inputs.len() >= 2
    }
}

/// Always rejects proofs.
#[contract]
pub struct MockVerifierReject;
#[contractimpl]
impl MockVerifierReject {
    pub fn verify(_env: Env, _proof: Bytes, _pi: Vec<BytesN<32>>) -> bool { false }
}

/// Silently succeeds token transfers.
#[contract]
pub struct MockToken;
#[contractimpl]
impl MockToken {
    pub fn transfer(_env: Env, _from: Address, _to: Address, _amount: i128) {}
}

/// Always panics on transfer.
#[contract]
pub struct MockTokenFail;
#[contractimpl]
impl MockTokenFail {
    pub fn transfer(_env: Env, _from: Address, _to: Address, _amount: i128) {
        panic!("mock token transfer failure");
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn ledger_info_default() -> soroban_sdk::testutils::LedgerInfo {
    soroban_sdk::testutils::LedgerInfo {
        timestamp: 0,
        protocol_version: 25,
        sequence_number: 1,
        network_id: Default::default(),
        base_reserve: 1,
        // max_entry_ttl must be > TTL_LEDGERS so extend_ttl can succeed
        min_temp_entry_ttl: TTL_LEDGERS,
        min_persistent_entry_ttl: TTL_LEDGERS,
        max_entry_ttl: TTL_LEDGERS * 2,
    }
}

fn setup() -> (Env, ZkPorrinhaContractClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set(ledger_info_default());
    let hub      = env.register(MockGameHub, ());
    let verifier = env.register(MockVerifier, ());
    let token    = env.register(MockToken, ());
    let admin    = Address::generate(&env);
    let cid = env.register(ZkPorrinhaContract, (&admin, &hub, &verifier, &token));
    let client = ZkPorrinhaContractClient::new(&env, &cid);
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    (env, client, p1, p2)
}

fn setup_reject() -> (Env, ZkPorrinhaContractClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set(ledger_info_default());
    let hub      = env.register(MockGameHub, ());
    let verifier = env.register(MockVerifierReject, ());
    let token    = env.register(MockToken, ());
    let admin    = Address::generate(&env);
    let cid = env.register(ZkPorrinhaContract, (&admin, &hub, &verifier, &token));
    let client = ZkPorrinhaContractClient::new(&env, &cid);
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    (env, client, p1, p2)
}

fn setup_token_fail() -> (Env, ZkPorrinhaContractClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set(ledger_info_default());
    let hub      = env.register(MockGameHub, ());
    let verifier = env.register(MockVerifier, ());
    let token    = env.register(MockTokenFail, ());
    let admin    = Address::generate(&env);
    let cid = env.register(ZkPorrinhaContract, (&admin, &hub, &verifier, &token));
    let client = ZkPorrinhaContractClient::new(&env, &cid);
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    (env, client, p1, p2)
}

fn do_full_game(
    env: &Env,
    client: &ZkPorrinhaContractClient,
    p1: &Address,
    p2: &Address,
    bet: i128,
    p1_parity: u32,
    p1_exact: u32,
    p2_parity: u32,
    p2_exact: u32,
    total_sum: u32,
    nullifier_byte: u8,
) -> crate::Room {
    let id = client.create_room(p1, &bet);
    client.join_room(&id, p2);
    let c1 = BytesN::from_array(env, &[0x11u8; 32]);
    let c2 = BytesN::from_array(env, &[0x22u8; 32]);
    client.commit(&id, p1, &c1, &p1_parity, &p1_exact);
    client.commit(&id, p2, &c2, &p2_parity, &p2_exact);
    let proof     = Bytes::from_array(env, &[0xAAu8; 200]);
    let nullifier = BytesN::from_array(env, &[nullifier_byte; 32]);
    client.resolve(&id, &proof, &total_sum, &nullifier);
    client.get_room(&id)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[test]
fn test_initial_jackpot_is_zero() {
    let (_, client, _, _) = setup();
    assert_eq!(client.get_jackpot(), 0i128);
}

#[test]
fn test_create_room_counter() {
    let (_, client, p1, p2) = setup();
    assert_eq!(client.get_room_count(), 0u64);
    assert_eq!(client.create_room(&p1, &1_000i128), 1u64);
    assert_eq!(client.create_room(&p2, &1_000i128), 2u64);
    assert_eq!(client.get_room_count(), 2u64);
}

#[test]
fn test_create_room_state() {
    let (_, client, p1, _) = setup();
    let id = client.create_room(&p1, &500i128);
    let room = client.get_room(&id);
    assert_eq!(room.status, RoomStatus::Lobby);
    assert!(!room.has_player2);
    assert_eq!(room.bet_amount, 500i128);
    assert!(room.winner.is_none());
}

#[test]
fn test_join_transitions_to_commit() {
    let (_, client, p1, p2) = setup();
    let id = client.create_room(&p1, &1_000i128);
    client.join_room(&id, &p2);
    let room = client.get_room(&id);
    assert!(room.has_player2);
    assert_eq!(room.status, RoomStatus::Commit);
    assert_eq!(room.player2.address, p2);
}

#[test]
fn test_room_pot_one_player() {
    let (_, client, p1, _) = setup();
    let id = client.create_room(&p1, &2_000i128);
    assert_eq!(client.get_room_pot(&id), 2_000i128);
}

#[test]
fn test_room_pot_two_players() {
    let (_, client, p1, p2) = setup();
    let id = client.create_room(&p1, &2_000i128);
    client.join_room(&id, &p2);
    assert_eq!(client.get_room_pot(&id), 4_000i128);
}

#[test]
fn test_commit_records_values() {
    let (env, client, p1, p2) = setup();
    let id = client.create_room(&p1, &1_000i128);
    client.join_room(&id, &p2);
    let c = BytesN::from_array(&env, &[0xABu8; 32]);
    client.commit(&id, &p1, &c, &1u32, &3u32);
    let room = client.get_room(&id);
    assert!(room.player1.has_committed);
    assert_eq!(room.player1.commitment, c);
    assert_eq!(room.player1.parity_guess, 1u32);
    assert_eq!(room.player1.exact_sum_guess, 3u32);
    assert!(!room.player2.has_committed);
}

#[test]
fn test_full_game_p1_wins_parity() {
    // total_sum=3 odd; p1 guesses odd, p2 guesses even
    let (env, client, p1, p2) = setup();
    let room = do_full_game(&env, &client, &p1, &p2, 1_000, 1, 0, 0, 0, 3, 0xBB);
    assert_eq!(room.status, RoomStatus::Settled);
    assert_eq!(room.winner, Some(p1));
    assert_eq!(room.total_sum, Some(3u32));
}

#[test]
fn test_full_game_p2_wins_parity() {
    // total_sum=4 even; p2 guesses even
    let (env, client, p1, p2) = setup();
    let room = do_full_game(&env, &client, &p1, &p2, 1_000, 1, 0, 0, 5, 4, 0xCC);
    assert_eq!(room.winner, Some(p2));
}

#[test]
fn test_exact_hit_p1_wins_jackpot() {
    // total_sum=3; p1 guesses exact=3
    let (env, client, p1, p2) = setup();
    let room = do_full_game(&env, &client, &p1, &p2, 1_000, 1, 3, 0, 0, 3, 0xDD);
    assert_eq!(room.winner, Some(p1));
    assert_eq!(client.get_jackpot(), 0i128); // paid out
}

#[test]
fn test_exact_hit_p2_wins_jackpot() {
    let (env, client, p1, p2) = setup();
    let room = do_full_game(&env, &client, &p1, &p2, 1_000, 1, 0, 0, 4, 4, 0xEE);
    assert_eq!(room.winner, Some(p2));
    assert_eq!(client.get_jackpot(), 0i128);
}

#[test]
fn test_no_exact_jackpot_accumulates() {
    let (env, client, p1, p2) = setup();
    let bet = 1_000i128;
    do_full_game(&env, &client, &p1, &p2, bet, 1, 0, 0, 6, 3, 0xAA);
    let expected = (bet * 2 * 20) / 100;
    assert_eq!(client.get_jackpot(), expected);
}

#[test]
fn test_jackpot_grows_two_rounds() {
    let (env, client, p1, p2) = setup();
    let bet = 1_000i128;
    let contribution = (bet * 2 * 20) / 100;
    do_full_game(&env, &client, &p1, &p2, bet, 1, 0, 0, 6, 3, 0x01);
    assert_eq!(client.get_jackpot(), contribution);
    do_full_game(&env, &client, &p1, &p2, bet, 1, 0, 0, 6, 3, 0x02);
    assert_eq!(client.get_jackpot(), contribution * 2);
}

#[test]
fn test_jackpot_resets_after_exact_hit() {
    let (env, client, p1, p2) = setup();
    let bet = 1_000i128;
    let contribution = (bet * 2 * 20) / 100;
    // Round 1 accumulates
    do_full_game(&env, &client, &p1, &p2, bet, 1, 0, 0, 6, 3, 0x10);
    assert_eq!(client.get_jackpot(), contribution);
    // Round 2: p1 hits exact
    do_full_game(&env, &client, &p1, &p2, bet, 1, 5, 0, 0, 5, 0x20);
    assert_eq!(client.get_jackpot(), 0i128);
}

#[test]
fn test_winner_is_set_after_settle() {
    let (env, client, p1, p2) = setup();
    let room = do_full_game(&env, &client, &p1, &p2, 1_000, 1, 3, 0, 0, 3, 0xFF);
    assert!(room.winner.is_some());
}

// ── Error cases ───────────────────────────────────────────────────────────────

#[test]
#[should_panic]
fn test_zero_bet_fails() {
    let (_, client, p1, _) = setup();
    client.create_room(&p1, &0i128);
}

#[test]
#[should_panic]
fn test_self_play_fails() {
    let (_, client, p1, _) = setup();
    let id = client.create_room(&p1, &500i128);
    client.join_room(&id, &p1);
}

#[test]
#[should_panic]
fn test_join_full_room_fails() {
    let (env, client, p1, p2) = setup();
    let p3 = Address::generate(&env);
    let id = client.create_room(&p1, &500i128);
    client.join_room(&id, &p2);
    client.join_room(&id, &p3);
}

#[test]
#[should_panic]
fn test_commit_twice_fails() {
    let (env, client, p1, p2) = setup();
    let id = client.create_room(&p1, &1_000i128);
    client.join_room(&id, &p2);
    let c = BytesN::from_array(&env, &[0x11u8; 32]);
    client.commit(&id, &p1, &c, &0u32, &0u32);
    client.commit(&id, &p1, &c, &0u32, &0u32);
}

#[test]
#[should_panic]
fn test_commit_in_lobby_fails() {
    let (env, client, p1, _) = setup();
    let id = client.create_room(&p1, &500i128);
    let c = BytesN::from_array(&env, &[0x11u8; 32]);
    client.commit(&id, &p1, &c, &0u32, &0u32);
}

#[test]
#[should_panic]
fn test_bad_proof_rejected() {
    let (env, client, p1, p2) = setup_reject();
    let id = client.create_room(&p1, &1_000i128);
    client.join_room(&id, &p2);
    let c1 = BytesN::from_array(&env, &[0x11u8; 32]);
    let c2 = BytesN::from_array(&env, &[0x22u8; 32]);
    client.commit(&id, &p1, &c1, &0u32, &0u32);
    client.commit(&id, &p2, &c2, &0u32, &0u32);
    let proof     = Bytes::from_array(&env, &[0xAAu8; 200]);
    let nullifier = BytesN::from_array(&env, &[0xBBu8; 32]);
    client.resolve(&id, &proof, &2u32, &nullifier);
}

#[test]
#[should_panic]
fn test_nullifier_replay_fails() {
    let (env, client, p1, p2) = setup();
    // Game 1
    let id1 = client.create_room(&p1, &1_000i128);
    client.join_room(&id1, &p2);
    let c1 = BytesN::from_array(&env, &[0x11u8; 32]);
    let c2 = BytesN::from_array(&env, &[0x22u8; 32]);
    client.commit(&id1, &p1, &c1, &0u32, &0u32);
    client.commit(&id1, &p2, &c2, &0u32, &0u32);
    let proof     = Bytes::from_array(&env, &[0xAAu8; 200]);
    let nullifier = BytesN::from_array(&env, &[0xBBu8; 32]);
    client.resolve(&id1, &proof, &2u32, &nullifier);
    // Game 2 with same nullifier
    let id2 = client.create_room(&p1, &1_000i128);
    client.join_room(&id2, &p2);
    let c3 = BytesN::from_array(&env, &[0x33u8; 32]);
    let c4 = BytesN::from_array(&env, &[0x44u8; 32]);
    client.commit(&id2, &p1, &c3, &0u32, &0u32);
    client.commit(&id2, &p2, &c4, &0u32, &0u32);
    client.resolve(&id2, &proof, &2u32, &nullifier);
}

#[test]
#[should_panic]
fn test_resolve_before_both_commit_fails() {
    let (env, client, p1, p2) = setup();
    let id = client.create_room(&p1, &1_000i128);
    client.join_room(&id, &p2);
    let c1 = BytesN::from_array(&env, &[0x11u8; 32]);
    client.commit(&id, &p1, &c1, &0u32, &0u32);
    let proof     = Bytes::from_array(&env, &[0xAAu8; 200]);
    let nullifier = BytesN::from_array(&env, &[0xBBu8; 32]);
    client.resolve(&id, &proof, &1u32, &nullifier);
}

#[test]
#[should_panic]
fn test_get_nonexistent_room_fails() {
    let (_, client, _, _) = setup();
    client.get_room(&999u64);
}

#[test]
#[should_panic]
fn test_token_failure_panics() {
    let (_, client, p1, _) = setup_token_fail();
    client.create_room(&p1, &500i128);
}
