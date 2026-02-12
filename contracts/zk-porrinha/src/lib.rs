#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype, token, vec,
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
    SelfPlayForbidden = 6,
    InvalidBet = 7,
    TimeoutNotReached = 8,
    AlreadyInitialized = 9,
    InvalidHandValue = 10,
    InvalidGuess = 11,
    CommitmentMismatch = 12,
    GameAlreadyStarted = 13,
    XlmTokenNotSet = 14,
    GameHubNotSet = 15,
    VerifierNotSet = 16,
    AdminNotSet = 17,
}

#[contractclient(name = "VerifierClient")]
pub trait VerifierInterface {
    fn verify(env: Env, proof: Bytes, public_inputs: Vec<BytesN<32>>) -> bool;
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

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RoomStatus {
    Lobby,
    Commit,
    Settled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlayerState {
    pub address: Address,
    pub commitment: Option<BytesN<32>>,
    pub has_committed: bool,
    pub revealed_hand: Option<u32>,        
    pub revealed_parity: Option<u32>,      
    pub revealed_total_guess: Option<u32>, 
    pub jackpot_hit: bool,
}

impl PlayerState {
    fn new(_env: &Env, address: Address) -> Self {
        Self {
            address,
            commitment: None,
            has_committed: false,
            revealed_hand: None,
            revealed_parity: None,
            revealed_total_guess: None,
            jackpot_hit: false,
        }
    }

    fn reset(&mut self) {
        self.commitment = None;
        self.has_committed = false;
        self.revealed_hand = None;
        self.revealed_parity = None;
        self.revealed_total_guess = None;
        self.jackpot_hit = false;
    }
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Room {
    pub id: u64,
    pub player1: PlayerState,
    pub player2: PlayerState,
    pub has_player2: bool,
    pub bet_amount: i128,
    pub jackpot_pool: i128,
    pub jackpot_accumulated: i64,
    pub jackpot_accumulated_hash: BytesN<32>,
    pub last_action_ledger: u32,
    pub status: RoomStatus,
    pub session_id: u32,
    pub last_winner: Option<Address>,
    pub rounds_played: u32,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Verifier,
    GameHub,
    RoomCounter,
    Room(u64),
    XlmToken,
}

#[contractevent]
pub struct RoomCreated {
    pub room_id: u64,
    pub player: Address,
    pub bet_amount: i128,
}

#[contractevent]
pub struct RoomJoined {
    pub room_id: u64,
    pub player: Address,
}

#[contractevent]
pub struct BothCommitted {
    pub room_id: u64,
}

#[contractevent]
pub struct HandCommitted {
    pub room_id: u64,
    pub player: Address,
}

#[contractevent]
pub struct HandRevealed {
    pub room_id: u64,
    pub player: Address,
    pub hand: u32,
    pub parity: u32,
}

#[contractevent]
pub struct TimeoutClaimed {
    pub room_id: u64,
    pub winner: Address,
}

#[contractevent]
pub struct JackpotWon {
    pub room_id: u64,
    pub winner: Address,
    pub amount: i128,
}

#[contractevent]
pub struct JackpotSplit {
    pub room_id: u64,
    pub amount: i128,
}

#[contractevent]
pub struct ParityWinner {
    pub room_id: u64,
    pub winner: Address,
    pub total_fingers: u32,
    pub actual_parity: u32,
}

#[contractevent]
pub struct ParityDraw {
    pub room_id: u64,
    pub total_fingers: u32,
    pub actual_parity: u32,
}

const TIMEOUT_LEDGERS: u32 = 100;
const ROOM_TTL_LEDGERS: u32 = 518_400;

#[contract]
pub struct ZkPorrinhaContract;

#[contractimpl]
impl ZkPorrinhaContract {
    pub fn __constructor(
        env: Env,
        admin: Address,
        verifier: Address,
        game_hub: Address,
        xlm_token: Address,
    ) {
        let storage = env.storage().instance();
        if storage.has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        storage.set(&DataKey::Admin, &admin);
        storage.set(&DataKey::Verifier, &verifier);
        storage.set(&DataKey::GameHub, &game_hub);
        storage.set(&DataKey::XlmToken, &xlm_token);
        storage.set(&DataKey::RoomCounter, &0u64);
    }

    pub fn create_room(env: Env, player: Address, bet_amount: i128) -> Result<u64, Error> {
        player.require_auth();

        if bet_amount <= 0 {
            return Err(Error::InvalidBet);
        }

        let token_client = token::Client::new(&env, &Self::get_xlm_token(&env)?);
        token_client.transfer(&player, &env.current_contract_address(), &bet_amount);

        let mut counter: u64 = env
            .storage()
            .instance()
            .get(&DataKey::RoomCounter)
            .unwrap_or(0);
        counter += 1;
        env.storage()
            .instance()
            .set(&DataKey::RoomCounter, &counter);

        let initial_hash = hash_accumulated(&env, 0i64);

        let room = Room {
            id: counter,
            player1: PlayerState::new(&env, player.clone()),
            player2: PlayerState::new(&env, player.clone()), // placeholder
            has_player2: false,
            bet_amount,
            jackpot_pool: 0,
            jackpot_accumulated: 0,
            jackpot_accumulated_hash: initial_hash,
            last_action_ledger: env.ledger().sequence(),
            status: RoomStatus::Lobby,
            session_id: counter as u32,
            last_winner: None,
            rounds_played: 0,
        };

        Self::save_room(&env, counter, &room);

        RoomCreated {
            room_id: counter,
            player,
            bet_amount,
        }
        .publish(&env);

        Ok(counter)
    }

    pub fn join_room(env: Env, room_id: u64, player: Address) -> Result<(), Error> {
        player.require_auth();

        let mut room = Self::load_room(&env, room_id)?;

        if room.status != RoomStatus::Lobby {
            return Err(Error::InvalidPhase);
        }
        if room.player1.address == player {
            return Err(Error::SelfPlayForbidden);
        }

        let token_client = token::Client::new(&env, &Self::get_xlm_token(&env)?);
        token_client.transfer(&player, &env.current_contract_address(), &room.bet_amount);

        room.player2 = PlayerState::new(&env, player.clone());
        room.has_player2 = true;
        room.status = RoomStatus::Commit;
        room.last_action_ledger = env.ledger().sequence();

        let hub_client = GameHubClient::new(&env, &Self::get_game_hub(&env)?);
        hub_client.start_game(
            &env.current_contract_address(),
            &room.session_id,
            &room.player1.address,
            &player,
            &room.bet_amount,
            &room.bet_amount,
        );

        Self::save_room(&env, room_id, &room);

        RoomJoined { room_id, player }.publish(&env);

        Ok(())
    }

    pub fn commit_hand(
        env: Env,
        room_id: u64,
        player: Address,
        commitment: BytesN<32>,
        proof: Bytes,
        hand: u32,
        parity: u32,
        total_guess: u32,
        jackpot_hit: bool,
    ) -> Result<(), Error> {
        player.require_auth();
        
        if hand > 5 {
            return Err(Error::InvalidHandValue);
        }
        if parity > 1 {
            return Err(Error::InvalidGuess);
        }
        if total_guess > 10 {
            return Err(Error::InvalidGuess);
        }
        
        let mut room = Self::load_room(&env, room_id)?;

        if room.status != RoomStatus::Commit {
            return Err(Error::InvalidPhase);
        }

        let (is_p1, is_p2) = Self::identify_player(&room, &player);
        if !is_p1 && !is_p2 {
            return Err(Error::NotPlayer);
        }
        if is_p1 && room.player1.has_committed {
            return Err(Error::AlreadyCommitted);
        }
        if is_p2 && room.player2.has_committed {
            return Err(Error::AlreadyCommitted);
        }

        let verifier_client = VerifierClient::new(&env, &Self::get_verifier(&env)?);

        fn u32_to_bytesn(env: &Env, v: u32) -> BytesN<32> {
            let mut buf = [0u8; 32];
            let b = v.to_be_bytes();
            buf[32 - 4..].copy_from_slice(&b);
            BytesN::from_array(env, &buf)
        }
        fn bool_to_bytesn(env: &Env, b: bool) -> BytesN<32> {
            let mut buf = [0u8; 32];
            let v: u32 = if b { 1 } else { 0 };
            let bv = v.to_be_bytes();
            buf[32 - 4..].copy_from_slice(&bv);
            BytesN::from_array(env, &buf)
        }

        let hand_b = u32_to_bytesn(&env, hand);
        let parity_b = u32_to_bytesn(&env, parity);
        let total_b = u32_to_bytesn(&env, total_guess);
        let jackpot_hit_b = bool_to_bytesn(&env, jackpot_hit);

        let public_inputs = vec![
            &env,
            commitment.clone(),
            hand_b,
            parity_b,
            total_b,
            jackpot_hit_b,
            room.jackpot_accumulated_hash.clone(),
        ];

        if !verifier_client.verify(&proof, &public_inputs) {
            return Err(Error::InvalidProof);
        }

        if is_p1 {
            room.player1.commitment = Some(commitment);
            room.player1.has_committed = true;
            room.player1.revealed_hand = Some(hand);
            room.player1.revealed_parity = Some(parity);
            room.player1.revealed_total_guess = Some(total_guess);
            room.player1.jackpot_hit = jackpot_hit;
        } else {
            room.player2.commitment = Some(commitment);
            room.player2.has_committed = true;
            room.player2.revealed_hand = Some(hand);
            room.player2.revealed_parity = Some(parity);
            room.player2.revealed_total_guess = Some(total_guess);
            room.player2.jackpot_hit = jackpot_hit;
        }

        room.last_action_ledger = env.ledger().sequence();

        if room.player1.has_committed && room.player2.has_committed {
            BothCommitted { room_id }.publish(&env);
            finalize_round(&env, &mut room, room_id)?;
        }

        Self::save_room(&env, room_id, &room);

        HandCommitted { room_id, player }.publish(&env);

        Ok(())
    }

    pub fn claim_timeout(env: Env, room_id: u64, claimer: Address) -> Result<(), Error> {
        claimer.require_auth();

        let mut room = Self::load_room(&env, room_id)?;

        if env.ledger().sequence() < room.last_action_ledger + TIMEOUT_LEDGERS {
            return Err(Error::TimeoutNotReached);
        }

        let (is_p1, is_p2) = Self::identify_player(&room, &claimer);
        if !is_p1 && !is_p2 {
            return Err(Error::NotPlayer);
        }

        let valid_timeout = if is_p1 {
            room.player1.has_committed && !room.player2.has_committed
        } else {
            room.player2.has_committed && !room.player1.has_committed
        };

        if !valid_timeout {
            return Err(Error::TimeoutNotReached);
        }

        let winner = if is_p1 {
            room.player1.address.clone()
        } else {
            room.player2.address.clone()
        };

        let token_client = token::Client::new(&env, &Self::get_xlm_token(&env)?);
        token_client.transfer(
            &env.current_contract_address(),
            &winner,
            &(room.bet_amount * 2),
        );

        let hub_client = GameHubClient::new(&env, &Self::get_game_hub(&env)?);
        hub_client.end_game(&room.session_id, &is_p1);

        room.last_winner = Some(winner.clone());
        room.rounds_played += 1;

        Self::reset_or_close(&env, &mut room);
        Self::save_room(&env, room_id, &room);

        TimeoutClaimed { room_id, winner }.publish(&env);

        Ok(())
    }

    pub fn get_room(env: Env, room_id: u64) -> Result<Room, Error> {
        Self::load_room(&env, room_id)
    }

    pub fn get_jackpot_hash(env: Env, room_id: u64) -> Result<BytesN<32>, Error> {
        Ok(Self::load_room(&env, room_id)?.jackpot_accumulated_hash)
    }

    pub fn get_room_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::RoomCounter)
            .unwrap_or(0)
    }

    pub fn get_admin(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::AdminNotSet)
    }

    pub fn set_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        Self::require_admin(&env)?;
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        Ok(())
    }

    pub fn set_hub(env: Env, new_hub: Address) -> Result<(), Error> {
        Self::require_admin(&env)?;
        env.storage().instance().set(&DataKey::GameHub, &new_hub);
        Ok(())
    }

    pub fn set_verifier(env: Env, new_verifier: Address) -> Result<(), Error> {
        Self::require_admin(&env)?;
        env.storage()
            .instance()
            .set(&DataKey::Verifier, &new_verifier);
        Ok(())
    }

    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        Self::require_admin(&env)?;
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Ok(())
    }

    fn get_xlm_token(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::XlmToken)
            .ok_or(Error::XlmTokenNotSet)
    }

    fn get_game_hub(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::GameHub)
            .ok_or(Error::GameHubNotSet)
    }

    fn get_verifier(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Verifier)
            .ok_or(Error::VerifierNotSet)
    }

    fn require_admin(env: &Env) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::AdminNotSet)?;
        admin.require_auth();
        Ok(())
    }

    fn identify_player(room: &Room, player: &Address) -> (bool, bool) {
        let is_p1 = *player == room.player1.address;
        let is_p2 = room.has_player2 && *player == room.player2.address;
        (is_p1, is_p2)
    }

    fn load_room(env: &Env, room_id: u64) -> Result<Room, Error> {
        env.storage()
            .temporary()
            .get(&DataKey::Room(room_id))
            .ok_or(Error::RoomNotFound)
    }

    fn save_room(env: &Env, room_id: u64, room: &Room) {
        let key = DataKey::Room(room_id);
        env.storage().temporary().set(&key, room);
        env.storage()
            .temporary()
            .extend_ttl(&key, ROOM_TTL_LEDGERS, ROOM_TTL_LEDGERS);
    }

    fn reset_or_close(_env: &Env, room: &mut Room) {
        if room.jackpot_pool > 0 {
            room.status = RoomStatus::Lobby;
            room.has_player2 = false;
            room.player1.reset();
            room.player2.reset();
        } else {
            room.status = RoomStatus::Settled;
        }
    }
}

fn finalize_round(env: &Env, room: &mut Room, room_id: u64) -> Result<(), Error> {
    let hand1 = room.player1.revealed_hand.expect("P1 hand not set");
    let hand2 = room.player2.revealed_hand.expect("P2 hand not set");
    let parity1 = room.player1.revealed_parity.expect("P1 parity not set");
    let parity2 = room.player2.revealed_parity.expect("P2 parity not set");
    let total_guess1 = room.player1.revealed_total_guess.expect("P1 total_guess not set");
    let total_guess2 = room.player2.revealed_total_guess.expect("P2 total_guess not set");
    let jackpot1 = room.player1.jackpot_hit;
    let jackpot2 = room.player2.jackpot_hit;

    let total_real = hand1 + hand2;
    let parity_real: u32 = if total_real % 2 == 0 { 0 } else { 1 };

    let p1_wins_parity = parity1 == parity_real;
    let p2_wins_parity = parity2 == parity_real;

    let p1_wins_total = total_guess1 == total_real;
    let p2_wins_total = total_guess2 == total_real;

    let bet = room.bet_amount;
    let total_pot = bet * 2;  
    let jackpot = room.jackpot_pool;

    let xlm_token: Address = ZkPorrinhaContract::get_xlm_token(env)?;
    let token_client = token::Client::new(env, &xlm_token);

    let hub_addr: Address = ZkPorrinhaContract::get_game_hub(env)?;
    let hub_client = GameHubClient::new(env, &hub_addr);

    let p1_addr = room.player1.address.clone();
    let p2_addr = room.player2.address.clone();

    let is_draw = p1_wins_parity == p2_wins_parity;
    
    if is_draw {
        token_client.transfer(&env.current_contract_address(), &p1_addr, &bet);
        token_client.transfer(&env.current_contract_address(), &p2_addr, &bet);
        hub_client.end_game(&room.session_id, &false);
        ParityDraw {
            room_id,
            total_fingers: total_real,
            actual_parity: parity_real,
        }
        .publish(&env);
    } else {
        let winner_addr = if p1_wins_parity { &p1_addr } else { &p2_addr };
        let winner_share = (total_pot * 80) / 100;  // 80%
        let jackpot_contribution = total_pot - winner_share;  // 20%

        token_client.transfer(&env.current_contract_address(), winner_addr, &winner_share);
   
        room.jackpot_pool += jackpot_contribution;
        room.last_winner = Some(winner_addr.clone());
        hub_client.end_game(&room.session_id, &p1_wins_parity);
        ParityWinner {
            room_id,
            winner: winner_addr.clone(),
            total_fingers: total_real,
            actual_parity: parity_real,
        }
        .publish(&env);
    }

    if jackpot > 0 {
        match (jackpot1, jackpot2) {
            (true, false) => {
                token_client.transfer(&env.current_contract_address(), &p1_addr, &jackpot);
                room.jackpot_pool = room.jackpot_pool.saturating_sub(jackpot);
                JackpotWon {
                    room_id,
                    winner: p1_addr.clone(),
                    amount: jackpot,
                }
                .publish(&env);
            }
            (false, true) => {
                token_client.transfer(&env.current_contract_address(), &p2_addr, &jackpot);
                room.jackpot_pool = room.jackpot_pool.saturating_sub(jackpot);
                JackpotWon {
                    room_id,
                    winner: p2_addr.clone(),
                    amount: jackpot,
                }
                .publish(&env);
            }
            (true, true) => {
                let half = jackpot / 2;
                let remainder = jackpot - half * 2;
                token_client.transfer(
                    &env.current_contract_address(),
                    &p1_addr,
                    &(half + remainder),
                );
                token_client.transfer(&env.current_contract_address(), &p2_addr, &half);
                room.jackpot_pool = room.jackpot_pool.saturating_sub(jackpot);
                JackpotSplit {
                    room_id,
                    amount: jackpot,
                }
                .publish(&env);
            }
            (false, false) => {
            }
        }
    }

    let mut seed = Bytes::new(env);
    seed.append(&Bytes::from_array(env, &room_id.to_be_bytes()));
    seed.append(&Bytes::from_array(env, &room.rounds_played.to_be_bytes()));
    seed.append(&Bytes::from_array(env, &hand1.to_be_bytes()));
    seed.append(&Bytes::from_array(env, &hand2.to_be_bytes()));
    let seed_hash = env.crypto().keccak256(&seed);
    env.prng().seed(seed_hash.into());

    let jackpot_number = env.prng().gen_range::<u64>(0..100) as i64;
    let new_accumulated = room
        .jackpot_accumulated
        .saturating_add(jackpot_number);

    room.jackpot_accumulated = new_accumulated;
    room.jackpot_accumulated_hash = hash_accumulated(env, new_accumulated);
    room.rounds_played += 1;

    ZkPorrinhaContract::reset_or_close(env, room);
    Ok(())
}

fn hash_accumulated(env: &Env, accumulated: i64) -> BytesN<32> {
    let mut data = Bytes::new(env);
    data.append(&Bytes::from_array(env, &accumulated.to_be_bytes()));
    BytesN::from_array(env, &env.crypto().sha256(&data).to_array())
}

#[cfg(test)]
mod test;
