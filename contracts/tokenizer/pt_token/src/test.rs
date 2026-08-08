#![cfg(test)]

use super::*;
use soroban_sdk::testutils::Address as _;

struct Setup {
    env: Env,
    admin: Address,
    tokenizer: Address,
    user1: Address,
    user2: Address,
    client: PtTokenClient<'static>,
}

fn setup() -> Setup {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let tokenizer = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    let contract_id = env.register(PtToken, ());
    let client = PtTokenClient::new(&env, &contract_id);
    client.initialize(&admin, &tokenizer);

    Setup {
        env,
        admin,
        tokenizer,
        user1,
        user2,
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
    assert!(!meta.is_paused);
    assert_eq!(meta.version, 1);
}

#[test]
#[should_panic]
fn test_initialize_fails_twice() {
    let s = setup();
    s.client.initialize(&s.admin, &s.tokenizer);
}

// ==========================================
// MINT
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
fn test_mint_accumulates_across_calls() {
    let s = setup();
    s.client.mint(&s.user1, &1000);
    s.client.mint(&s.user1, &500);
    assert_eq!(s.client.balance(&s.user1), 1500);
    assert_eq!(s.client.total_supply(), 1500);
}

// ==========================================
// BURN
// ==========================================

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
fn test_burn_zero_amount_rejected() {
    let s = setup();
    s.client.mint(&s.user1, &1000);
    s.client.burn(&s.user1, &0);
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
fn test_burn_with_zero_balance_rejected() {
    let s = setup();
    s.client.burn(&s.user1, &1);
}

#[test]
fn test_burn_works_while_paused() {
    // Phase 3: pause blocks new mints, never blocks a user's redemption exit.
    let s = setup();
    s.client.mint(&s.user1, &1000);
    s.client.pause();
    s.client.burn(&s.user1, &100);
    assert_eq!(s.client.balance(&s.user1), 900);
}

#[test]
fn test_burn_full_balance() {
    let s = setup();
    s.client.mint(&s.user1, &1000);
    s.client.burn(&s.user1, &1000);
    assert_eq!(s.client.balance(&s.user1), 0);
    assert_eq!(s.client.total_supply(), 0);
}

// ==========================================
// TRANSFER (bypasses pause)
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
    // Transfers intentionally bypass `pause` to preserve secondary market
    // liquidity as an escape valve during protocol emergencies.
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
fn test_transfer_full_balance_leaves_zero() {
    let s = setup();
    s.client.mint(&s.user1, &1000);
    s.client.transfer(&s.user1, &s.user2, &1000);
    assert_eq!(s.client.balance(&s.user1), 0);
    assert_eq!(s.client.balance(&s.user2), 1000);
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
fn test_approve_zero_amount_allowed() {
    let s = setup();
    s.client.approve(&s.user1, &s.user2, &0, &1000);
    assert_eq!(s.client.allowance(&s.user1, &s.user2), 0);
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
fn test_transfer_from_without_approval_rejected() {
    let s = setup();
    s.client.mint(&s.user1, &1000);
    s.client.transfer_from(&s.user2, &s.user1, &s.user2, &100);
}

#[test]
#[should_panic]
fn test_transfer_from_insufficient_balance_rejected() {
    let s = setup();
    s.client.mint(&s.user1, &100);
    s.client.approve(&s.user1, &s.user2, &1000, &1000);
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

#[test]
fn test_mint_resumes_after_unpause() {
    let s = setup();
    s.client.pause();
    s.client.unpause();
    s.client.mint(&s.user1, &1000);
    assert_eq!(s.client.balance(&s.user1), 1000);
}

// ==========================================
// TWO-STEP ADMIN TRANSFER
// ==========================================

#[test]
fn test_admin_transfer_two_step() {
    let s = setup();
    let new_admin = Address::generate(&s.env);
    s.client.transfer_admin(&new_admin);
    // Old admin can still act until the transfer is accepted.
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

#[test]
fn test_new_admin_can_pause_after_acceptance() {
    let s = setup();
    let new_admin = Address::generate(&s.env);
    s.client.transfer_admin(&new_admin);
    s.client.accept_admin();
    s.client.pause();
    assert!(s.client.is_paused());
}

// ==========================================
// VIEW FUNCTIONS
// ==========================================

#[test]
fn test_metadata_fields() {
    let s = setup();
    let meta = s.client.metadata();
    assert_eq!(meta.admin, s.admin);
    assert_eq!(meta.tokenizer, s.tokenizer);
}

#[test]
fn test_name_symbol_decimals_version() {
    let s = setup();
    assert_eq!(
        s.client.name(),
        String::from_str(&s.env, "Novaire Principal Token")
    );
    assert_eq!(s.client.symbol(), String::from_str(&s.env, "nPT"));
    assert_eq!(s.client.decimals(), 7);
    assert_eq!(s.client.version(), VERSION);
}

#[test]
fn test_balance_of_unknown_user_is_zero() {
    let s = setup();
    assert_eq!(s.client.balance(&s.user1), 0);
}
