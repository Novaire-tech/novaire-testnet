#![cfg(test)]

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};

use maturity_engine::{MaturityEngine, MaturityEngineClient};

struct Setup {
    env: Env,
    admin: Address,
    tokenizer: Address,
    sy_wrapper: Address,
    user1: Address,
    user2: Address,
    maturity_ledger: u32,
    client: YtTokenClient<'static>,
}

fn setup() -> Setup {
    setup_with_maturity(1_000_000)
}

fn setup_with_maturity(maturity_ledger: u32) -> Setup {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let tokenizer = Address::generate(&env);
    let sy_wrapper = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    let maturity_engine_id = env.register(MaturityEngine, ());
    let maturity_engine_client = MaturityEngineClient::new(&env, &maturity_engine_id);
    maturity_engine_client.initialize(&admin);
    let epoch_id = maturity_engine_client.open_epoch(&maturity_ledger);

    let contract_id = env.register(YtToken, ());
    let client = YtTokenClient::new(&env, &contract_id);
    client.initialize(
        &admin,
        &tokenizer,
        &maturity_ledger,
        &sy_wrapper,
        &maturity_engine_id,
        &epoch_id,
    );

    Setup {
        env,
        admin,
        tokenizer,
        sy_wrapper,
        user1,
        user2,
        maturity_ledger,
        client,
    }
}

// ==========================================
// INITIALIZATION
// ==========================================

#[test]
fn test_initialize_success() {
    let s = setup();
    let meta = s.client.metadata();
    assert_eq!(meta.admin, s.admin);
    assert_eq!(meta.tokenizer, s.tokenizer);
    assert_eq!(meta.total_supply, 0);
    assert_eq!(meta.yield_index, 0);
    assert_eq!(meta.maturity_ledger, s.maturity_ledger);
    assert!(!meta.is_paused);
    assert!(!meta.is_expired);
    assert_eq!(meta.version, 2);
}

#[test]
#[should_panic]
fn test_initialize_fails_twice() {
    let s = setup();
    s.client.initialize(
        &s.admin,
        &s.tokenizer,
        &s.maturity_ledger,
        &s.sy_wrapper,
        &Address::generate(&s.env),
        &1,
    );
}

// ==========================================
// MINT / BURN
// ==========================================

#[test]
fn test_mint_success() {
    let s = setup();
    s.client.mint(&s.user1, &1000);
    assert_eq!(s.client.balance(&s.user1), 1000);
    assert_eq!(s.client.total_supply(), 1000);
}

#[test]
#[should_panic]
fn test_mint_zero_amount_rejected() {
    let s = setup();
    s.client.mint(&s.user1, &0);
}

#[test]
#[should_panic]
fn test_mint_negative_amount_rejected() {
    let s = setup();
    s.client.mint(&s.user1, &-1);
}

#[test]
#[should_panic]
fn test_mint_while_paused_rejected() {
    let s = setup();
    s.client.pause();
    s.client.mint(&s.user1, &1000);
}

#[test]
fn test_burn_success() {
    let s = setup();
    s.client.mint(&s.user1, &1000);
    s.client.burn(&s.user1, &400);
    assert_eq!(s.client.balance(&s.user1), 600);
    assert_eq!(s.client.total_supply(), 600);
}

#[test]
#[should_panic]
fn test_burn_more_than_balance_rejected() {
    let s = setup();
    s.client.mint(&s.user1, &100);
    s.client.burn(&s.user1, &200);
}

#[test]
#[should_panic]
fn test_burn_zero_amount_rejected() {
    let s = setup();
    s.client.mint(&s.user1, &1000);
    s.client.burn(&s.user1, &0);
}

#[test]
#[should_panic]
fn test_burn_while_paused_rejected() {
    let s = setup();
    s.client.mint(&s.user1, &1000);
    s.client.pause();
    s.client.burn(&s.user1, &100);
}

// ==========================================
// YIELD INDEX / CHECKPOINTING
// ==========================================

#[test]
fn test_update_yield_index_success() {
    let s = setup();
    s.client.update_yield_index(&500);
    assert_eq!(s.client.get_yield_index(), 500);
}

#[test]
#[should_panic]
fn test_update_yield_index_cannot_decrease() {
    let s = setup();
    s.client.update_yield_index(&500);
    s.client.update_yield_index(&400);
}

#[test]
#[should_panic]
fn test_update_yield_index_while_paused_rejected() {
    let s = setup();
    s.client.pause();
    s.client.update_yield_index(&500);
}

#[test]
fn test_checkpoint_accrues_yield_on_mint() {
    let s = setup();
    // 1000 YIELD_SCALAR-denominated index units per token, minted before any
    // index change accrues nothing yet.
    s.client.mint(&s.user1, &1000);
    assert_eq!(s.client.claimable_yield(&s.user1), 0);

    s.client.update_yield_index(&1_000_000_000); // +1.0 index unit (scaled)
                                                 // internal_checkpoint_user runs on the *next* mutating call; simulate via burn of 0? not allowed.
                                                 // Use checkpoint_user directly.
    s.client.checkpoint_user(&s.user1);
    assert_eq!(s.client.claimable_yield(&s.user1), 1000);
}

#[test]
fn test_reset_claimable_zeroes_accrued_yield() {
    let s = setup();
    s.client.mint(&s.user1, &1000);
    s.client.update_yield_index(&1_000_000_000);
    s.client.checkpoint_user(&s.user1);
    assert_eq!(s.client.claimable_yield(&s.user1), 1000);

    s.client.reset_claimable(&s.user1);
    assert_eq!(s.client.claimable_yield(&s.user1), 0);
}

#[test]
fn test_add_accrued_yield_credits_user() {
    let s = setup();
    s.client.add_accrued_yield(&s.user1, &250);
    assert_eq!(s.client.claimable_yield(&s.user1), 250);
}

#[test]
#[should_panic]
fn test_add_accrued_yield_zero_rejected() {
    let s = setup();
    s.client.add_accrued_yield(&s.user1, &0);
}

#[test]
#[should_panic]
fn test_add_accrued_yield_negative_rejected() {
    let s = setup();
    s.client.add_accrued_yield(&s.user1, &-1);
}

#[test]
fn test_add_accrued_yield_accumulates_with_index_yield() {
    let s = setup();
    s.client.mint(&s.user1, &1000);
    s.client.update_yield_index(&1_000_000_000);
    s.client.checkpoint_user(&s.user1);
    s.client.add_accrued_yield(&s.user1, &500);
    assert_eq!(s.client.claimable_yield(&s.user1), 1500);
}

// ==========================================
// TRANSFER (checkpoints both sides; bypasses pause)
// ==========================================

#[test]
fn test_transfer_success() {
    let s = setup();
    s.client.mint(&s.user1, &1000);
    s.client.transfer(&s.user1, &s.user2, &400);
    assert_eq!(s.client.balance(&s.user1), 600);
    assert_eq!(s.client.balance(&s.user2), 400);
}

#[test]
fn test_transfer_works_while_paused() {
    let s = setup();
    s.client.mint(&s.user1, &1000);
    s.client.pause();
    s.client.transfer(&s.user1, &s.user2, &400);
    assert_eq!(s.client.balance(&s.user2), 400);
}

#[test]
#[should_panic]
fn test_transfer_zero_amount_rejected() {
    let s = setup();
    s.client.mint(&s.user1, &1000);
    s.client.transfer(&s.user1, &s.user2, &0);
}

#[test]
#[should_panic]
fn test_transfer_insufficient_balance_rejected() {
    let s = setup();
    s.client.mint(&s.user1, &100);
    s.client.transfer(&s.user1, &s.user2, &200);
}

#[test]
fn test_transfer_locks_accrued_yield_to_sender() {
    // H4: yield accrued during the sender's holding period must not transfer
    // to the receiver — it stays checkpointed to the sender at transfer time.
    let s = setup();
    s.client.mint(&s.user1, &1000);
    s.client.update_yield_index(&1_000_000_000);

    s.client.transfer(&s.user1, &s.user2, &1000);

    // Sender's yield (accrued from the 1000 balance held before transfer) is locked in.
    assert_eq!(s.client.claimable_yield(&s.user1), 1000);
    // Receiver starts fresh with no historical accrual from the sender's period.
    assert_eq!(s.client.claimable_yield(&s.user2), 0);
}

// ==========================================
// APPROVE / TRANSFER_FROM
// ==========================================

#[test]
fn test_approve_and_allowance() {
    let s = setup();
    s.client.approve(&s.user1, &s.user2, &500, &1000);
    assert_eq!(s.client.allowance(&s.user1, &s.user2), 500);
}

#[test]
#[should_panic]
fn test_approve_negative_amount_rejected() {
    let s = setup();
    s.client.approve(&s.user1, &s.user2, &-1, &1000);
}

#[test]
fn test_transfer_from_success() {
    let s = setup();
    s.client.mint(&s.user1, &1000);
    s.client.approve(&s.user1, &s.user2, &500, &1000);
    s.client.transfer_from(&s.user2, &s.user1, &s.user2, &300);
    assert_eq!(s.client.balance(&s.user1), 700);
    assert_eq!(s.client.balance(&s.user2), 300);
    assert_eq!(s.client.allowance(&s.user1, &s.user2), 200);
}

#[test]
#[should_panic]
fn test_transfer_from_exceeds_allowance_rejected() {
    let s = setup();
    s.client.mint(&s.user1, &1000);
    s.client.approve(&s.user1, &s.user2, &100, &1000);
    s.client.transfer_from(&s.user2, &s.user1, &s.user2, &200);
}

#[test]
#[should_panic]
fn test_transfer_from_zero_amount_rejected() {
    let s = setup();
    s.client.mint(&s.user1, &1000);
    s.client.approve(&s.user1, &s.user2, &500, &1000);
    s.client.transfer_from(&s.user2, &s.user1, &s.user2, &0);
}

// ==========================================
// PAUSE / UNPAUSE
// ==========================================

#[test]
fn test_pause_and_unpause() {
    let s = setup();
    s.client.pause();
    assert!(s.client.is_paused());
    s.client.unpause();
    assert!(!s.client.is_paused());
}

// ==========================================
// TWO-STEP ADMIN / TOKENIZER / SY_WRAPPER TRANSFER
// ==========================================

#[test]
fn test_admin_transfer_two_step() {
    let s = setup();
    let new_admin = Address::generate(&s.env);
    s.client.transfer_admin(&new_admin);
    assert_eq!(s.client.metadata().admin, s.admin);
    s.client.accept_admin();
    assert_eq!(s.client.metadata().admin, new_admin);
}

#[test]
#[should_panic]
fn test_accept_admin_without_pending_transfer_rejected() {
    let s = setup();
    s.client.accept_admin();
}

// ==========================================
// MATURITY / EXPIRY
// ==========================================

#[test]
fn test_is_expired_false_before_maturity() {
    let s = setup_with_maturity(1000);
    s.env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: 500,
        ..s.env.ledger().get()
    });
    assert!(!s.client.is_expired());
}

#[test]
fn test_is_expired_true_after_maturity() {
    let s = setup_with_maturity(1000);
    s.env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: 1001,
        ..s.env.ledger().get()
    });
    assert!(s.client.is_expired());
}

#[test]
fn test_transfer_still_works_after_maturity() {
    // Yield accrual freezes post-maturity (refresh_index_locally no-ops), but
    // balance transfers themselves are unaffected.
    let s = setup_with_maturity(1000);
    s.client.mint(&s.user1, &1000);
    s.env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: 1001,
        ..s.env.ledger().get()
    });
    s.client.transfer(&s.user1, &s.user2, &400);
    assert_eq!(s.client.balance(&s.user2), 400);
}

// ==========================================
// VIEW FUNCTIONS
// ==========================================

#[test]
fn test_name_symbol_decimals_version() {
    let s = setup();
    assert_eq!(
        s.client.name(),
        String::from_str(&s.env, "Novaire Yield Token")
    );
    assert_eq!(s.client.symbol(), String::from_str(&s.env, "nYT"));
    assert_eq!(s.client.decimals(), 7);
    assert_eq!(s.client.version(), VERSION);
}

#[test]
fn test_balance_of_unknown_user_is_zero() {
    let s = setup();
    assert_eq!(s.client.balance(&s.user1), 0);
}

#[test]
fn test_claimable_yield_zero_for_untouched_user() {
    let s = setup();
    assert_eq!(s.client.claimable_yield(&s.user1), 0);
}
