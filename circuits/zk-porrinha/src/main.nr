

use std::hash::poseidon2_permutation;

fn main(
    hand_value: u32,
    parity_guess: u32,
    total_guess: u32,
    jackpot_guess: u32,
    salt: Field,
    jackpot_accumulated: pub u64
) -> pub [Field; 5] {

    assert(hand_value <= 5);
    assert(parity_guess <= 1);
    assert(total_guess <= 10);
    assert(jackpot_guess <= 99);

    let jackpot_secret = jackpot_accumulated % 100;
    let jackpot_hit_flag: u32 = if (jackpot_guess as u64 == jackpot_secret) { 1 } else { 0 };
    let combined_guess = (total_guess * 100 + jackpot_guess) as Field;
    let inputs = [
        hand_value as Field,
        parity_guess as Field,
        combined_guess,
        salt
    ];
    let hash_result = poseidon2_permutation(inputs, 4);
    let commitment = hash_result[0];

    [commitment, hand_value as Field, parity_guess as Field, total_guess as Field, jackpot_hit_flag as Field]
}

#[test]
fn test_valid_proof() {
    let hand: u32 = 3;               
    let parity: u32 = 1;             
    let total: u32 = 7;              
    let jackpot_guess: u32 = 42;     
    let salt: Field = 123456789;     
    let jackpot_accumulated: u64 = 1042;
    
    let outputs = main(hand, parity, total, jackpot_guess, salt, jackpot_accumulated);
    
    assert(outputs[0] != 0);
    assert(outputs[1] == 3);
    assert(outputs[2] == 1);
    assert(outputs[3] == 7);
}

#[test(should_fail)]
fn test_invalid_hand() {
    let hand: u32 = 6; // Invalid: > 5
    let parity: u32 = 1;
    let total: u32 = 7;
    let jackpot_guess: u32 = 42;
    let salt: Field = 123456789;
    let jackpot_accumulated: u64 = 1042;
    
    let _ = main(hand, parity, total, jackpot_guess, salt, jackpot_accumulated);
}

#[test(should_fail)]
fn test_invalid_parity() {
    let hand: u32 = 3;
    let parity: u32 = 2; // Invalid: must be 0 or 1
    let total: u32 = 7;
    let jackpot_guess: u32 = 42;
    let salt: Field = 123456789;
    let jackpot_accumulated: u64 = 1042;
    
    let _ = main(hand, parity, total, jackpot_guess, salt, jackpot_accumulated);
}

#[test(should_fail)]
fn test_invalid_total() {
    let hand: u32 = 3;
    let parity: u32 = 1;
    let total: u32 = 11; // Invalid: > 10
    let jackpot_guess: u32 = 42;
    let salt: Field = 123456789;
    let jackpot_accumulated: u64 = 1042;
    
    let _ = main(hand, parity, total, jackpot_guess, salt, jackpot_accumulated);
}

#[test(should_fail)]
fn test_wrong_jackpot_guess() {
    let hand: u32 = 3;
    let parity: u32 = 1;
    let total: u32 = 7;
    let jackpot_guess: u32 = 43; // Wrong: should be 42
    let salt: Field = 123456789;
    let jackpot_accumulated: u64 = 1042; // 1042 % 100 = 42
    
    let _ = main(hand, parity, total, jackpot_guess, salt, jackpot_accumulated);
}
