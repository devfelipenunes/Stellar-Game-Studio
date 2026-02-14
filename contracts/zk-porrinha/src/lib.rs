#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, token, 
    Address, Bytes, BytesN, Env, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    RoomNotFound = 1,
    NotPlayer = 2,
    InvalidPhase = 3,
    AlreadyCommitted = 4,
    InvalidProof = 5,
    NullifierUsed = 6,
    InvalidBet = 7,
    XlmTokenNotSet = 8,
    VerifierNotSet = 9,
    GameHubNotSet = 10,
}

#[contractclient(name = "GameHubClient")]
pub trait GameHub {
    fn start_game(
        env: Env,
        game_id: Address,
        session_id: u32,
        player1: Address,
        player2: Address,
        player1_points: i128,
        player2_points: i128,
    );

    fn end_game(env: Env, session_id: u32, player1_won: bool);
}

#[contractclient(name = "VerifierClient")]
pub trait VerifierInterface {
    fn verify(env: Env, proof: Bytes, public_inputs: Vec<BytesN<32>>) -> bool;
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RoomStatus { Lobby, Commit, Settled }

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlayerState {
    pub address: Address,
    pub commitment: BytesN<32>,
    pub has_committed: bool,
    pub parity_guess: u32,       // 0: Par, 1: Ímpar
    pub exact_sum_guess: u32,    // Palpite do número exato
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Room {
    pub player1: PlayerState,
    pub player2: PlayerState,
    pub has_player2: bool,
    pub bet_amount: i128,
    pub status: RoomStatus,
    pub session_id: u32,  // Session ID para integração com Game Hub
    pub winner: Option<Address>,  // Endereço do vencedor após resolve
    pub total_sum: Option<u32>,   // Soma total revelada após resolve
}

#[contracttype]
enum DataKey { 
    Admin, 
    Verifier,
    GameHub,
    RoomCounter, 
    Room(u64), 
    XlmToken, 
    GlobalJackpot, 
    Nullifier(BytesN<32>),
    SessionCounter,
}

#[contract]
pub struct ZkPorrinhaContract;

#[contractimpl]
impl ZkPorrinhaContract {
    pub fn __constructor(env: Env, admin: Address, game_hub: Address, verifier: Address, xlm_token: Address) {
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::GameHub, &game_hub);
        s.set(&DataKey::Verifier, &verifier);
        s.set(&DataKey::XlmToken, &xlm_token);
        s.set(&DataKey::RoomCounter, &0u64);
        s.set(&DataKey::SessionCounter, &0u32);
        s.set(&DataKey::GlobalJackpot, &0i128);
    }

    pub fn create_room(env: Env, player: Address, bet_amount: i128) -> Result<u64, Error> {
        player.require_auth();
        if bet_amount <= 0 { return Err(Error::InvalidBet); }

        let token = token::Client::new(&env, &Self::get_xlm_token(&env)?);
        token.transfer(&player, &env.current_contract_address(), &bet_amount);

        let mut counter: u64 = env.storage().instance().get(&DataKey::RoomCounter).unwrap_or(0);
        counter += 1;
        env.storage().instance().set(&DataKey::RoomCounter, &counter);

        let room = Room {
            player1: PlayerState { address: player, commitment: BytesN::from_array(&env, &[0;32]), has_committed: false, parity_guess: 0, exact_sum_guess: 0 },
            player2: PlayerState { address: env.current_contract_address(), commitment: BytesN::from_array(&env, &[0;32]), has_committed: false, parity_guess: 0, exact_sum_guess: 0 },
            has_player2: false,
            bet_amount,
            status: RoomStatus::Lobby,
            session_id: 0,  // Será criado quando ambos jogadores entrarem
            winner: None,
            total_sum: None,
        };

        Self::save_room(&env, counter, &room);
        Ok(counter)
    }

    pub fn join_room(env: Env, room_id: u64, player: Address) -> Result<(), Error> {
        player.require_auth();
        let mut room = Self::load_room(&env, room_id)?;

        if room.status != RoomStatus::Lobby || room.player1.address == player { return Err(Error::InvalidPhase); }

        let token = token::Client::new(&env, &Self::get_xlm_token(&env)?);
        token.transfer(&player, &env.current_contract_address(), &room.bet_amount);

        room.player2.address = player.clone();
        room.has_player2 = true;
        room.status = RoomStatus::Commit;

        // Gerar session_id e registrar no Game Hub
        let mut session_counter: u32 = env.storage().instance().get(&DataKey::SessionCounter).unwrap_or(0);
        session_counter += 1;
        env.storage().instance().set(&DataKey::SessionCounter, &session_counter);
        room.session_id = session_counter;

        // Chamar Game Hub start_game
        let game_hub = Self::get_game_hub(&env)?;
        let game_hub_client = GameHubClient::new(&env, &game_hub);
        game_hub_client.start_game(
            &env.current_contract_address(),
            &session_counter,
            &room.player1.address,
            &player,
            &room.bet_amount,
            &room.bet_amount,
        );
        
        Self::save_room(&env, room_id, &room);
        Ok(())
    }

    pub fn commit(env: Env, room_id: u64, player: Address, commitment: BytesN<32>, parity: u32, exact_guess: u32) -> Result<(), Error> {
        player.require_auth();
        let mut room = Self::load_room(&env, room_id)?;

        let is_p1 = player == room.player1.address;
        let p_state = if is_p1 { &mut room.player1 } else { &mut room.player2 };

        if p_state.has_committed { return Err(Error::AlreadyCommitted); }

        p_state.commitment = commitment;
        p_state.parity_guess = parity;
        p_state.exact_sum_guess = exact_guess;
        p_state.has_committed = true;

        Self::save_room(&env, room_id, &room);
        Ok(())
    }

    pub fn resolve(env: Env, room_id: u64, proof: Bytes, total_sum: u32, nullifier: BytesN<32>) -> Result<(), Error> {
        let mut room = Self::load_room(&env, room_id)?;
        if room.status != RoomStatus::Commit || !room.player1.has_committed || !room.player2.has_committed { 
            return Err(Error::InvalidPhase); 
        }

        // 1. Verificação de Nullifier (Replay Attack)
        let nullifier_key = DataKey::Nullifier(nullifier.clone());
        if env.storage().instance().has(&nullifier_key) {
            return Err(Error::NullifierUsed);
        }

        // 2. Verificação ZK
        let verifier = VerifierClient::new(&env, &Self::get_verifier(&env)?);
        let mut public_inputs = Vec::new(&env);
        public_inputs.push_back(room.player1.commitment.clone());
        public_inputs.push_back(room.player2.commitment.clone());
        public_inputs.push_back(Self::u32_to_bytes32(&env, total_sum));
        public_inputs.push_back(nullifier.clone());

        if !verifier.verify(&proof, &public_inputs) { return Err(Error::InvalidProof); }

        // 3. Registro do Nullifier
        env.storage().instance().set(&nullifier_key, &true);

        // 4. Lógica de Payout 80/20
        let total_pot = room.bet_amount * 2;
        let parity_pool = (total_pot * 80) / 100;
        let exact_contribution = total_pot - parity_pool; // Os 20% desta rodada

        let real_parity = total_sum % 2;
        let p1_wins_parity = room.player1.parity_guess == real_parity;
        let p2_wins_parity = room.player2.parity_guess == real_parity;

        let token = token::Client::new(&env, &Self::get_xlm_token(&env)?);

        // --- DISTRIBUIÇÃO DOS 80% (Paridade) ---
        if p1_wins_parity && !p2_wins_parity {
            token.transfer(&env.current_contract_address(), &room.player1.address, &parity_pool);
        } else if p2_wins_parity && !p1_wins_parity {
            token.transfer(&env.current_contract_address(), &room.player2.address, &parity_pool);
        } else {
            token.transfer(&env.current_contract_address(), &room.player1.address, &(parity_pool / 2));
            token.transfer(&env.current_contract_address(), &room.player2.address, &(parity_pool / 2));
        }

        // --- DISTRIBUIÇÃO DOS 20% (Jackpot Acumulado) ---
        let mut jackpot: i128 = env.storage().instance().get(&DataKey::GlobalJackpot).unwrap_or(0);
        let p1_wins_exact = room.player1.exact_sum_guess == total_sum;
        let p2_wins_exact = room.player2.exact_sum_guess == total_sum;

        let player1_won = if p1_wins_exact || p2_wins_exact {
            let winner = if p1_wins_exact { &room.player1.address } else { &room.player2.address };
            let total_jackpot_prize = exact_contribution + jackpot;
            token.transfer(&env.current_contract_address(), winner, &total_jackpot_prize);
            env.storage().instance().set(&DataKey::GlobalJackpot, &0i128);
            room.winner = Some(winner.clone());
            p1_wins_exact  // Player 1 venceu se acertou o exato
        } else {
            // Se ninguém acertar o total, os 20% acumulam no pote global
            jackpot += exact_contribution;
            env.storage().instance().set(&DataKey::GlobalJackpot, &jackpot);
            // Vencedor é baseado na paridade
            let winner = if p1_wins_parity { &room.player1.address } else { &room.player2.address };
            room.winner = Some(winner.clone());
            p1_wins_parity  // Decidir pelo vencedor da paridade
        };

        // Salvar a soma total revelada
        room.total_sum = Some(total_sum);

        // Chamar Game Hub end_game
        let game_hub = Self::get_game_hub(&env)?;
        let game_hub_client = GameHubClient::new(&env, &game_hub);
        game_hub_client.end_game(&room.session_id, &player1_won);

        room.status = RoomStatus::Settled;
        Self::save_room(&env, room_id, &room);
        Ok(())
    }

    // --- Read-Only Methods (para UI) ---
    pub fn get_room(env: Env, room_id: u64) -> Result<Room, Error> {
        Self::load_room(&env, room_id)
    }

    pub fn get_room_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::RoomCounter).unwrap_or(0)
    }

    // --- Auxiliares ---
    fn u32_to_bytes32(env: &Env, val: u32) -> BytesN<32> {
        let mut b = [0u8; 32];
        let val_b = val.to_be_bytes();
        b[31] = val_b[3]; b[30] = val_b[2]; b[29] = val_b[1]; b[28] = val_b[0];
        BytesN::from_array(env, &b)
    }

    fn load_room(env: &Env, room_id: u64) -> Result<Room, Error> {
        env.storage().temporary().get(&DataKey::Room(room_id)).ok_or(Error::RoomNotFound)
    }

    fn save_room(env: &Env, room_id: u64, room: &Room) {
        env.storage().temporary().set(&DataKey::Room(room_id), room);
    }

    fn get_xlm_token(env: &Env) -> Result<Address, Error> { env.storage().instance().get(&DataKey::XlmToken).ok_or(Error::XlmTokenNotSet) }
    fn get_verifier(env: &Env) -> Result<Address, Error> { env.storage().instance().get(&DataKey::Verifier).ok_or(Error::VerifierNotSet) }
    fn get_game_hub(env: &Env) -> Result<Address, Error> { env.storage().instance().get(&DataKey::GameHub).ok_or(Error::GameHubNotSet) }
}