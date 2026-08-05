#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, Symbol};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum NovaireFactoryError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    EpochAlreadyExists = 4,
    InvalidEpoch = 5,
    MathOverflow = 6,
    StorageMissing = 7,
    MaturityInPast = 8,
    DuplicateAddress = 9,
    EpochNotLinked = 10,
    WiringMismatch = 11,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EpochRecord {
    pub epoch_id: u32,
    pub maturity_ledger: u32,
    pub vault: Address,
    pub sy_wrapper: Address,
    pub tokenizer: Address,
    pub pt_token: Address,
    pub yt_token: Address,
    pub marketplace: Address,
    pub intent_engine: Address,
    pub rollover_engine: Address,
    pub deployment_ledger: u32,
    pub version: u32,
    pub is_active: bool,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    ProtocolVersion,
    EpochCount,
    Epoch(u32),
    Maturity(u32),
    NextEpoch(u32),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeployEpochParams {
    pub maturity_ledger: u32,
    pub underlying_token: Address,
    pub sy_wrapper: Address,
    pub vault: Address,
    /// Address of the Blend Capital lending pool that `sy_wrapper` will supply the
    /// underlying asset into (distinct from `vault`, which is Novaire's own vault contract).
    pub blend_pool: Address,
    pub pt_token: Address,
    pub yt_token: Address,
    pub tokenizer: Address,
    pub marketplace: Address,
    pub intent_engine: Address,
    pub rollover_engine: Address,
    pub keeper: Address,
    pub grace_period_ledgers: u32,
}

// ==========================================
// CLIENT INTERFACES FOR DEPENDENCY INJECTION
// ==========================================

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VaultMetadata {
    pub admin: Address,
    pub pending_admin: Option<Address>,
    pub sy_wrapper: Address,
    pub underlying: Address,
    pub total_vault_shares: i128,
    pub is_paused: bool,
    pub version: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PtMetadata {
    pub admin: Address,
    pub tokenizer: Address,
    pub total_supply: i128,
    pub is_paused: bool,
    pub version: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct YtMetadata {
    pub admin: Address,
    pub tokenizer: Address,
    pub total_supply: i128,
    pub yield_index: i128,
    pub maturity_ledger: u32,
    pub is_paused: bool,
    pub is_expired: bool,
    pub version: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenizerMetadata {
    pub admin: Address,
    pub vault: Address,
    pub pt_token: Address,
    pub yt_token: Address,
    pub sy_wrapper: Address,
    pub maturity_ledger: u32,
    pub epoch_id: u32,
    pub epoch_start_index: i128,
    pub total_pt_minted: i128,
    pub settlement_exchange_rate: Option<i128>,
    pub epoch_state: u32,
    pub version: u32,
}

#[soroban_sdk::contractclient(name = "SyWrapperClient")]
pub trait SyWrapperInterface {
    fn initialize(env: Env, admin: Address, underlying_token: Address, blend_pool: Address);
    fn underlying_asset(env: Env) -> Address;
}

#[soroban_sdk::contractclient(name = "VaultClient")]
pub trait VaultInterface {
    fn initialize(env: Env, admin: Address, sy_token: Address, underlying_token: Address);
    fn metadata(env: Env) -> VaultMetadata;
}

#[soroban_sdk::contractclient(name = "PtTokenClient")]
pub trait PtTokenInterface {
    fn initialize(env: Env, admin: Address, tokenizer: Address);
    fn metadata(env: Env) -> PtMetadata;
}


#[soroban_sdk::contractclient(name = "YtTokenClient")]
pub trait YtTokenInterface {
    fn initialize(env: Env, admin: Address, tokenizer: Address, maturity_ledger: u32, sy_wrapper: Address);
    fn metadata(env: Env) -> YtMetadata;
}

#[soroban_sdk::contractclient(name = "TokenizerClient")]
pub trait TokenizerInterface {
    fn initialize(env: Env, admin: Address, vault: Address, pt_token: Address, yt_token: Address, sy_token: Address, maturity_ledger: u32);
    fn metadata(env: Env) -> TokenizerMetadata;
}

#[soroban_sdk::contractclient(name = "MarketplaceClient")]
pub trait MarketplaceInterface {
    fn initialize(env: Env, admin: Address, pt_token: Address, yt_token: Address, underlying_token: Address, sy_token: Address, tokenizer: Address, maturity_ledger: u32);
}

#[soroban_sdk::contractclient(name = "IntentEngineClient")]
pub trait IntentEngineInterface {
    fn initialize(env: Env, admin: Address, vault: Address, tokenizer: Address, marketplace: Address, sy_token: Address, underlying_token: Address, pt_token: Address, yt_token: Address);
}

#[soroban_sdk::contractclient(name = "RolloverEngineClient")]
pub trait RolloverEngineInterface {
    fn initialize(env: Env, admin: Address, tokenizer: Address, vault: Address, marketplace: Address, intent_engine: Address, keeper: Address, pt_token: Address, underlying_token: Address, factory: Address, grace_period_ledgers: u32);
}

// ==========================================
// STORAGE HELPERS
// ==========================================

mod storage {
    use super::*;

    pub fn is_initialized(env: &Env) -> bool {
        env.storage().instance().has(&DataKey::Admin)
    }

    pub fn get_admin(env: &Env) -> Result<Address, NovaireFactoryError> {
        env.storage().instance().get(&DataKey::Admin).ok_or(NovaireFactoryError::StorageMissing)
    }

    pub fn get_protocol_version(env: &Env) -> u32 {
        env.storage().instance().get(&DataKey::ProtocolVersion).unwrap_or(1)
    }

    pub fn get_epoch_count(env: &Env) -> u32 {
        env.storage().instance().get(&DataKey::EpochCount).unwrap_or(0)
    }

    pub fn set_epoch_count(env: &Env, count: u32) {
        env.storage().instance().set(&DataKey::EpochCount, &count);
    }

    pub fn get_epoch(env: &Env, epoch_id: u32) -> Result<EpochRecord, NovaireFactoryError> {
        env.storage().persistent().get(&DataKey::Epoch(epoch_id)).ok_or(NovaireFactoryError::InvalidEpoch)
    }

    pub fn set_epoch(env: &Env, epoch_id: u32, record: &EpochRecord) {
        env.storage().persistent().set(&DataKey::Epoch(epoch_id), record);
    }
}

// ==========================================
// FACTORY CONTRACT
// ==========================================

#[contract]
pub struct Factory;

#[contractimpl]
impl Factory {
    pub fn initialize(env: Env, admin: Address, protocol_version: u32) -> Result<(), NovaireFactoryError> {
        admin.require_auth();
        if storage::is_initialized(&env) {
            return Err(NovaireFactoryError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::ProtocolVersion, &protocol_version);
        storage::set_epoch_count(&env, 0);
        Ok(())
    }

    pub fn deploy_epoch(
        env: Env,
        params: DeployEpochParams,
    ) -> Result<u32, NovaireFactoryError> {
        let admin = storage::get_admin(&env)?;
        admin.require_auth();

        let current_ledger = env.ledger().sequence();
        if params.maturity_ledger <= current_ledger {
            return Err(NovaireFactoryError::MaturityInPast);
        }

        if env.storage().persistent().has(&DataKey::Maturity(params.maturity_ledger)) {
            return Err(NovaireFactoryError::EpochAlreadyExists);
        }

        let addresses = [
            &params.sy_wrapper,
            &params.vault,
            &params.pt_token,
            &params.yt_token,
            &params.tokenizer,
            &params.marketplace,
            &params.intent_engine,
            &params.rollover_engine,
        ];
        
        for i in 0..addresses.len() {
            for j in (i + 1)..addresses.len() {
                if addresses[i] == addresses[j] {
                    return Err(NovaireFactoryError::DuplicateAddress);
                }
            }
        }

        let current_count = storage::get_epoch_count(&env);
        let new_epoch_id = current_count.checked_add(1).ok_or(NovaireFactoryError::MathOverflow)?;

        // Inject Dependencies (wire all contracts together)
        let sy_client = SyWrapperClient::new(&env, &params.sy_wrapper);
        sy_client.initialize(&admin, &params.underlying_token, &params.blend_pool);

        let vault_client = VaultClient::new(&env, &params.vault);
        vault_client.initialize(&admin, &params.sy_wrapper, &params.underlying_token);

        let pt_client = PtTokenClient::new(&env, &params.pt_token);
        pt_client.initialize(&admin, &params.tokenizer);

        let yt_client = YtTokenClient::new(&env, &params.yt_token);
        yt_client.initialize(&admin, &params.tokenizer, &params.maturity_ledger, &params.sy_wrapper);

        let tokenizer_client = TokenizerClient::new(&env, &params.tokenizer);
        tokenizer_client.initialize(&admin, &params.vault, &params.pt_token, &params.yt_token, &params.sy_wrapper, &params.maturity_ledger);

        let marketplace_client = MarketplaceClient::new(&env, &params.marketplace);
        marketplace_client.initialize(&admin, &params.pt_token, &params.yt_token, &params.underlying_token, &params.sy_wrapper, &params.tokenizer, &params.maturity_ledger);

        let intent_client = IntentEngineClient::new(&env, &params.intent_engine);
        intent_client.initialize(&admin, &params.vault, &params.tokenizer, &params.marketplace, &params.sy_wrapper, &params.underlying_token, &params.pt_token, &params.yt_token);

        let rollover_client = RolloverEngineClient::new(&env, &params.rollover_engine);
        rollover_client.initialize(&admin, &params.tokenizer, &params.vault, &params.marketplace, &params.intent_engine, &params.keeper, &params.pt_token, &params.underlying_token, &env.current_contract_address(), &params.grace_period_ledgers);

        if sy_client.underlying_asset() != params.underlying_token {
            return Err(NovaireFactoryError::WiringMismatch);
        }

        let vault_meta = vault_client.metadata();
        if vault_meta.admin != admin || vault_meta.sy_wrapper != params.sy_wrapper || vault_meta.underlying != params.underlying_token {
            return Err(NovaireFactoryError::WiringMismatch);
        }

        let pt_meta = pt_client.metadata();
        if pt_meta.admin != admin || pt_meta.tokenizer != params.tokenizer {
            return Err(NovaireFactoryError::WiringMismatch);
        }

        let yt_meta = yt_client.metadata();
        if yt_meta.admin != admin || yt_meta.tokenizer != params.tokenizer || yt_meta.maturity_ledger != params.maturity_ledger {
            return Err(NovaireFactoryError::WiringMismatch);
        }

        let tok_meta = tokenizer_client.metadata();
        if tok_meta.admin != admin || tok_meta.vault != params.vault || tok_meta.pt_token != params.pt_token || tok_meta.yt_token != params.yt_token || tok_meta.sy_wrapper != params.sy_wrapper || tok_meta.maturity_ledger != params.maturity_ledger {
            return Err(NovaireFactoryError::WiringMismatch);
        }

        let version = storage::get_protocol_version(&env);
        
        let record = EpochRecord {
            epoch_id: new_epoch_id,
            maturity_ledger: params.maturity_ledger,
            vault: params.vault,
            sy_wrapper: params.sy_wrapper,
            tokenizer: params.tokenizer,
            pt_token: params.pt_token,
            yt_token: params.yt_token,
            marketplace: params.marketplace,
            intent_engine: params.intent_engine,
            rollover_engine: params.rollover_engine,
            deployment_ledger: current_ledger,
            version,
            is_active: true,
        };

        storage::set_epoch(&env, new_epoch_id, &record);
        storage::set_epoch_count(&env, new_epoch_id);
        env.storage().persistent().set(&DataKey::Maturity(params.maturity_ledger), &new_epoch_id);

        env.events().publish((Symbol::new(&env, "epoch_deployed"),), record.clone());

        Ok(new_epoch_id)
    }

    // ==========================================
    // READ-ONLY GETTERS
    // ==========================================

    pub fn get_epoch(env: Env, epoch_id: u32) -> Result<EpochRecord, NovaireFactoryError> {
        storage::get_epoch(&env, epoch_id)
    }

    pub fn latest_epoch(env: Env) -> Result<EpochRecord, NovaireFactoryError> {
        let count = storage::get_epoch_count(&env);
        if count == 0 {
            return Err(NovaireFactoryError::InvalidEpoch);
        }
        storage::get_epoch(&env, count)
    }

    pub fn epoch_count(env: Env) -> u32 {
        storage::get_epoch_count(&env)
    }

    pub fn protocol_version(env: Env) -> u32 {
        storage::get_protocol_version(&env)
    }

    pub fn link_epochs(env: Env, current_epoch_id: u32, next_epoch_id: u32) -> Result<(), NovaireFactoryError> {
        let admin = storage::get_admin(&env)?;
        admin.require_auth();

        let count = storage::get_epoch_count(&env);
        if current_epoch_id > count || current_epoch_id == 0 {
            return Err(NovaireFactoryError::InvalidEpoch);
        }
        if next_epoch_id > count || next_epoch_id == 0 {
            return Err(NovaireFactoryError::InvalidEpoch);
        }

        env.storage().persistent().set(&DataKey::NextEpoch(current_epoch_id), &next_epoch_id);
        Ok(())
    }

    pub fn get_next_epoch(env: Env, current_epoch_id: u32) -> Result<EpochRecord, NovaireFactoryError> {
        let next_epoch_id: u32 = env.storage().persistent().get(&DataKey::NextEpoch(current_epoch_id)).ok_or(NovaireFactoryError::EpochNotLinked)?;
        storage::get_epoch(&env, next_epoch_id)
    }

    pub fn get_epoch_by_maturity(env: Env, maturity_ledger: u32) -> Result<EpochRecord, NovaireFactoryError> {
        let epoch_id: u32 = env.storage().persistent().get(&DataKey::Maturity(maturity_ledger)).ok_or(NovaireFactoryError::InvalidEpoch)?;
        storage::get_epoch(&env, epoch_id)
    }
}

#[cfg(test)]
mod test;
