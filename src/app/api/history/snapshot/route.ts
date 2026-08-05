/**
 * POST /api/history/snapshot
 *
 * Called by the client (analyticsHistoryService) to persist the current wallet state
 * alongside protocol prices into the history store.
 *
 * This allows every historical chart data point to carry the actual balances that
 * were present at that timestamp, not the current balances projected backwards.
 *
 * The server-side sync route (/api/history/sync) separately captures protocol prices
 * when on-chain events occur but has no access to authenticated wallet sessions.
 * This endpoint bridges that gap: the client supplies wallet state, the server
 * enriches it with the latest protocol prices and stores the combined snapshot.
 */
import { NextRequest, NextResponse } from 'next/server';
import { HistoryStore } from '@/lib/historyStore';
import { ProtocolService } from '@/services/protocolService';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const ptBalance = Number(body.ptBalance) || 0;
    const ytBalance = Number(body.ytBalance) || 0;
    const xlmBalance = Number(body.xlmBalance) || 0;
    const walletAssetsUsd = Number(body.walletAssetsUsd) || 0;
    const vaultLpUsd = Number(body.vaultLpUsd) || 0;
    const claimableYield = Number(body.claimableYield) || 0;
    const portfolioValue = Number(body.portfolioValue) || 0;
    const positionValue = Number(body.positionValue) || 0;

    // Fetch current protocol state to embed prices in this snapshot
    let ptPrice = 0;
    let ytPrice = 0;
    let tvl = 0;
    let fixedApy = 0;

    try {
      const state = await ProtocolService.getProtocolState();
      ptPrice = Number(state.ptPriceUnderlying) || 0;
      ytPrice = Math.max(0, 1.0 - ptPrice);
      tvl = Number(state.tvlUsd) || 0;
      fixedApy = Number(state.impliedYieldApy) || 0;
    } catch (e) {
      // Protocol state unavailable — still write wallet state with zero prices
      // so balance history is preserved even if on-chain data is temporarily unreachable.
      console.warn('[/api/history/snapshot] Could not fetch protocol state, storing wallet state with zero prices:', e);
    }

    // Validate — must have at least some portfolio activity to be worth storing
    if (portfolioValue === 0 && ptBalance === 0 && ytBalance === 0) {
      return NextResponse.json({ success: true, skipped: true, reason: 'empty wallet state' });
    }

    const entry = HistoryStore.addHistoryEntry({
      ptPrice,
      ytPrice,
      tvl,
      fixedApy,
      tradingVolume: 0,
      ptBalance,
      ytBalance,
      xlmBalance,
      walletAssetsUsd,
      vaultLpUsd,
      claimableYield,
      portfolioValue,
      positionValue,
      eventType: 'wallet_snapshot',
      txHash: null,
    });

    if (entry === null) {
      return NextResponse.json({ success: true, deduplicated: true });
    }

    return NextResponse.json({ success: true, entryId: entry.id });
  } catch (error) {
    console.error('[/api/history/snapshot] Unexpected error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 400 });
  }
}
