use std::hash::poseidon2_permutation;

// ZK Porrinha - Enhanced Circuit v2
//
// Proves simultaneously:
//   1. Player hands are within valid range [0, 3]
//   2. Both commitments bind (hand, parity_guess, exact_sum_guess, salt)
//      so on-chain guesses are cryptographically locked to pre-committed secrets.
//   3. The revealed total_sum equals hand1 + hand2
//
// Public inputs  : h1, h2, parity1, parity2, exact1, exact2
// Private inputs : hand1, salt1, hand2, salt2
// Return value   : total_sum (public)
//
// A player CANNOT change parity or jackpot guess after seeing the opponent
// hand because those guesses are sealed inside the Poseidon2 commitment.

fn main(
    hand1:   u32,
    salt1:   Field,
    hand2:   u32,
    salt2:   Field,

    h1:      pub Field,
    h2:      pub Field,
    parity1: pub u32,
    parity2: pub u32,
    exact1:  pub u32,
    exact2:  pub u32
) -> pub Field {

    // Range checks
    assert(hand1 <= 3);
    assert(hand2 <= 3);
    assert(parity1 <= 1);
    assert(parity2 <= 1);
    assert(exact1 <= 6);
    assert(exact2 <= 6);

    // Commitment verification
    // Commitment now binds: hand, parity_guess, exact_sum_guess, salt
    let commitment1 = poseidon2_permutation(
        [hand1 as Field, parity1 as Field, exact1 as Field, salt1],
        4
    )[0];
    let commitment2 = poseidon2_permutation(
        [hand2 as Field, parity2 as Field, exact2 as Field, salt2],
        4
    )[0];

    assert(commitment1 == h1);
    assert(commitment2 == h2);

    // Return total sum (verified on-chain against public input)
    let total_sum = (hand1 + hand2) as Field;
    total_sum
}

#[test]
fn test_valid_round_with_guesses() {
    let s1: Field = 0x111;
    let s2: Field = 0x222;
    let p1: u32 = 1;
    let p2: u32 = 0;
    let e1: u32 = 4;
    let e2: u32 = 2;

    let h1 = poseidon2_permutation([3 as Field, p1 as Field, e1 as Field, s1], 4)[0];
    let h2 = poseidon2_permutation([1 as Field, p2 as Field, e2 as Field, s2], 4)[0];

    let result = main(3, s1, 1, s2, h1, h2, p1, p2, e1, e2);
    assert(result == 4);
}

#[test]
fn test_both_zero() {
    let s1: Field = 0x333;
    let s2: Field = 0x444;

    let h1 = poseidon2_permutation([0 as Field, 0 as Field, 0 as Field, s1], 4)[0];
    let h2 = poseidon2_permutation([0 as Field, 0 as Field, 0 as Field, s2], 4)[0];

    let result = main(0, s1, 0, s2, h1, h2, 0, 0, 0, 0);
    assert(result == 0);
}

#[test]
fn test_maximum_sum() {
    let s1: Field = 0x555;
    let s2: Field = 0x666;

    let h1 = poseidon2_permutation([3 as Field, 1 as Field, 6 as Field, s1], 4)[0];
    let h2 = poseidon2_permutation([3 as Field, 0 as Field, 6 as Field, s2], 4)[0];

    let result = main(3, s1, 3, s2, h1, h2, 1, 0, 6, 6);
    assert(result == 6);
}

#[test]
fn test_different_salts_same_hand() {
    let s1: Field = 0x777;
    let s2: Field = 0x888;

    let h1 = poseidon2_permutation([2 as Field, 1 as Field, 4 as Field, s1], 4)[0];
    let h2 = poseidon2_permutation([2 as Field, 0 as Field, 3 as Field, s2], 4)[0];

    let result = main(2, s1, 2, s2, h1, h2, 1, 0, 4, 3);
    assert(result == 4);
}

#[test(should_fail)]
fn test_hand_out_of_range() {
    let s1: Field = 0x111;
    let s2: Field = 0x222;

    let h1 = poseidon2_permutation([5 as Field, 0 as Field, 0 as Field, s1], 4)[0];
    let h2 = poseidon2_permutation([1 as Field, 0 as Field, 0 as Field, s2], 4)[0];

    let _ = main(5, s1, 1, s2, h1, h2, 0, 0, 0, 0);
}

#[test(should_fail)]
fn test_p2_hand_out_of_range() {
    let s1: Field = 0x999;
    let s2: Field = 0xAAA;

    let h1 = poseidon2_permutation([2 as Field, 0 as Field, 0 as Field, s1], 4)[0];
    let h2 = poseidon2_permutation([4 as Field, 0 as Field, 0 as Field, s2], 4)[0];

    let _ = main(2, s1, 4, s2, h1, h2, 0, 0, 0, 0);
}

#[test(should_fail)]
fn test_tampered_hand_fails() {
    let s1: Field = 0x111;
    let s2: Field = 0x222;

    let h1 = poseidon2_permutation([2 as Field, 1 as Field, 4 as Field, s1], 4)[0];
    let h2 = poseidon2_permutation([1 as Field, 0 as Field, 2 as Field, s2], 4)[0];

    let _ = main(3, s1, 1, s2, h1, h2, 1, 0, 4, 2);
}

#[test(should_fail)]
fn test_tampered_parity_fails() {
    let s1: Field = 0x111;
    let s2: Field = 0x222;

    let h1 = poseidon2_permutation([2 as Field, 0 as Field, 4 as Field, s1], 4)[0];
    let h2 = poseidon2_permutation([1 as Field, 0 as Field, 2 as Field, s2], 4)[0];

    let _ = main(2, s1, 1, s2, h1, h2, 1, 0, 4, 2);
}

#[test(should_fail)]
fn test_tampered_exact_guess_fails() {
    let s1: Field = 0x111;
    let s2: Field = 0x222;

    let h1 = poseidon2_permutation([2 as Field, 1 as Field, 4 as Field, s1], 4)[0];
    let h2 = poseidon2_permutation([1 as Field, 0 as Field, 2 as Field, s2], 4)[0];

    let _ = main(2, s1, 1, s2, h1, h2, 1, 0, 5, 2);
}

#[test(should_fail)]
fn test_swapped_commitments() {
    let s1: Field = 0xBBB;
    let s2: Field = 0xCCC;

    let h1 = poseidon2_permutation([1 as Field, 1 as Field, 3 as Field, s1], 4)[0];
    let h2 = poseidon2_permutation([2 as Field, 0 as Field, 2 as Field, s2], 4)[0];

    let _ = main(1, s1, 2, s2, h2, h1, 1, 0, 3, 2);
}

#[test(should_fail)]
fn test_parity_out_of_range() {
    let s1: Field = 0x111;
    let s2: Field = 0x222;

    let h1 = poseidon2_permutation([1 as Field, 2 as Field, 3 as Field, s1], 4)[0];
    let h2 = poseidon2_permutation([2 as Field, 0 as Field, 2 as Field, s2], 4)[0];

    let _ = main(1, s1, 2, s2, h1, h2, 2, 0, 3, 2);
}

#[test(should_fail)]
fn test_exact_guess_over_max() {
    let s1: Field = 0x111;
    let s2: Field = 0x222;

    let h1 = poseidon2_permutation([1 as Field, 1 as Field, 7 as Field, s1], 4)[0];
    let h2 = poseidon2_permutation([2 as Field, 0 as Field, 2 as Field, s2], 4)[0];

    let _ = main(1, s1, 2, s2, h1, h2, 1, 0, 7, 2);
}
