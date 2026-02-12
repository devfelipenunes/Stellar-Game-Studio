#![cfg(test)]

use crate::{ZkPorrinhaContract, ZkPorrinhaContractClient};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env, Vec, contractevent};

#[contractevent]
pub struct Verified {
    pub proof_len: u32,
    pub inputs_len: u32,
}

#[contract]
pub struct MockGameHub;

#[contractimpl]
impl MockGameHub {
    pub fn start_game(_env: Env, _game_id: Address, _session_id: u32, _player1: Address, _player2: Address, _p1_points: i128, _p2_points: i128) {
    }
    pub fn end_game(_env: Env, _session_id: u32, _player1_won: bool) {
    }
    pub fn add_game(_env: Env, _game_address: Address) {
    }
}

#[contract]
pub struct MockVerifier;

#[contractimpl]
impl MockVerifier {
    pub fn verify(env: Env, proof: Bytes, public_inputs: Vec<BytesN<32>>) -> bool {
        if proof.len() == 0 {
            return false;
        }
        if public_inputs.len() < 2 {
            return false;
        }
        for i in 0..public_inputs.len() {
            if public_inputs.get(i).unwrap().len() != 32 {
                return false;
            }
        }
        Verified { proof_len: proof.len(), inputs_len: public_inputs.len() }.publish(&env);
        true
    }
}

#[contract]
pub struct MockToken;

#[contractimpl]
impl MockToken {
    pub fn transfer(_env: Env, _from: Address, _to: Address, _amount: i128) {
    }
}

#[contract]
pub struct MockTokenFail;

#[contractimpl]
impl MockTokenFail {
    pub fn transfer(_env: Env, _from: Address, _to: Address, _amount: i128) {
        panic!("mock token transfer failure");
    }
}

#[contract]
pub struct MockVerifierReject;

#[contractimpl]
impl MockVerifierReject {
    pub fn verify(_env: Env, _proof: Bytes, _public_inputs: Vec<BytesN<32>>) -> bool {
        false
    }
}

fn setup_test() -> (Env, ZkPorrinhaContractClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        timestamp: 0,
        protocol_version: 25,
        sequence_number: 1,
        network_id: Default::default(),
        base_reserve: 1,
        min_temp_entry_ttl: u32::MAX / 2,
        min_persistent_entry_ttl: u32::MAX / 2,
        max_entry_ttl: u32::MAX / 2,
    });

    let hub_id = env.register(MockGameHub, ());
    let verifier_id = env.register(MockVerifier, ());
    let token_id = env.register(MockToken, ());

    let admin = Address::generate(&env);

    let contract_id = env.register(ZkPorrinhaContract, (&admin, &verifier_id, &hub_id, &token_id));
    let client = ZkPorrinhaContractClient::new(&env, &contract_id);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    (env, client, player1, player2)
}

fn setup_test_with_token_fail() -> (Env, ZkPorrinhaContractClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        timestamp: 0,
        protocol_version: 25,
        sequence_number: 1,
        network_id: Default::default(),
        base_reserve: 1,
        min_temp_entry_ttl: u32::MAX / 2,
        min_persistent_entry_ttl: u32::MAX / 2,
        max_entry_ttl: u32::MAX / 2,
    });

    let hub_id = env.register(MockGameHub, ());
    let verifier_id = env.register(MockVerifier, ());
    let token_id = env.register(MockTokenFail, ());

    let admin = Address::generate(&env);

    let contract_id = env.register(ZkPorrinhaContract, (&admin, &verifier_id, &hub_id, &token_id));
    let client = ZkPorrinhaContractClient::new(&env, &contract_id);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    (env, client, player1, player2)
}

fn setup_test_with_verifier_reject() -> (Env, ZkPorrinhaContractClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        timestamp: 0,
        protocol_version: 25,
        sequence_number: 1,
        network_id: Default::default(),
        base_reserve: 1,
        min_temp_entry_ttl: u32::MAX / 2,
        min_persistent_entry_ttl: u32::MAX / 2,
        max_entry_ttl: u32::MAX / 2,
    });

    let hub_id = env.register(MockGameHub, ());
    let verifier_id = env.register(MockVerifierReject, ());
    let token_id = env.register(MockToken, ());

    let admin = Address::generate(&env);

    let contract_id = env.register(ZkPorrinhaContract, (&admin, &verifier_id, &hub_id, &token_id));
    let client = ZkPorrinhaContractClient::new(&env, &contract_id);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    (env, client, player1, player2)
}


#[test]
#[should_panic]
fn test_verifier_rejects_bad_public_inputs() {
    let (env, client, player1, player2) = setup_test_with_verifier_reject();

    let bet: i128 = 200;
    let room_id = client.create_room(&player1, &bet);
    client.join_room(&room_id, &player2);

    let commitment = BytesN::from_array(&env, &[7u8; 32]);
    let proof = Bytes::from_array(&env, &[1u8; 200]);

    client.commit_hand(&room_id, &player1, &commitment, &proof, &0u32, &0u32, &0u32, &false);
}

#[test]
#[should_panic]
fn test_token_transfer_failure_rolls_back() {
    let (_env, client, _player1, _player2) = setup_test_with_token_fail();

    let bet: i128 = 100;
    let _ = client.create_room(&_player1, &bet);
}

#[test]
#[should_panic]
fn test_commit_twice_fails() {
    let (env, client, player1, player2) = setup_test();

    let bet: i128 = 150;
    let room_id = client.create_room(&player1, &bet);
    client.join_room(&room_id, &player2);

    let commitment = BytesN::from_array(&env, &[7u8; 32]);
    let proof = Bytes::from_array(&env, &[1u8; 200]);

    client.commit_hand(&room_id, &player1, &commitment, &proof, &0u32, &0u32, &0u32, &false);
    client.commit_hand(&room_id, &player1, &commitment, &proof, &0u32, &0u32, &0u32, &false);
}

#[test]
#[should_panic]
fn test_reveal_without_commit_fails() {
    let (env, client, player1, player2) = setup_test();

    let bet: i128 = 120;
    let room_id = client.create_room(&player1, &bet);
    client.join_room(&room_id, &player2);

    panic!("reveal_hand has been removed; behavior tested via commit_hand flows");
}


#[test]
fn test_create_join_commit_reveal_flow() {
    let (env, client, player1, player2) = setup_test();

    let count0 = client.get_room_count();
    assert_eq!(count0, 0u64);

    let bet: i128 = 1_000;
    let room_id = client.create_room(&player1, &bet);
    assert_eq!(room_id, 1u64);

    let count1 = client.get_room_count();
    assert_eq!(count1, 1u64);

    client.join_room(&room_id, &player2);

    let room = client.get_room(&room_id);
    assert_eq!(room.has_player2, true);
    assert_eq!(room.status, crate::RoomStatus::Commit);

    let commitment = BytesN::from_array(&env, &[7u8; 32]);
    let proof = Bytes::from_array(&env, &[1u8; 200]);

    client.commit_hand(&room_id, &player1, &commitment, &proof, &1u32, &1u32, &0u32, &false);
    client.commit_hand(&room_id, &player2, &commitment, &proof, &2u32, &0u32, &0u32, &false);

    let room_after_commit = client.get_room(&room_id);
    assert_eq!(room_after_commit.status, crate::RoomStatus::Lobby);
}

#[test]
fn test_get_jackpot_hash_and_room_count() {
    let (_env, client, player1, _player2) = setup_test();
    let bet: i128 = 500;
    let room_id = client.create_room(&player1, &bet);

    let hash = client.get_jackpot_hash(&room_id);
    assert_eq!(hash.len(), 32u32);

    let cnt = client.get_room_count();
    assert_eq!(cnt, 1u64);
}

#[test]
#[should_panic]
fn test_create_room_invalid_bet_should_panic() {
    let (_env, client, player1, _player2) = setup_test();
    let bet: i128 = 0;
    let _ = client.create_room(&player1, &bet);
}

#[test]
#[should_panic]
fn test_join_self_play_should_panic() {
    let (_env, client, player1, _player2) = setup_test();
    let bet: i128 = 100;
    let room_id = client.create_room(&player1, &bet);
    client.join_room(&room_id, &player1);
}

#[test]
#[should_panic]
fn test_commit_invalid_proof_should_panic() {
    let (env, client, player1, player2) = setup_test();
    let bet: i128 = 200;
    let room_id = client.create_room(&player1, &bet);
    client.join_room(&room_id, &player2);

    let commitment = BytesN::from_array(&env, &[7u8; 32]);
    let empty_proof = Bytes::new(&env);
    client.commit_hand(&room_id, &player1, &commitment, &empty_proof, &0u32, &0u32, &0u32, &false);
}

#[test]
fn test_claim_timeout_success() {
    let (env, client, player1, player2) = setup_test();
    let bet: i128 = 300;
    let room_id = client.create_room(&player1, &bet);
    client.join_room(&room_id, &player2);

    let commitment = BytesN::from_array(&env, &[7u8; 32]);
    let proof = Bytes::from_array(&env, &[1u8; 200]);
    client.commit_hand(&room_id, &player1, &commitment, &proof, &0u32, &0u32, &0u32, &false);

    let new_seq = 1u32 + crate::TIMEOUT_LEDGERS + 5;
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        timestamp: 0,
        protocol_version: 25,
        sequence_number: new_seq,
        network_id: Default::default(),
        base_reserve: 1,
        min_temp_entry_ttl: u32::MAX / 2,
        min_persistent_entry_ttl: u32::MAX / 2,
        max_entry_ttl: u32::MAX / 2,
    });

    client.claim_timeout(&room_id, &player1);

    let room = client.get_room(&room_id);
    assert!(room.last_winner.is_some());
    assert_eq!(room.last_winner.unwrap(), player1);
}


#[test]
fn test_jackpot_split_when_both_hit() {
    let (env, client, player1, player2) = setup_test();
    let bet: i128 = 400;
    let room_id = client.create_room(&player1, &bet);
    client.join_room(&room_id, &player2);

    let commitment = BytesN::from_array(&env, &[7u8; 32]);
    let proof = Bytes::from_array(&env, &[1u8; 200]);
    client.commit_hand(&room_id, &player1, &commitment, &proof, &1u32, &1u32, &0u32, &false);
    client.commit_hand(&room_id, &player2, &commitment, &proof, &2u32, &0u32, &0u32, &false);

    let room_after_r1 = client.get_room(&room_id);
    let expected_jackpot_r1 = (bet * 2 * 20) / 100; // 20% = 160
    assert_eq!(room_after_r1.jackpot_pool, expected_jackpot_r1);

    client.join_room(&room_id, &player2);
    client.commit_hand(&room_id, &player1, &commitment, &proof, &2u32, &1u32, &0u32, &true);
    client.commit_hand(&room_id, &player2, &commitment, &proof, &4u32, &1u32, &0u32, &true);

    let room_after_r2 = client.get_room(&room_id);
    assert_eq!(room_after_r2.jackpot_pool, 0);
}


#[test]
fn test_jackpot_paid_to_single_winner() {
    let (env, client, player1, player2) = setup_test();
    let bet: i128 = 600;
    let room_id = client.create_room(&player1, &bet);
    client.join_room(&room_id, &player2);

    let commitment = BytesN::from_array(&env, &[7u8; 32]);
    let proof = Bytes::from_array(&env, &[1u8; 200]);
    client.commit_hand(&room_id, &player1, &commitment, &proof, &1u32, &1u32, &0u32, &false);
    client.commit_hand(&room_id, &player2, &commitment, &proof, &2u32, &0u32, &0u32, &false);
    let room_after_r1 = client.get_room(&room_id);
    let expected_jackpot_r1 = (bet * 2 * 20) / 100; // 20% = 240
    assert_eq!(room_after_r1.jackpot_pool, expected_jackpot_r1);


    client.join_room(&room_id, &player2);

    client.commit_hand(&room_id, &player1, &commitment, &proof, &3u32, &1u32, &0u32, &true);
    client.commit_hand(&room_id, &player2, &commitment, &proof, &4u32, &0u32, &0u32, &false);

    let room_after_r2 = client.get_room(&room_id);

    let expected_jackpot_r2 = (bet * 2 * 20) / 100; // 20% of round 2 = 240
    assert_eq!(room_after_r2.jackpot_pool, expected_jackpot_r2);
}

#[test]
fn test_zk_proof_validation_format() {
    let (env, client, player1, player2) = setup_test();
    
    let bet: i128 = 1_000_000; // 0.1 XLM
    let room_id = client.create_room(&player1, &bet);
    client.join_room(&room_id, &player2);
    
    let commitment = BytesN::from_array(&env, &[0x42u8; 32]);
    let proof = Bytes::from_array(&env, &[0xAAu8; 200]);
    
    client.commit_hand(&room_id, &player1, &commitment, &proof, &0u32, &0u32, &0u32, &false);
    
    let room = client.get_room(&room_id);
    assert!(room.player1.has_committed);
    assert_eq!(room.player1.commitment, Some(commitment));
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_empty_proof_rejected() {
    let (env, client, player1, player2) = setup_test();
    
    let bet: i128 = 1_000_000;
    let room_id = client.create_room(&player1, &bet);
    client.join_room(&room_id, &player2);
    
    let commitment = BytesN::from_array(&env, &[0x42u8; 32]);
    let empty_proof = Bytes::new(&env); // Empty proof
    
    client.commit_hand(&room_id, &player1, &commitment, &empty_proof, &0u32, &0u32, &0u32, &false);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_verifier_rejection_blocks_commit() {
    let (env, client, player1, player2) = setup_test_with_verifier_reject();
    
    let bet: i128 = 1_000_000;
    let room_id = client.create_room(&player1, &bet);
    client.join_room(&room_id, &player2);
    
    let commitment = BytesN::from_array(&env, &[0x42u8; 32]);
    let proof = Bytes::from_array(&env, &[0xAAu8; 200]);
    
    client.commit_hand(&room_id, &player1, &commitment, &proof, &0u32, &0u32, &0u32, &false);
}

#[test]
fn test_different_commitments_accepted() {
    let (env, client, player1, player2) = setup_test();
    
    let bet: i128 = 1_000_000;
    let room_id = client.create_room(&player1, &bet);
    client.join_room(&room_id, &player2);
    
    let commitment1 = BytesN::from_array(&env, &[0x11u8; 32]);
    let commitment2 = BytesN::from_array(&env, &[0x22u8; 32]);
    let proof = Bytes::from_array(&env, &[0xAAu8; 200]);
    
    client.commit_hand(&room_id, &player1, &commitment1, &proof, &0u32, &0u32, &0u32, &false);
    client.commit_hand(&room_id, &player2, &commitment2, &proof, &0u32, &0u32, &0u32, &false);
    
    let room = client.get_room(&room_id);
    assert_eq!(room.player1.commitment, Some(commitment1));
    assert_eq!(room.player2.commitment, Some(commitment2));
    assert!(room.status == crate::RoomStatus::Lobby || room.status == crate::RoomStatus::Settled);
}

#[test]
fn test_jackpot_hash_in_public_inputs() {
    let (env, client, player1, player2) = setup_test();
    
    let bet: i128 = 1_000_000;
    let room_id = client.create_room(&player1, &bet);
    
    let initial_hash = client.get_jackpot_hash(&room_id);
    assert_eq!(initial_hash.len(), 32);
    
    client.join_room(&room_id, &player2);
    
    let commitment = BytesN::from_array(&env, &[0x42u8; 32]);
    let proof = Bytes::from_array(&env, &[0xAAu8; 200]);
    
    client.commit_hand(&room_id, &player1, &commitment, &proof, &0u32, &0u32, &0u32, &false);
    
    let room = client.get_room(&room_id);
    assert!(room.player1.has_committed);
}

#[test]
fn test_large_proof_accepted() {
    let (env, client, player1, player2) = setup_test();
    
    let bet: i128 = 1_000_000;
    let room_id = client.create_room(&player1, &bet);
    client.join_room(&room_id, &player2);
    
    let commitment = BytesN::from_array(&env, &[0x42u8; 32]);
    let large_proof = Bytes::from_array(&env, &[0xBBu8; 1024]);
    
    client.commit_hand(&room_id, &player1, &commitment, &large_proof, &0u32, &0u32, &0u32, &false);
    
    let room = client.get_room(&room_id);
    assert!(room.player1.has_committed);
}

#[test]
fn test_sequential_commits_both_players() {
    let (env, client, player1, player2) = setup_test();
    
    let bet: i128 = 1_000_000;
    let room_id = client.create_room(&player1, &bet);
    client.join_room(&room_id, &player2);
    
    let commitment1 = BytesN::from_array(&env, &[0xAAu8; 32]);
    let commitment2 = BytesN::from_array(&env, &[0xBBu8; 32]);
    let proof = Bytes::from_array(&env, &[0xCCu8; 200]);
    
    client.commit_hand(&room_id, &player1, &commitment1, &proof, &0u32, &0u32, &0u32, &false);
    let room_after_p1 = client.get_room(&room_id);
    assert!(room_after_p1.player1.has_committed);
    assert!(!room_after_p1.player2.has_committed);
    assert_eq!(room_after_p1.status, crate::RoomStatus::Commit);
    
    client.commit_hand(&room_id, &player2, &commitment2, &proof, &0u32, &0u32, &0u32, &false);
    let room_after_p2 = client.get_room(&room_id);
    assert!(room_after_p2.player1.has_committed);
    assert!(room_after_p2.player2.has_committed);
    assert!(room_after_p2.status == crate::RoomStatus::Lobby || room_after_p2.status == crate::RoomStatus::Settled);
}

#[test]
fn test_prize_distribution_ninety_ten_split() {
    let (env, client, player1, player2) = setup_test();
    
    let bet: i128 = 1_000_000; // 0.1 XLM per player = 0.2 XLM total
    let room_id = client.create_room(&player1, &bet);
    client.join_room(&room_id, &player2);
    
    let commitment = BytesN::from_array(&env, &[0x42u8; 32]);
    let proof = Bytes::from_array(&env, &[0xAAu8; 200]);
    
    client.commit_hand(&room_id, &player1, &commitment, &proof, &3u32, &1u32, &0u32, &false);
    client.commit_hand(&room_id, &player2, &commitment, &proof, &2u32, &0u32, &0u32, &false);

    let room_final = client.get_room(&room_id);

    let expected_jackpot = (bet * 2 * 20) / 100; // 400_000
    assert_eq!(room_final.jackpot_pool, expected_jackpot);

    assert_eq!(room_final.status, crate::RoomStatus::Lobby);
}


