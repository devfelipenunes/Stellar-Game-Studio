#![no_std]

use soroban_sdk::{Env, Bytes, BytesN, Vec};

pub mod verifier {
    use soroban_sdk::{Env, Bytes, BytesN, Vec};

    pub struct UltraHonkVerifier;

    impl UltraHonkVerifier {
        // Minimal verify signature matching caller in noir-verifier
        pub fn verify(
            _env: &Env,
            _proof: &Bytes,
            _public_inputs: &Vec<BytesN<32>>,
            _vk_bytes: &Bytes,
        ) -> bool {
            // Stub: in local/test builds we optimistically return true.
            // For production you MUST replace this crate with the real
            // ultrahonk verifier implementation or link the proper crate.
            true
        }
    }
}
