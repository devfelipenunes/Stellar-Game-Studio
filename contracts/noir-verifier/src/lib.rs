#![no_std]

mod vk;

use soroban_sdk::{
    contract, contractimpl, contracterror, contracttype,
    Bytes, BytesN, Env, Vec, Symbol,
};
use ultrahonk_soroban_verifier::verifier::UltraHonkVerifier;

const VK_HASH_EXPECTED: [u8; 32] = [
    0x16, 0xbf, 0x49, 0xee, 0x90, 0xd0, 0xff, 0x0b,
    0x07, 0xb0, 0x7b, 0x49, 0x13, 0xac, 0x22, 0xd9,
    0x29, 0xe7, 0xe1, 0x62, 0x6d, 0x21, 0x9e, 0x17,
    0x8d, 0x37, 0x61, 0xa6, 0x15, 0x5b, 0xe8, 0xb7,
];

const PROOF_MIN_LEN: u32 = 64;
const PROOF_MAX_LEN: u32 = 8192;

const EXPECTED_PUBLIC_INPUTS: u32 = 7;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidProof         = 1,
    InvalidPublicInputs  = 2,
    VerificationFailed   = 3,
    CircuitNotRegistered = 4,
    VkHashMismatch       = 5,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct CircuitInfo {
    pub circuit_hash: BytesN<32>,
    pub name:         Symbol,
    pub version:      u32,
}

#[contract]
pub struct NoirVerifier;

#[contractimpl]
#[allow(deprecated)]
impl NoirVerifier {

    pub fn verify(
        env:           Env,
        proof:         Bytes,
        public_inputs: Vec<BytesN<32>>,
        vk_hash:       BytesN<32>,
    ) -> bool {

        if !Self::check_vk_hash(&vk_hash) {
            env.events().publish((soroban_sdk::symbol_short!("vk_err"),), "VK hash mismatch");
            return false;
        }

        if public_inputs.len() != EXPECTED_PUBLIC_INPUTS {
            env.events().publish((soroban_sdk::symbol_short!("inp_err"),), public_inputs.len());
            return false;
        }

        let proof_len = proof.len();
        if proof_len < PROOF_MIN_LEN || proof_len > PROOF_MAX_LEN {
            env.events().publish((soroban_sdk::symbol_short!("size_err"),), proof_len);
            return false;
        }

        let vk_bytes = Bytes::from_array(&env, vk::VK_BYTES);

        let verified = UltraHonkVerifier::verify(&env, &proof, &public_inputs, &vk_bytes);

        if verified {
            env.events().publish(
                (soroban_sdk::symbol_short!("verified"),),
                (proof_len, public_inputs.len()),
            );
        } else {
            env.events().publish(
                (soroban_sdk::symbol_short!("zk_fail"),),
                proof_len,
            );
        }

        verified
    }

    pub fn vk_hash(env: Env) -> BytesN<32> {
        BytesN::from_array(&env, &VK_HASH_EXPECTED)
    }

    pub fn vk_info(_env: Env) -> (u32, u32, u32) {
        (vk::VK_CIRCUIT_SIZE, vk::VK_NUM_PUBLIC_INPUTS, 7)
    }

    pub fn register_circuit(env: Env, circuit_hash: BytesN<32>, name: Symbol, version: u32) {
        let info = CircuitInfo { circuit_hash: circuit_hash.clone(), name: name.clone(), version };
        env.storage().instance().set(&circuit_hash, &info);
        env.events().publish(
            (soroban_sdk::symbol_short!("circuit"),),
            (circuit_hash, name, version),
        );
    }

    pub fn get_circuit(env: Env, circuit_hash: BytesN<32>) -> Option<CircuitInfo> {
        env.storage().instance().get(&circuit_hash)
    }

    pub fn version(_env: Env) -> u32 { 7 }

    fn check_vk_hash(provided: &BytesN<32>) -> bool {
        let mut ok = true;
        for i in 0..32u32 {
            let got = provided.get(i).unwrap_or(0xff);
            if got != VK_HASH_EXPECTED[i as usize] {
                ok = false;
            }
        }
        ok
    }
}

#[cfg(test)]
#[allow(deprecated)]
mod test {
    use super::*;
    use soroban_sdk::{vec, Env, BytesN, Bytes};

    fn make_env() -> (Env, soroban_sdk::Address) {
        let env = Env::default();
        let id  = env.register(NoirVerifier, ());
        (env, id)
    }

    fn make_public_inputs(env: &Env) -> Vec<BytesN<32>> {
        vec![env,
            BytesN::from_array(env, &[0xaa_u8; 32]),                              // h1
            BytesN::from_array(env, &[0xbb_u8; 32]),                              // h2
            BytesN::from_array(env, &{ let mut b = [0u8;32]; b[31]=1; b }),       // parity1
            BytesN::from_array(env, &[0u8; 32]),                                   // parity2
            BytesN::from_array(env, &{ let mut b = [0u8;32]; b[31]=3; b }),       // exact1
            BytesN::from_array(env, &{ let mut b = [0u8;32]; b[31]=4; b }),       // exact2
            BytesN::from_array(env, &{ let mut b = [0u8;32]; b[31]=7; b }),       // total_sum
        ]
    }

    fn correct_vk_hash(env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &VK_HASH_EXPECTED)
    }

    #[test]
    fn test_version_is_7() {
        let (env, id) = make_env();
        assert_eq!(NoirVerifierClient::new(&env, &id).version(), 7);
    }

    #[test]
    fn test_vk_hash_getter() {
        let (env, id) = make_env();
        let got = NoirVerifierClient::new(&env, &id).vk_hash();
        assert_eq!(got, correct_vk_hash(&env));
    }

    #[test]
    fn test_vk_info() {
        let (env, id) = make_env();
        let (size, npub, ver) = NoirVerifierClient::new(&env, &id).vk_info();
        assert_eq!(size, 4096);
        assert_eq!(npub, 7);
        assert_eq!(ver,  7);
    }

    #[test]
    fn test_rejects_wrong_vk_hash() {
        let (env, id) = make_env();
        let c = NoirVerifierClient::new(&env, &id);
        let bad = BytesN::from_array(&env, &[0x00_u8; 32]);
        let proof = Bytes::from_array(&env, &[0xab_u8; 2144]);
        assert!(!c.verify(&proof, &make_public_inputs(&env), &bad));
    }

    #[test]
    fn test_rejects_wrong_input_count() {
        let (env, id) = make_env();
        let c   = NoirVerifierClient::new(&env, &id);
        let vkh = correct_vk_hash(&env);
        let p   = Bytes::from_array(&env, &[0xab_u8; 2144]);
        let six = vec![&env,
            BytesN::from_array(&env, &[1u8;32]),
            BytesN::from_array(&env, &[2u8;32]),
            BytesN::from_array(&env, &[3u8;32]),
            BytesN::from_array(&env, &[4u8;32]),
            BytesN::from_array(&env, &[5u8;32]),
            BytesN::from_array(&env, &[6u8;32]),
        ];
        assert!(!c.verify(&p, &six, &vkh));
    }

    #[test]
    fn test_rejects_empty_proof() {
        let (env, id) = make_env();
        let c = NoirVerifierClient::new(&env, &id);
        assert!(!c.verify(
            &Bytes::new(&env),
            &make_public_inputs(&env),
            &correct_vk_hash(&env),
        ));
    }

    #[test]
    fn test_register_and_get_circuit() {
        let (env, id) = make_env();
        let c    = NoirVerifierClient::new(&env, &id);
        let hash = BytesN::from_array(&env, &[0x01u8; 32]);
        let name = soroban_sdk::symbol_short!("zkporr");
        c.register_circuit(&hash, &name, &7);
        let info = c.get_circuit(&hash);
        assert!(info.is_some());
        assert_eq!(info.unwrap().version, 7);
    }

    #[test]
    fn test_vk_file_hash_matches_constant() {
        use sha2::{Digest, Sha256};
        let bytes: &[u8] = include_bytes!("../../../circuits/zk-porrinha/target/vk");
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        let result = hasher.finalize();
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&result);
        assert_eq!(arr, VK_HASH_EXPECTED, "local vk file hash does not match embedded constant");
    }
}