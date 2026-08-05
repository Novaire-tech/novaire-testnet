#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, Symbol};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum NovaireMaturityError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    EpochNotFound = 4,
    EpochNotActive = 5,
    EpochNotSettled = 6,
    EpochAlreadySettled = 7,
    EpochAlreadyActive = 8,
    MaturityNotReached = 9,
    ZeroAmount = 10,
    StorageMissing = 11,
    InvalidStateTransition = 12,
    InvariantViolated = 13,
    MathOverflow = 14,
    InvalidMaturity = 15,
}

/// The finite-state machine (FSM) representing an epoch's lifecycle.
/// - NO_EPOCH -> ACTIVE (via open_epoch)
/// - ACTIVE -> MATURED (implicitly evaluated when ledger sequence >= maturity)
/// - MATURED -> SETTLED (explicitly cranked via settle_epoch permissionlessly)
/// - SETTLED -> ARCHIVED (explicitly cranked via archive_epoch by admin)
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum EpochState {
    Active = 0,
    Matured = 1, // Dynamically evaluated if sequence >= maturity
    Settled = 2,
    Archived = 3,
}

/// Represents the persisted storage state of an epoch.
/// Note: The `state` field may temporarily diverge from the protocol's true dynamic state.
/// When the current ledger exceeds `maturity_ledger`, the true state is `Matured`, 
/// even if the persisted storage still says `Active` (before `settle_epoch` is called).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EpochRecord {
    pub epoch_id: u32,
    pub maturity_ledger: u32,
    pub creation_ledger: u32,
    pub state: EpochState,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProtocolStatus {
    pub current_epoch_id: u32,
    pub is_active: bool,
    pub time_to_maturity: u32,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    CurrentEpochId,
    Epoch(u32),
}

mod storage {
    use super::*;

    pub fn is_initialized(env: &Env) -> bool {
        env.storage().instance().has(&DataKey::Admin)
    }

    pub fn get_admin(env: &Env) -> Result<Address, NovaireMaturityError> {
        env.storage().instance().get(&DataKey::Admin).ok_or(NovaireMaturityError::StorageMissing)
    }

    pub fn get_current_epoch_id(env: &Env) -> u32 {
        env.storage().instance().get(&DataKey::CurrentEpochId).unwrap_or(0)
    }

    pub fn set_current_epoch_id(env: &Env, id: u32) {
        env.storage().instance().set(&DataKey::CurrentEpochId, &id);
    }

    pub fn get_epoch(env: &Env, epoch_id: u32) -> Result<EpochRecord, NovaireMaturityError> {
        env.storage().persistent().get(&DataKey::Epoch(epoch_id)).ok_or(NovaireMaturityError::EpochNotFound)
    }

    pub fn set_epoch(env: &Env, epoch_id: u32, record: &EpochRecord) {
        env.storage().persistent().set(&DataKey::Epoch(epoch_id), record);
    }
}

/// The Maturity Engine is the deterministic global epoch state machine for Novaire.
/// It orchestrates epoch boundaries and ensures lazy ledger evaluation is safely applied.
#[contract]
pub struct MaturityEngine;

#[contractimpl]
impl MaturityEngine {
    pub fn initialize(env: Env, admin: Address) -> Result<(), NovaireMaturityError> {
        if storage::is_initialized(&env) {
            return Err(NovaireMaturityError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        storage::set_current_epoch_id(&env, 0);
        Ok(())
    }

    pub fn open_epoch(env: Env, maturity_ledger: u32) -> Result<u32, NovaireMaturityError> {
        let admin = storage::get_admin(&env)?;
        admin.require_auth();

        let current_sequence = env.ledger().sequence();
        if maturity_ledger <= current_sequence {
            return Err(NovaireMaturityError::InvalidMaturity);
        }

        let current_epoch_id = storage::get_current_epoch_id(&env);
        if current_epoch_id > 0 {
            let current_epoch = storage::get_epoch(&env, current_epoch_id)?;
            if current_epoch.state == EpochState::Active || Self::evaluate_state(&env, &current_epoch) == EpochState::Matured {
                return Err(NovaireMaturityError::EpochAlreadyActive);
            }
        }

        let new_epoch_id = current_epoch_id.checked_add(1).ok_or(NovaireMaturityError::MathOverflow)?;
        storage::set_current_epoch_id(&env, new_epoch_id);

        let new_epoch = EpochRecord {
            epoch_id: new_epoch_id,
            maturity_ledger,
            creation_ledger: current_sequence,
            state: EpochState::Active,
        };

        storage::set_epoch(&env, new_epoch_id, &new_epoch);
        env.events().publish((Symbol::new(&env, "epoch_opened"),), (new_epoch_id, maturity_ledger, current_sequence));

        Self::assert_invariant(env.clone())?;
        Ok(new_epoch_id)
    }

    pub fn settle_epoch(env: Env, epoch_id: u32) -> Result<(), NovaireMaturityError> {
        let mut epoch = storage::get_epoch(&env, epoch_id)?;
        let dynamic_state = Self::evaluate_state(&env, &epoch);

        if dynamic_state == EpochState::Settled || dynamic_state == EpochState::Archived {
            return Err(NovaireMaturityError::EpochAlreadySettled);
        }
        if dynamic_state == EpochState::Active {
            return Err(NovaireMaturityError::MaturityNotReached);
        }

        epoch.state = EpochState::Settled;
        storage::set_epoch(&env, epoch_id, &epoch);
        
        env.events().publish((Symbol::new(&env, "epoch_settled"),), (epoch_id,));

        Self::assert_invariant(env.clone())?;
        Ok(())
    }

    pub fn archive_epoch(env: Env, epoch_id: u32) -> Result<(), NovaireMaturityError> {
        let admin = storage::get_admin(&env)?;
        admin.require_auth();

        let mut epoch = storage::get_epoch(&env, epoch_id)?;
        if epoch.state != EpochState::Settled {
            return Err(NovaireMaturityError::InvalidStateTransition);
        }

        epoch.state = EpochState::Archived;
        storage::set_epoch(&env, epoch_id, &epoch);

        env.events().publish((Symbol::new(&env, "epoch_archived"),), (epoch_id,));
        
        Self::assert_invariant(env.clone())?;
        Ok(())
    }

    fn evaluate_state(env: &Env, epoch: &EpochRecord) -> EpochState {
        if epoch.state == EpochState::Archived {
            return EpochState::Archived;
        }
        if epoch.state == EpochState::Settled {
            return EpochState::Settled;
        }
        if env.ledger().sequence() >= epoch.maturity_ledger {
            return EpochState::Matured;
        }
        EpochState::Active
    }

    pub fn get_epoch(env: Env, epoch_id: u32) -> Result<EpochRecord, NovaireMaturityError> {
        storage::get_epoch(&env, epoch_id)
    }

    pub fn current_epoch(env: Env) -> Result<EpochRecord, NovaireMaturityError> {
        let current_id = storage::get_current_epoch_id(&env);
        if current_id == 0 {
            return Err(NovaireMaturityError::EpochNotFound);
        }
        storage::get_epoch(&env, current_id)
    }

    pub fn next_epoch(env: Env) -> Result<u32, NovaireMaturityError> {
        let current_id = storage::get_current_epoch_id(&env);
        current_id.checked_add(1).ok_or(NovaireMaturityError::MathOverflow)
    }

    pub fn epoch_history(env: Env, epoch_id: u32) -> Result<EpochRecord, NovaireMaturityError> {
        storage::get_epoch(&env, epoch_id)
    }

    pub fn total_epochs(env: Env) -> u32 {
        storage::get_current_epoch_id(&env)
    }

    pub fn protocol_status(env: Env) -> ProtocolStatus {
        let current_id = storage::get_current_epoch_id(&env);
        let mut is_active = false;
        let mut ttm = 0;

        if current_id > 0 {
            if let Ok(epoch) = storage::get_epoch(&env, current_id) {
                let state = Self::evaluate_state(&env, &epoch);
                if state == EpochState::Active {
                    is_active = true;
                    ttm = epoch.maturity_ledger.saturating_sub(env.ledger().sequence());
                }
            }
        }

        ProtocolStatus {
            current_epoch_id: current_id,
            is_active,
            time_to_maturity: ttm,
        }
    }

    pub fn time_to_maturity(env: Env) -> u32 {
        Self::protocol_status(env).time_to_maturity
    }

    pub fn is_active(env: Env) -> bool {
        Self::protocol_status(env).is_active
    }

    pub fn is_settled(env: Env) -> bool {
        if let Ok(epoch) = Self::current_epoch(env.clone()) {
            Self::evaluate_state(&env, &epoch) == EpochState::Settled
        } else {
            false
        }
    }

    fn assert_invariant(env: Env) -> Result<(), NovaireMaturityError> {
        let current_id = storage::get_current_epoch_id(&env);
        if current_id > 0 {
            let epoch = storage::get_epoch(&env, current_id)?;
            if epoch.creation_ledger >= epoch.maturity_ledger {
                return Err(NovaireMaturityError::InvariantViolated);
            }
            if epoch.epoch_id != current_id {
                return Err(NovaireMaturityError::InvariantViolated);
            }
        }
        Ok(())
    }
}

// --------------------------------------------------------------------------------
// TESTS
// --------------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, testutils::Ledger, Address, Env};

    fn setup_env() -> (Env, Address, MaturityEngineClient<'static>) {
        let env = Env::default();
        env.mock_all_auths_allowing_non_root_auth();

        let admin = Address::generate(&env);
        let me_contract_id = env.register(MaturityEngine, ());
        let me_client = MaturityEngineClient::new(&env, &me_contract_id);

        me_client.initialize(&admin);
        (env, admin, me_client)
    }

    #[test]
    fn test_lifecycle_and_invariants() {
        let (env, _admin, me_client) = setup_env();
        
        let start_ledger = 100;
        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: start_ledger,
            ..env.ledger().get()
        });

        // 1. Open Epoch
        let maturity = start_ledger + 1000;
        let epoch_id = me_client.open_epoch(&maturity);
        assert_eq!(epoch_id, 1);
        
        assert!(me_client.is_active());
        assert!(!me_client.is_settled());
        assert_eq!(me_client.time_to_maturity(), 1000);

        let status = me_client.protocol_status();
        assert_eq!(status.current_epoch_id, 1);
        assert!(status.is_active);
        assert_eq!(status.time_to_maturity, 1000);

        // Cannot open another active epoch
        let res = me_client.try_open_epoch(&(maturity + 100));
        assert!(res.is_err());

        // Cannot settle premature
        let res = me_client.try_settle_epoch(&epoch_id);
        assert!(res.is_err());

        // 2. Matured -> Settle
        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: maturity + 1,
            ..env.ledger().get()
        });

        assert!(!me_client.is_active()); // dynamic check
        
        me_client.settle_epoch(&epoch_id);
        assert!(me_client.is_settled());

        // Cannot double settle
        let res = me_client.try_settle_epoch(&epoch_id);
        assert!(res.is_err());

        // 3. Archive
        me_client.archive_epoch(&epoch_id);
        assert!(!me_client.is_settled()); // it is now archived, not settled
        
        let epoch = me_client.get_epoch(&epoch_id);
        assert_eq!(epoch.state, EpochState::Archived);

        // 4. Next Epoch
        assert_eq!(me_client.next_epoch(), 2);
        
        let new_maturity = maturity + 1 + 1000;
        let new_epoch_id = me_client.open_epoch(&new_maturity);
        assert_eq!(new_epoch_id, 2);
    }

    #[test]
    fn test_sequential_epoch_lifecycle() {
        let (env, _admin, me_client) = setup_env();
        
        let mut sequence = 100;
        
        for i in 1..=50 { // Using 50 to keep test execution fast
            env.ledger().set(soroban_sdk::testutils::LedgerInfo {
                sequence_number: sequence,
                ..env.ledger().get()
            });

            let maturity = sequence + 10;
            let epoch_id = me_client.open_epoch(&maturity);
            assert_eq!(epoch_id, i);

            // Mature & Settle
            sequence += 11;
            env.ledger().set(soroban_sdk::testutils::LedgerInfo {
                sequence_number: sequence,
                ..env.ledger().get()
            });
            me_client.settle_epoch(&epoch_id);

            // Archive
            me_client.archive_epoch(&epoch_id);
            
            sequence += 1;
        }

        // Verify all 50 epochs remain queryable and archived
        for i in 1..=50 {
            let epoch = me_client.epoch_history(&i);
            assert_eq!(epoch.epoch_id, i);
            assert_eq!(epoch.state, EpochState::Archived);
        }
        
        assert_eq!(me_client.total_epochs(), 50);
    }

    #[test]
    fn test_ledger_boundaries() {
        let (env, _admin, me_client) = setup_env();
        
        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: 100,
            ..env.ledger().get()
        });

        let maturity = 110;
        let epoch_id = me_client.open_epoch(&maturity);

        // ledger == maturity - 1
        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: maturity - 1,
            ..env.ledger().get()
        });
        assert!(me_client.is_active());
        assert!(me_client.try_settle_epoch(&epoch_id).is_err());

        // ledger == maturity
        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: maturity,
            ..env.ledger().get()
        });
        assert!(!me_client.is_active());
        // Settlement should now be valid
        me_client.settle_epoch(&epoch_id);
    }

    #[test]
    fn test_invalid_transitions() {
        let (env, _admin, me_client) = setup_env();
        
        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: 100,
            ..env.ledger().get()
        });

        let epoch_id = me_client.open_epoch(&200);

        // Cannot archive Active epoch
        assert!(me_client.try_archive_epoch(&epoch_id).is_err());
        
        // Advance to maturity
        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: 200,
            ..env.ledger().get()
        });
        
        // Cannot archive Matured epoch (must be settled first)
        assert!(me_client.try_archive_epoch(&epoch_id).is_err());

        me_client.settle_epoch(&epoch_id);
        
        // Cannot double settle
        assert!(me_client.try_settle_epoch(&epoch_id).is_err());

        me_client.archive_epoch(&epoch_id);
        
        // Cannot double archive
        assert!(me_client.try_archive_epoch(&epoch_id).is_err());
        
        // Cannot settle archived
        assert!(me_client.try_settle_epoch(&epoch_id).is_err());

        // Open epoch with past maturity
        assert!(me_client.try_open_epoch(&150).is_err());
    }

    #[test]
    fn test_read_apis() {
        let (env, _admin, me_client) = setup_env();
        
        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: 100,
            ..env.ledger().get()
        });

        assert_eq!(me_client.total_epochs(), 0);
        assert!(!me_client.is_active());
        assert!(!me_client.is_settled());
        assert!(me_client.try_current_epoch().is_err());

        me_client.open_epoch(&200);
        
        assert_eq!(me_client.total_epochs(), 1);
        assert!(me_client.is_active());
        assert_eq!(me_client.time_to_maturity(), 100);
        
        let status = me_client.protocol_status();
        assert!(status.is_active);
        assert_eq!(status.current_epoch_id, 1);
    }
}
