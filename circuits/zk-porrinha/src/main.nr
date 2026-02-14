use std::hash::poseidon2_permutation;

fn main(
    hand1: u32,
    salt1: Field,
    hand2: u32,
    salt2: Field,

    h1: pub Field,
    h2: pub Field
) -> pub Field {
    assert(hand1 <= 3);
    assert(hand2 <= 3);

    let commitment1 = poseidon2_permutation([hand1 as Field, salt1, 0, 0], 4)[0];
    let commitment2 = poseidon2_permutation([hand2 as Field, salt2, 0, 0], 4)[0];
    
    assert(commitment1 == h1);
    assert(commitment2 == h2);

    let total_sum = (hand1 + hand2) as Field;

    total_sum
}

#[test]
fn test_commitment_debug() {
    let hand = 3;
    let salt = 0x111;
    
    let commitment = poseidon2_permutation([hand as Field, salt as Field, 0, 0], 4)[0];
    
    std::println(commitment);
    
    assert(commitment != 0);
}

#[test]
fn test_commitment_debug_real() {
    let hand = 3;
    let salt = 0xb16aa63bcf7e586d42f5e7d33bc7f54b6aa13dc1b32289cd175233cff248;
    
    let commitment = poseidon2_permutation([hand as Field, salt as Field, 0, 0], 4)[0];
    
    std::println(commitment);
    
    assert(commitment != 0);
}

#[test]
fn test_valid_round() {
    let s1 = 0x111;
    let s2 = 0x222;
    
    let hash1 = poseidon2_permutation([3 as Field, s1 as Field, 0, 0], 4)[0]; 
    let hash2 = poseidon2_permutation([1 as Field, s2 as Field, 0, 0], 4)[0]; 

    let result = main(3, s1 as Field, 1, s2 as Field, hash1, hash2);
    
    assert(result == 4);
}

#[test(should_fail)]
fn test_limit_exceeded() {
    let s1 = 0x111;
    let s2 = 0x222;
    let hash1 = poseidon2_permutation([5 as Field, s1 as Field, 0, 0], 4)[0]; // Trying 5 fingers
    let hash2 = poseidon2_permutation([0 as Field, s2 as Field, 0, 0], 4)[0];

    let _ = main(5, s1 as Field, 0, s2 as Field, hash1, hash2);
}

#[test(should_fail)]
fn test_fraud_attempt_hash() {
    let s1 = 0x111;
    let s2 = 0x222;
    
    let hash_original = poseidon2_permutation([2 as Field, s1 as Field, 0, 0], 4)[0];
    let hash2 = poseidon2_permutation([1 as Field, s2 as Field, 0, 0], 4)[0];

    let _ = main(3, s1 as Field, 1, s2 as Field, hash_original, hash2);
}

#[test]
fn test_both_players_zero() {
    let s1 = 0x333;
    let s2 = 0x444;
    
    let hash1 = poseidon2_permutation([0 as Field, s1 as Field, 0, 0], 4)[0];
    let hash2 = poseidon2_permutation([0 as Field, s2 as Field, 0, 0], 4)[0];

    let result = main(0, s1 as Field, 0, s2 as Field, hash1, hash2);
    
    assert(result == 0);
}

#[test]
fn test_maximum_sum() {
    let s1 = 0x555;
    let s2 = 0x666;
    
    let hash1 = poseidon2_permutation([3 as Field, s1 as Field, 0, 0], 4)[0];
    let hash2 = poseidon2_permutation([3 as Field, s2 as Field, 0, 0], 4)[0];

    let result = main(3, s1 as Field, 3, s2 as Field, hash1, hash2);
    
    assert(result == 6);
}

#[test]
fn test_different_salts_same_hand() {
    let s1 = 0x777;
    let s2 = 0x888;
    
    let hash1 = poseidon2_permutation([2 as Field, s1 as Field, 0, 0], 4)[0];
    let hash2 = poseidon2_permutation([2 as Field, s2 as Field, 0, 0], 4)[0];

    let result = main(2, s1 as Field, 2, s2 as Field, hash1, hash2);
    
    assert(result == 4);
}

#[test(should_fail)]
fn test_player2_exceeds_limit() {
    let s1 = 0x999;
    let s2 = 0xAAA;

    let hash1 = poseidon2_permutation([2 as Field, s1 as Field, 0, 0], 4)[0];
    let hash2 = poseidon2_permutation([4 as Field, s2 as Field, 0, 0], 4)[0];

    let _ = main(2, s1 as Field, 4, s2 as Field, hash1, hash2);
}

#[test(should_fail)]
fn test_swapped_commitments() {
    let s1 = 0xBBB;
    let s2 = 0xCCC;
    
    let hash1 = poseidon2_permutation([1 as Field, s1 as Field, 0, 0], 4)[0];
    let hash2 = poseidon2_permutation([2 as Field, s2 as Field, 0, 0], 4)[0];

    let _ = main(1, s1 as Field, 2, s2 as Field, hash2, hash1);
}