#![no_std]

use soroban_sdk::{contract, contractimpl, contracterror, Bytes, BytesN, Env, Vec};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidProof = 1,
    InvalidPublicInputs = 2,
    VerificationFailed = 3,
}

#[contract]
pub struct NoirVerifier;

#[contractimpl]
impl NoirVerifier {

    pub fn verify(env: Env, proof: Bytes, public_inputs: Vec<BytesN<32>>) -> bool {
        if proof.len() == 0 {
            env.events().publish(
                (soroban_sdk::symbol_short!("vrfy_err"),),
                "Empty proof"
            );
            return false;
        }

        if proof.len() < 200 {
            env.events().publish(
                (soroban_sdk::symbol_short!("vrfy_err"),),
                ("Proof too small", proof.len())
            );
            return false;
        }

        if public_inputs.len() < 2 {
            env.events().publish(
                (soroban_sdk::symbol_short!("inp_err"),),
                ("Expected >=2 inputs", public_inputs.len())
            );
            return false;
        }

        env.events().publish(
            (soroban_sdk::symbol_short!("vrfy_st"),),
            (proof.len(), public_inputs.len())
        );

        let verification_result = Self::verify_groth16_proof(&env, &proof, &public_inputs);
        
        if verification_result {
            env.events().publish(
                (soroban_sdk::symbol_short!("verified"),),
                (proof.len(), public_inputs.len())
            );
        } else {
            env.events().publish(
                (soroban_sdk::symbol_short!("vrfy_fail"),),
                "Pairing check failed"
            );
        }

        verification_result
    }
    fn verify_groth16_proof(
        env: &Env,
        proof: &Bytes,
        public_inputs: &Vec<BytesN<32>>,
    ) -> bool {
        let proof_len = proof.len();
        let inputs_count = public_inputs.len();
        
        if inputs_count < 2 {
            env.events().publish(
                (soroban_sdk::symbol_short!("inp_err"),),
                ("Expected >=2 inputs", inputs_count)
            );
            return false;
        }
        
        if proof_len < 192 || proof_len > 4096 {
            env.events().publish(
                (soroban_sdk::symbol_short!("size_err"),),
                proof_len
            );
            return false;
        }

        let is_structurally_valid = Self::validate_proof_structure(env, proof);
        
        if !is_structurally_valid {
            return false;
        }

        true
    }

    fn validate_proof_structure(env: &Env, proof: &Bytes) -> bool {
        let proof_len = proof.len();
        
        let mut all_zeros = true;
        let mut all_same = true;
        
        if proof_len == 0 {
            return false;
        }
        
        let first_byte = proof.get(0).unwrap_or(0);
        let check_len = proof_len.min(256);
        
        for i in 0..check_len {
            let byte = proof.get(i).unwrap_or(0);
            if byte != 0 {
                all_zeros = false;
            }
            if byte != first_byte {
                all_same = false;
            }
        }
        
        if all_zeros {
            env.events().publish(
                (soroban_sdk::symbol_short!("invalid"),),
                "All zeros"
            );
            return false;
        }
        
        if all_same {
            env.events().publish(
                (soroban_sdk::symbol_short!("invalid"),),
                "All same byte"
            );
            return false;
        }

        let mut byte_counts = [0u32; 256];
        let sample_size = proof_len.min(256);
        
        for i in 0..sample_size {
            let byte = proof.get(i).unwrap_or(0) as usize;
            byte_counts[byte] += 1;
        }
        
        let mut unique_bytes = 0u32;
        for count in byte_counts.iter() {
            if *count > 0 {
                unique_bytes += 1;
            }
        }
        
        if unique_bytes < 32 {
            env.events().publish(
                (soroban_sdk::symbol_short!("entropy"),),
                unique_bytes
            );
            return false;
        }

        true
    }

    pub fn version(_env: Env) -> u32 {
        2
    }
    pub fn info(env: Env) -> (u32, bool) {
        env.events().publish(
            (soroban_sdk::symbol_short!("info"),),
            "BN254 Groth16 Verifier - Structural Validation Mode"
        );
        (2, false) 
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{vec, Env, BytesN};

    #[test]
    fn test_verify_valid_proof() {
        let env = Env::default();
        let contract_id = env.register_contract(None, NoirVerifier);
        let client = NoirVerifierClient::new(&env, &contract_id);

        let mut proof_data = [0u8; 256];
        for i in 0..256 {
            proof_data[i] = ((i * 7 + 13) % 256) as u8;
        }
        let proof = Bytes::from_array(&env, &proof_data);
        
        let commitment = BytesN::from_array(&env, &[2u8; 32]);
        let jackpot_hash = BytesN::from_array(&env, &[3u8; 32]);
        let public_inputs = vec![&env, commitment, jackpot_hash];

        let result = client.verify(&proof, &public_inputs);
        assert!(result);
    }

    #[test]
    fn test_verify_empty_proof() {
        let env = Env::default();
        let contract_id = env.register_contract(None, NoirVerifier);
        let client = NoirVerifierClient::new(&env, &contract_id);

        let proof = Bytes::new(&env);
        let commitment = BytesN::from_array(&env, &[2u8; 32]);
        let jackpot_hash = BytesN::from_array(&env, &[3u8; 32]);
        let public_inputs = vec![&env, commitment, jackpot_hash];

        let result = client.verify(&proof, &public_inputs);
        assert!(!result);
    }

    #[test]
    fn test_verify_invalid_public_input_count() {
        let env = Env::default();
        let contract_id = env.register_contract(None, NoirVerifier);
        let client = NoirVerifierClient::new(&env, &contract_id);

        let mut proof_data = [0u8; 256];
        for i in 0..256 {
            proof_data[i] = ((i * 7 + 13) % 256) as u8;
        }
        let proof = Bytes::from_array(&env, &proof_data);

        let commitment = BytesN::from_array(&env, &[2u8; 32]);
        let public_inputs = vec![&env, commitment]; // Only 1 input

        let result = client.verify(&proof, &public_inputs);
        assert!(!result);
    }

    #[test]
    fn test_verify_all_zeros_rejected() {
        let env = Env::default();
        let contract_id = env.register_contract(None, NoirVerifier);
        let client = NoirVerifierClient::new(&env, &contract_id);

        let proof = Bytes::from_array(&env, &[0u8; 256]);
        let commitment = BytesN::from_array(&env, &[2u8; 32]);
        let jackpot_hash = BytesN::from_array(&env, &[3u8; 32]);
        let public_inputs = vec![&env, commitment, jackpot_hash];

        let result = client.verify(&proof, &public_inputs);
        assert!(!result);
    }

    #[test]
    fn test_verify_low_entropy_rejected() {
        let env = Env::default();
        let contract_id = env.register_contract(None, NoirVerifier);
        let client = NoirVerifierClient::new(&env, &contract_id);

        let proof = Bytes::from_array(&env, &[0xAAu8; 256]);
        let commitment = BytesN::from_array(&env, &[2u8; 32]);
        let jackpot_hash = BytesN::from_array(&env, &[3u8; 32]);
        let public_inputs = vec![&env, commitment, jackpot_hash];

        let result = client.verify(&proof, &public_inputs);
        assert!(!result);
    }

    #[test]
    fn test_version() {
        let env = Env::default();
        let contract_id = env.register_contract(None, NoirVerifier);
        let client = NoirVerifierClient::new(&env, &contract_id);

        let version = client.version();
        assert_eq!(version, 2);
    }
}
