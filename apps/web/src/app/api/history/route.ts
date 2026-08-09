import { NextResponse } from 'next/server';
import { HistoryStore } from '@/lib/historyStore';
import { NETWORK, CONTRACTS } from '@/config/contracts';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const history = HistoryStore.getHistory(NETWORK, CONTRACTS.SY_WRAPPER, 5000);
    return NextResponse.json(history);
  } catch (error) {
    // Never return 500 — always return valid JSON
    console.error('[/api/history] Unexpected error:', error);
    return NextResponse.json([]);
  }
}
