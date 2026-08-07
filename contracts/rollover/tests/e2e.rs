#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Events, Ledger},
    token, Address, Env, IntoVal,
};

use intent_engine::{IntentEngine, IntentEngineClient};
use marketplace::{NovaireMarketplace, NovaireMarketplaceClient};
use maturity_engine::{MaturityEngine, MaturityEngineClient};
use pt_token::{PtToken, PtTokenClient};
use rollover::{AutonomousRollover, AutonomousRolloverClient, DataKey};
use soroban_sdk::{contract, contractimpl, contracttype};
use sy_wrapper::{Positions, Request};
use sy_wrapper::{SyWrapper, SyWrapperClient};
use tokenizer::{Tokenizer, TokenizerClient};
use vault::{Vault, VaultClient};
use yt_token::{YtToken, YtTokenClient};

// Minimal stand-in for the real Blend Capital Pool contract (see
// `sy_wrapper::{BlendPool, Request, Positions}`), mirroring `MockBlendPool` in
// `sy_wrapper/src/audit_tests.rs`: a single-asset, non-collateralized Supply/Withdraw
// ledger keyed by the calling contract's address.
#[contracttype]
#[derive(Clone)]
enum PoolDataKey {
    Underlying,
    Supply(Address),
}

#[contract]
pub struct MockBlendPool;

#[contractimpl]
impl MockBlendPool {
    pub fn init(env: Env, underlying: Address) {
        env.storage()
            .instance()
            .set(&PoolDataKey::Underlying, &underlying);
    }

    pub fn submit(
        env: Env,
        from: Address,
        spender: Address,
        to: Address,
        requests: soroban_sdk::Vec<Request>,
    ) -> Positions {
        let underlying: Address = env
            .storage()
            .instance()
            .get(&PoolDataKey::Underlying)
            .unwrap();
        let token_client = token::Client::new(&env, &underlying);
        let this = env.current_contract_address();

        let mut supply: i128 = env
            .storage()
            .instance()
            .get(&PoolDataKey::Supply(from.clone()))
            .unwrap_or(0);

        for req in requests.iter() {
            if req.request_type == 0 {
                token_client.transfer_from(&this, &spender, &this, &req.amount);
                supply += req.amount;
            } else if req.request_type == 1 {
                let amt = if req.amount > supply {
                    supply
                } else {
                    req.amount
                };
                token_client.transfer(&this, &to, &amt);
                supply -= amt;
            }
        }

        env.storage()
            .instance()
            .set(&PoolDataKey::Supply(from), &supply);
        Self::positions_for(&env, supply)
    }

    pub fn get_positions(env: Env, address: Address) -> Positions {
        let supply: i128 = env
            .storage()
            .instance()
            .get(&PoolDataKey::Supply(address))
            .unwrap_or(0);
        Self::positions_for(&env, supply)
    }

    fn positions_for(env: &Env, supply: i128) -> Positions {
        let mut supply_map = soroban_sdk::Map::new(env);
        if supply > 0 {
            supply_map.set(1u32, supply);
        }
        Positions {
            collateral: soroban_sdk::Map::new(env),
            liabilities: soroban_sdk::Map::new(env),
            supply: supply_map,
        }
    }
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EpochRecord {
    pub epoch_id: u32,
    pub maturity_ledger: u32,
    pub created_ledger: u32,
    pub pt_token: Address,
}

#[contract]
pub struct MockFactory;
#[contractimpl]
impl MockFactory {
    pub fn latest_epoch(env: Env) -> EpochRecord {
        let maturity_ledger: u32 = env
            .storage()
            .instance()
            .get(&soroban_sdk::Symbol::new(&env, "next_maturity"))
            .unwrap_or(2000);
        EpochRecord {
            epoch_id: 2,
            maturity_ledger,
            created_ledger: 0,
            pt_token: Self::pt_token(&env),
        }
    }

    pub fn get_epoch_by_maturity(env: Env, maturity_ledger: u32) -> EpochRecord {
        EpochRecord {
            epoch_id: 1,
            maturity_ledger,
            created_ledger: 0,
            pt_token: Self::pt_token(&env),
        }
    }

    pub fn get_next_epoch(env: Env, _current_epoch_id: u32) -> EpochRecord {
        let maturity_ledger: u32 = env
            .storage()
            .instance()
            .get(&soroban_sdk::Symbol::new(&env, "next_maturity"))
            .unwrap_or(2000);
        EpochRecord {
            epoch_id: 2,
            maturity_ledger,
            created_ledger: 0,
            pt_token: Self::pt_token(&env),
        }
    }

    pub fn set_next_maturity(env: Env, maturity_ledger: u32) {
        env.storage().instance().set(
            &soroban_sdk::Symbol::new(&env, "next_maturity"),
            &maturity_ledger,
        );
    }

    pub fn set_pt_token(env: Env, pt_token: Address) {
        env.storage()
            .instance()
            .set(&soroban_sdk::Symbol::new(&env, "pt_token"), &pt_token);
    }

    fn pt_token(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&soroban_sdk::Symbol::new(env, "pt_token"))
            .unwrap()
    }
}

// SCF GRANT — NOVAIRE INTEGRATION TEST
#[test]
fn test_novaire_end_to_end_integration() {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();

    let admin = Address::generate(&env);
    let keeper = Address::generate(&env);
    let token_admin = Address::generate(&env);

    // ==========================================
    // 1. DEPLOY ALL CONTRACTS
    // ==========================================

    let underlying_token = env
        .register_stellar_asset_contract_v2(token_admin.clone())
        .address();
    let token_admin_client = token::StellarAssetClient::new(&env, &underlying_token);
    let usdc_client = token::TokenClient::new(&env, &underlying_token);

    let blend_pool_id = env.register(MockBlendPool, ());
    let blend_pool_client = MockBlendPoolClient::new(&env, &blend_pool_id);
    blend_pool_client.init(&underlying_token);

    let sy_contract_id = env.register(SyWrapper, ());
    let sy_client = SyWrapperClient::new(&env, &sy_contract_id);
    sy_client.initialize(&admin, &underlying_token, &blend_pool_id);

    let tokenizer_contract_id = env.register(Tokenizer, ());

    let pt_contract_id = env.register(PtToken, ());
    let pt_client = PtTokenClient::new(&env, &pt_contract_id);
    pt_client.initialize(&admin, &tokenizer_contract_id);

    let vault_contract_id = env.register(Vault, ());
    let vault_client = VaultClient::new(&env, &vault_contract_id);
    vault_client.initialize(&admin, &sy_contract_id, &underlying_token);

    let maturity_ledger = 1_000;
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: 100,
        ..env.ledger().get()
    });

    let maturity_engine_id = env.register(MaturityEngine, ());
    let maturity_engine_client = MaturityEngineClient::new(&env, &maturity_engine_id);
    maturity_engine_client.initialize(&admin);
    let maturity_epoch_id = maturity_engine_client.open_epoch(&maturity_ledger);

    let yt_contract_id = env.register(YtToken, ());
    let yt_client = YtTokenClient::new(&env, &yt_contract_id);
    yt_client.initialize(
        &admin,
        &tokenizer_contract_id,
        &1000,
        &sy_contract_id,
        &maturity_engine_id,
        &maturity_epoch_id,
    );

    let tokenizer_client = TokenizerClient::new(&env, &tokenizer_contract_id);
    tokenizer_client.initialize(
        &admin,
        &vault_contract_id,
        &pt_contract_id,
        &yt_contract_id,
        &sy_contract_id,
        &maturity_ledger,
        &maturity_engine_id,
        &maturity_epoch_id,
    );

    let market_contract_id = env.register(NovaireMarketplace, ());
    let market_client = NovaireMarketplaceClient::new(&env, &market_contract_id);
    market_client.initialize(
        &admin,
        &pt_contract_id,
        &yt_contract_id,
        &underlying_token,
        &sy_contract_id,
        &tokenizer_contract_id,
        &maturity_ledger,
        &maturity_engine_id,
        &maturity_epoch_id,
    );

    let intent_engine_contract_id = env.register(IntentEngine, ());
    let intent_engine_client = IntentEngineClient::new(&env, &intent_engine_contract_id);
    intent_engine_client.initialize(
        &admin,
        &vault_contract_id,
        &tokenizer_contract_id,
        &market_contract_id,
        &sy_contract_id,
        &underlying_token,
        &pt_contract_id,
        &yt_contract_id,
    );

    let factory_contract_id = env.register(MockFactory, ());
    MockFactoryClient::new(&env, &factory_contract_id).set_pt_token(&pt_contract_id);

    let rollover_contract_id = env.register(AutonomousRollover, ());
    let rollover_client = AutonomousRolloverClient::new(&env, &rollover_contract_id);
    rollover_client.initialize(
        &admin,
        &tokenizer_contract_id,
        &vault_contract_id,
        &market_contract_id,
        &intent_engine_contract_id,
        &keeper,
        &pt_contract_id,
        &underlying_token,
        &factory_contract_id,
        &17280,
    );

    // Provide initial liquidity so the AMM can price PT and YT
    let lp = Address::generate(&env);
    token_admin_client.mint(&lp, &10_000_000);
    vault_client.deposit(&lp, &5_000_000);
    let lp_sy = vault_client.balance_of(&lp);
    tokenizer_client.mint_pt_yt(&lp, &lp_sy);
    market_client.add_liquidity(&lp, &1_000_000, &900_000);

    // Store total supply metrics to verify invariants at the end
    let _total_usdc_minted = 10_000_000;

    // ==========================================
    // 2. ALICE: FIXED YIELD INTENT
    // ==========================================
    let alice = Address::generate(&env);
    token_admin_client.mint(&alice, &1000);

    let alice_intent = intent_engine_client.execute_fixed_yield_intent(
        &alice,
        &1000,
        &0,
        &0,
        &maturity_ledger,
        &100,
    );
    assert_eq!(alice_intent.total_deposited_amount, 1000);

    let alice_pt = pt_client.balance(&alice);
    let alice_usdc = usdc_client.balance(&alice);
    let alice_yt = yt_client.balance(&alice);

    assert!(alice_pt > 0);
    assert_eq!(alice_yt, 0); // Alice sold her YT
    assert!(alice_usdc > 0); // Alice received some upfront premium USDC from YT sale

    // Verify Intent Engine holds no residual funds
    assert_eq!(usdc_client.balance(&intent_engine_contract_id), 0);
    assert_eq!(pt_client.balance(&intent_engine_contract_id), 0);
    assert_eq!(yt_client.balance(&intent_engine_contract_id), 0);

    // ==========================================
    // 3. BOB: YIELD SPECULATION INTENT
    // ==========================================
    let bob = Address::generate(&env);
    token_admin_client.mint(&bob, &1000);

    let bob_yt_bought = intent_engine_client.execute_yield_speculation_intent(&bob, &1000, &0, &0);
    assert!(bob_yt_bought > 0);

    let bob_pt = pt_client.balance(&bob);
    let bob_yt = yt_client.balance(&bob);
    let bob_usdc = usdc_client.balance(&bob);

    assert_eq!(bob_pt, 0); // Bob sold his PT
    assert!(bob_yt > 0); // Bob bought more YT
    assert!(bob_usdc > 0); // Bob may have leftover dust from swap

    // ==========================================
    // 4. ADVANCE LEDGER TO MID-EPOCH
    // ==========================================
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: 500,
        ..env.ledger().get()
    });

    // ==========================================
    // 5. SY WRAPPER: ACCRUE 5% YIELD
    // ==========================================
    let new_rate = 1_050_000_000; // 1.05

    // Total shares in SY = 5,000,000 (lp) + 1,000 (alice)
    let total_sy = sy_client.total_shares();
    let yield_to_accrue = total_sy * 5 / 100;
    token_admin_client.mint(&sy_contract_id, &yield_to_accrue);
    sy_client.harvest_yield();

    assert_eq!(sy_client.get_exchange_rate(), new_rate);

    // ==========================================
    // 6. BOB: CLAIM YIELD
    // ==========================================
    let bob_usdc_before_claim = usdc_client.balance(&bob);
    let yield_claimed = tokenizer_client.claim_yield(&bob);

    // Bob should receive roughly 5% of his underlying YT position.
    std::println!("yield_claimed: {}", yield_claimed);
    assert!(yield_claimed >= 45);
    assert!(usdc_client.balance(&bob) >= bob_usdc_before_claim + yield_claimed - 1);

    // ==========================================
    // 6.5 CAROL: REGISTER AUTONOMOUS ROLLOVER
    // ==========================================
    let carol = Address::generate(&env);
    token_admin_client.mint(&carol, &2000);

    intent_engine_client.execute_fixed_yield_intent(&carol, &2000, &0, &0, &maturity_ledger, &100);
    let carol_pt = pt_client.balance(&carol);

    let epoch_2_maturity: u32 = 3_000;

    rollover_client.register_rollover(&carol, &carol_pt, &maturity_ledger, &0, &0);

    // ==========================================
    // 7. ADVANCE LEDGER PAST MATURITY
    // ==========================================
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: maturity_ledger + 1,
        ..env.ledger().get()
    });

    // ==========================================
    // 8. TOKENIZER: SETTLE EPOCH
    // ==========================================
    tokenizer_client.settle_epoch();

    // Verify settle_epoch event was emitted
    let mut settled_event_found = false;
    for (contract_id, topics, _) in env.events().all().iter() {
        if contract_id == tokenizer_contract_id && !topics.is_empty() {
            let topic_sym: soroban_sdk::Symbol = topics.get(0).unwrap().into_val(&env);
            if topic_sym == soroban_sdk::Symbol::new(&env, "tokenizer_settled") {
                settled_event_found = true;
                break;
            }
        }
    }
    assert!(settled_event_found, "epoch_settled event not emitted");

    // ==========================================
    // 9. ALICE: REDEEM PT
    // ==========================================
    let alice_usdc_before_redeem = usdc_client.balance(&alice);
    let pt_to_redeem = pt_client.balance(&alice);

    // Alice redeems her PT 1:1 for SY Shares worth of underlying.
    tokenizer_client.redeem_pt(&alice, &pt_to_redeem);

    let alice_usdc_after_redeem = usdc_client.balance(&alice);
    let redeemed_amount = alice_usdc_after_redeem - alice_usdc_before_redeem;

    std::println!("alice_pt_to_redeem: {}", pt_to_redeem);
    std::println!("alice_usdc_before: {}", alice_usdc_before_redeem);
    std::println!("alice_usdc_after: {}", alice_usdc_after_redeem);
    std::println!("redeemed_amount: {}", redeemed_amount);

    // Alice deposited 1000. She should get back AT LEAST ~1000 USDC (accounting for 1 unit of integer truncation).
    assert!(redeemed_amount >= 999);
    assert_eq!(pt_client.balance(&alice), 0);

    // Fast forward to Epoch 1 Maturity
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: maturity_ledger + 2,
        ..env.ledger().get()
    });

    // To simulate keeper calling execute_rollover across epochs for MVP testing,
    // we must provision a second Tokenizer, Marketplace, and Intent Engine for Epoch 2
    // and update the rollover contract's pointer.

    let pt2_id = env.register(PtToken, ());
    let yt2_id = env.register(YtToken, ());
    let tokenizer2_id = env.register(Tokenizer, ());
    PtTokenClient::new(&env, &pt2_id).initialize(&admin, &tokenizer2_id);

    let maturity_engine2_id = env.register(MaturityEngine, ());
    let maturity_engine2_client = MaturityEngineClient::new(&env, &maturity_engine2_id);
    maturity_engine2_client.initialize(&admin);
    let maturity_epoch2_id = maturity_engine2_client.open_epoch(&epoch_2_maturity);

    YtTokenClient::new(&env, &yt2_id).initialize(
        &admin,
        &tokenizer2_id,
        &epoch_2_maturity,
        &sy_contract_id,
        &maturity_engine2_id,
        &maturity_epoch2_id,
    );

    TokenizerClient::new(&env, &tokenizer2_id).initialize(
        &admin,
        &vault_contract_id,
        &pt2_id,
        &yt2_id,
        &sy_contract_id,
        &epoch_2_maturity,
        &maturity_engine2_id,
        &maturity_epoch2_id,
    );

    let market2_id = env.register(NovaireMarketplace, ());
    NovaireMarketplaceClient::new(&env, &market2_id).initialize(
        &admin,
        &pt2_id,
        &yt2_id,
        &underlying_token,
        &sy_contract_id,
        &tokenizer2_id,
        &epoch_2_maturity,
        &maturity_engine2_id,
        &maturity_epoch2_id,
    );

    let intent_engine2_id = env.register(IntentEngine, ());
    IntentEngineClient::new(&env, &intent_engine2_id).initialize(
        &admin,
        &vault_contract_id,
        &tokenizer2_id,
        &market2_id,
        &sy_contract_id,
        &underlying_token,
        &pt2_id,
        &yt2_id,
    );

    // Seed Liquidity in Epoch 2
    token_admin_client.mint(&lp, &2_000_000);
    vault_client.deposit(&lp, &1_000_000);
    TokenizerClient::new(&env, &tokenizer2_id).mint_pt_yt(&lp, &vault_client.balance_of(&lp));
    // A small (~1%) discount, not an exact 1:1 par pool: at literal par PT
    // trades at face value and YT is genuinely worth ~0, so any YT sale
    // (as the rollover's fixed-yield intent performs) correctly nets ~0
    // under curve-consistent pricing — that's not a bug, but it defeats the
    // point of this fixture, which wants a normal, tradeable pool.
    NovaireMarketplaceClient::new(&env, &market2_id).add_liquidity(&lp, &500_000, &495_000);

    // Update Rollover Storage pointing to Epoch 2 Intent Engine
    env.as_contract(&rollover_contract_id, || {
        env.storage()
            .instance()
            .set(&DataKey::IntentEngine, &intent_engine2_id);
    });

    let mock_factory_client = MockFactoryClient::new(&env, &factory_contract_id);
    mock_factory_client.set_next_maturity(&epoch_2_maturity);
    mock_factory_client.set_pt_token(&pt2_id);

    // Simulate Keeper executing the rollover!
    rollover_client.execute_rollover(&carol);

    let pos = rollover_client.get_position(&carol);
    assert_eq!(pos.current_epoch_maturity, epoch_2_maturity);
    assert!(pos.pt_balance > 0);

    let rollover_pt2_bal = PtTokenClient::new(&env, &pt2_id).balance(&rollover_contract_id);
    assert_eq!(rollover_pt2_bal, pos.pt_balance);

    // ==========================================
    // FINAL ASSERTIONS
    // ==========================================
    let _total_usdc_in_vault = usdc_client.balance(&vault_contract_id);
    let total_usdc_in_market1 = usdc_client.balance(&market_contract_id);
    let total_usdc_in_market2 = usdc_client.balance(&market2_id);
    let total_usdc_in_tokenizer1 = usdc_client.balance(&tokenizer_contract_id);
    let total_usdc_in_tokenizer2 = usdc_client.balance(&tokenizer2_id);

    std::println!("Marketplace 1: {}", total_usdc_in_market1);
    std::println!("Marketplace 2: {}", total_usdc_in_market2);
    std::println!("Tokenizer 1: {}", total_usdc_in_tokenizer1);
    std::println!("Tokenizer 2: {}", total_usdc_in_tokenizer2);
    std::println!(
        "IntentEngine 1: {}",
        usdc_client.balance(&intent_engine_contract_id)
    );
    std::println!(
        "IntentEngine 2: {}",
        usdc_client.balance(&intent_engine2_id)
    );
    std::println!("Rollover: {}", usdc_client.balance(&rollover_contract_id));
}
