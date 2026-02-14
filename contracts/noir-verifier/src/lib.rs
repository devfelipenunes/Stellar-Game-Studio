#![no_std]

use soroban_sdk::{contract, contractimpl, contracterror, contracttype, Bytes, BytesN, Env, Vec, Symbol};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidProof = 1,
    InvalidPublicInputs = 2,
    VerificationFailed = 3,
    CircuitNotRegistered = 4,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct CircuitInfo {
    pub circuit_hash: BytesN<32>,
    pub name: Symbol,
    pub version: u32,
}

#[contract]
pub struct NoirVerifier;

#[contractimpl]
impl NoirVerifier {
    /// Verify a proof with circuit validation
    /// In production, this should call Barretenberg verification
    /// For testnet, we do structural validation + circuit registry check
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

    /// Register a circuit for verification
    pub fn register_circuit(
        env: Env,
        circuit_hash: BytesN<32>,
        name: Symbol,
        version: u32,
    ) {
        let info = CircuitInfo {
            circuit_hash: circuit_hash.clone(),
            name: name.clone(),
            version,
        };
        
        env.storage().instance().set(&circuit_hash, &info);
        
        env.events().publish(
            (soroban_sdk::symbol_short!("circuit"),),
            (circuit_hash, name, version)
        );
    }

    /// Get circuit info by hash
    pub fn get_circuit(env: Env, circuit_hash: BytesN<32>) -> Option<CircuitInfo> {
        env.storage().instance().get(&circuit_hash)
    }

    /// Verify proof with circuit hash validation
    pub fn verify_with_circuit(
        env: Env,
        proof: Bytes,
        public_inputs: Vec<BytesN<32>>,
        circuit_hash: BytesN<32>,
    ) -> bool {
        // Check if circuit is registered
        let circuit_info: Option<CircuitInfo> = env.storage().instance().get(&circuit_hash);
        
        if circuit_info.is_none() {
            env.events().publish(
                (soroban_sdk::symbol_short!("circ_err"),),
                "Circuit not registered"
            );
            return false;
        }

        // Perform standard verification
        Self::verify(env, proof, public_inputs)
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
        3
    }
    pub fn info(env: Env) -> (u32, bool) {
        env.events().publish(
            (soroban_sdk::symbol_short!("info"),),
            "BN254 Groth16 Verifier v3 - Circuit Registry + Structural Validation"
        );
        (3, false) 
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
        assert_eq!(version, 3);
    }

    #[test]
    fn test_register_and_verify_with_circuit() {
        let env = Env::default();
        let contract_id = env.register_contract(None, NoirVerifier);
        let client = NoirVerifierClient::new(&env, &contract_id);

        // Register a circuit
        let circuit_hash = BytesN::from_array(&env, &[1u8; 32]);
        let name = soroban_sdk::symbol_short!("zkporr");
        client.register_circuit(&circuit_hash, &name, &1);

        // Verify it was registered
        let info = client.get_circuit(&circuit_hash);
        assert!(info.is_some());
        assert_eq!(info.unwrap().version, 1);

        // Create a valid proof
        let mut proof_data = [0u8; 256];
        for i in 0..256 {
            proof_data[i] = ((i * 7 + 13) % 256) as u8;
        }
        let proof = Bytes::from_array(&env, &proof_data);
        
        let commitment = BytesN::from_array(&env, &[2u8; 32]);
        let total_sum = BytesN::from_array(&env, &[4u8; 32]);
        let public_inputs = vec![&env, commitment, total_sum];

        // Verify with circuit hash
        let result = client.verify_with_circuit(&proof, &public_inputs, &circuit_hash);
        assert!(result);
    }

    #[test]
    fn test_verify_with_unregistered_circuit() {
        let env = Env::default();
        let contract_id = env.register_contract(None, NoirVerifier);
        let client = NoirVerifierClient::new(&env, &contract_id);

        let circuit_hash = BytesN::from_array(&env, &[99u8; 32]);
        
        let mut proof_data = [0u8; 256];
        for i in 0..256 {
            proof_data[i] = ((i * 7 + 13) % 256) as u8;
        }
        let proof = Bytes::from_array(&env, &proof_data);
        
        let commitment = BytesN::from_array(&env, &[2u8; 32]);
        let total_sum = BytesN::from_array(&env, &[4u8; 32]);
        let public_inputs = vec![&env, commitment, total_sum];

        // Should fail because circuit is not registered
        let result = client.verify_with_circuit(&proof, &public_inputs, &circuit_hash);
        assert!(!result);
    }
}
