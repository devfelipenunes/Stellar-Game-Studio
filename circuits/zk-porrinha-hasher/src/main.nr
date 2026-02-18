use std::hash::poseidon2_permutation;

// Hasher for ZK Porrinha commitments
//
// Computes Poseidon2(hand, parity_guess, exact_sum_guess, salt)
// This MUST match exactly the commitment formula in the main circuit (main.nr).
//
// All game decisions (hand, parity guess, exact sum guess) are sealed into
// the commitment so they cannot be changed after seeing the opponent's hand.
fn main(
    hand: pub u32,
    parity_guess: pub u32,
    exact_sum_guess: pub u32,
    salt: pub Field
) -> pub Field {
    poseidon2_permutation(
        [hand as Field, parity_guess as Field, exact_sum_guess as Field, salt],
        4
    )[0]
}
