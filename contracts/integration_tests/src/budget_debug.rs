//! Diagnostic instrumentation for Soroban VM resource-budget failures
//! (Memory(OutOfBoundsGrowth), CpuLimitExceeded, BudgetExceeded, HostError, ContractError).
//!
//! This module does not change protocol behavior. It only reads the test
//! Env's budget/event/snapshot state and writes it to disk so that a failing
//! run leaves behind a diagnostic bundle instead of a bare panic message.
//!
//! Usage: wrap a protocol flow in `run_and_capture`, or call `dump_budget`
//! at any point during a test to snapshot resource usage so far.

#![cfg(test)]

use soroban_sdk::testutils::budget::ContractCostType;
use soroban_sdk::testutils::Events as _;
use soroban_sdk::Env;
use std::fmt::Write as _;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn artifacts_dir() -> PathBuf {
    // CARGO_MANIFEST_DIR = contracts/integration_tests
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.push("../../artifacts/debug");
    p
}

/// Render the current budget + per-cost-type tracker table as a string.
pub fn budget_report(env: &Env) -> String {
    let budget = env.cost_estimate().budget();
    let mut out = String::new();
    let _ = writeln!(
        out,
        "cpu_instructions_consumed = {}",
        budget.cpu_instruction_cost()
    );
    let _ = writeln!(
        out,
        "memory_bytes_consumed     = {}",
        budget.memory_bytes_cost()
    );
    let _ = writeln!(out, "\n--- per-cost-type trackers (iterations, inputs) ---");
    for ct in ContractCostType::VARIANTS.iter() {
        // tracker() panics if the type was never invoked in some SDK versions;
        // guard with catch_unwind so one missing tracker doesn't blow up the dump.
        let ct2 = *ct;
        let env2 = env;
        let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            env2.cost_estimate().budget().tracker(ct2)
        }));
        if let Ok(t) = res {
            if t.iterations > 0 {
                let _ = writeln!(
                    out,
                    "{:?}: iterations={} inputs={:?} cpu={} mem={}",
                    ct2, t.iterations, t.inputs, t.cpu, t.mem
                );
            }
        }
    }
    out
}

/// Print the budget report to stdout (visible with `cargo test -- --nocapture`).
pub fn dump_budget(env: &Env, label: &str) {
    println!("\n=== BUDGET @ {label} ===\n{}", budget_report(env));
}

/// Render every contract/diagnostic event emitted so far, in call order.
pub fn events_report(env: &Env) -> String {
    let mut out = String::new();
    for (i, (contract_id, topics, data)) in env.events().all().iter().enumerate() {
        let _ = writeln!(
            out,
            "[{i}] contract={contract_id:?}\n     topics={topics:?}\n     data={data:?}"
        );
    }
    out
}

/// Write a full failure bundle to artifacts/debug/<label>-<timestamp>/:
///   budget.txt   — cpu/mem totals + per-cost-type trackers
///   events.txt   — every contract/diagnostic event emitted before the failure
///   panic.txt    — the panic payload, if any
///   context.txt  — free-form caller-supplied context (invocation description, args, etc.)
pub fn write_failure_bundle(
    env: &Env,
    label: &str,
    context: &str,
    panic_msg: Option<&str>,
) -> PathBuf {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let dir = artifacts_dir().join(format!("{label}-{ts}"));
    let _ = fs::create_dir_all(&dir);

    let _ = fs::write(dir.join("budget.txt"), budget_report(env));
    let _ = fs::write(dir.join("events.txt"), events_report(env));
    let _ = fs::write(dir.join("context.txt"), context);
    if let Some(msg) = panic_msg {
        let _ = fs::write(dir.join("panic.txt"), msg);
    }

    eprintln!("\n!!! Failure bundle written to {} !!!", dir.display());
    dir
}

/// Run `flow` (a protocol action) and, if it panics (which is how Soroban
/// testutils surfaces HostError/BudgetExceeded/Memory(OutOfBoundsGrowth)/
/// ContractError trapping the VM), capture a full diagnostic bundle before
/// resuming the panic so the test still fails loudly.
///
/// `label` should be a short slug (e.g. "mint_pt_yt"); `context` should
/// describe the exact call and inputs so the bundle is self-explanatory.
pub fn run_and_capture<F, R>(env: &Env, label: &str, context: &str, flow: F) -> R
where
    F: FnOnce() -> R,
{
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(flow));
    match result {
        Ok(r) => r,
        Err(e) => {
            let msg = if let Some(s) = e.downcast_ref::<&str>() {
                s.to_string()
            } else if let Some(s) = e.downcast_ref::<String>() {
                s.clone()
            } else {
                "<non-string panic payload>".to_string()
            };
            write_failure_bundle(env, label, context, Some(&msg));
            std::panic::resume_unwind(e);
        }
    }
}
