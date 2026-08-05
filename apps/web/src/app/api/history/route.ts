import { NextResponse } from 'next/server';
import { HistoryStore } from '@/lib/historyStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const history = HistoryStore.getHistory(5000);
    return NextResponse.json(history);
  } catch (error) {
    // Never return 500 — always return valid JSON
    console.error('[/api/history] Unexpected error:', error);
    return NextResponse.json([]);
  }
}
