import { Prisma } from '@prisma/client';
import { scValToNative } from '@stellar/stellar-sdk';
import { prisma } from './db';

type Tx = Prisma.TransactionClient;

// i128 fields decode to bigint via scValToNative; Prisma amount columns are
// String, so every amount is stringified before use/persistence.
function stringifyAmounts(data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = typeof value === 'bigint' ? value.toString() : String(value);
  }
  return out;
}

async function getOrCreateUser(tx: Tx, address: string) {
  if (typeof address !== 'string' || address.length === 0) {
    throw new Error(`getOrCreateUser: missing/invalid address (${JSON.stringify(address)})`);
  }
  await tx.user.upsert({
    where: { id: address },
    create: { id: address },
    update: {},
  });
}

/**
 * The protocol currently has no epoch-rotation mechanism (single deployment per
 * network), so we upsert one Epoch row keyed by the tokenizer contract address
 * to satisfy Activity/Position/YieldClaim's required epoch relation.
 * maturityLedger is a placeholder (0) until real epoch tracking exists (see
 * plan Task 5) — do not rely on it for maturity logic yet.
 */
export async function getOrCreateEpoch(deployments: Record<string, string>) {
  const { tokenizer, underlying_token, sy_wrapper, pt_token, yt_token } = deployments;
  if (!tokenizer) throw new Error('deployments missing tokenizer address');
  const epoch = await prisma.epoch.upsert({
    where: { id: tokenizer },
    create: {
      id: tokenizer,
      maturityLedger: 0,
      underlyingAsset: underlying_token ?? '',
      syAsset: sy_wrapper ?? '',
      ptAsset: pt_token ?? '',
      ytAsset: yt_token ?? '',
    },
    update: {},
  });
  return epoch.id;
}

async function recordActivity(
  tx: Tx,
  opts: { id: string; type: string; userId: string; epochId: string; amount: string; timestamp: Date; txHash: string }
) {
  await getOrCreateUser(tx, opts.userId);
  await tx.activity.upsert({
    where: { id: opts.id },
    create: opts,
    update: {},
  });
}

export async function processEvent(
  tx: Tx,
  event: any,
  txHash: string,
  timestamp: Date,
  contractId: string,
  contractLabel: string,
  epochId: string
) {
  // event.topic[0] is the event-name Symbol; #[contractevent]'s default
  // data_format is Map, so event.value decodes to a plain object keyed by field name.
  const topicName = event.topic?.[0] !== undefined ? scValToNative(event.topic[0]) : undefined;
  if (typeof topicName !== 'string') return;

  const topicFields = event.topic.slice(1).map((t: any) => scValToNative(t));
  const data = stringifyAmounts((scValToNative(event.value) as Record<string, unknown>) ?? {});

  // event.id is unique per (ledger, tx, operation, event-index) — use it as the
  // idempotency key so a re-processed or duplicate-delivered event never double-writes.
  const eventId: string = event.id;
  const activityType = `${contractLabel}_${topicName}`;

  try {
    switch (topicName) {
      // sy-wrapper
      case 'deposit': {
        const [holder] = topicFields;
        await recordActivity(tx, {
          id: eventId,
          type: activityType,
          userId: holder,
          epochId,
          amount: data.underlying_amount,
          timestamp,
          txHash,
        });
        break;
      }
      case 'redeem': {
        const [holder] = topicFields;
        await recordActivity(tx, {
          id: eventId,
          type: activityType,
          userId: holder,
          epochId,
          amount: data.underlying_amount,
          timestamp,
          txHash,
        });
        break;
      }
      // tokenizer
      case 'split': {
        const [holder] = topicFields;
        await recordActivity(tx, {
          id: eventId,
          type: activityType,
          userId: holder,
          epochId,
          amount: data.face,
          timestamp,
          txHash,
        });
        break;
      }
      case 'recombine': {
        const [holder] = topicFields;
        await recordActivity(tx, {
          id: eventId,
          type: activityType,
          userId: holder,
          epochId,
          amount: data.sy_out,
          timestamp,
          txHash,
        });
        break;
      }
      case 'redeem_at_maturity': {
        const [holder] = topicFields;
        await recordActivity(tx, {
          id: eventId,
          type: activityType,
          userId: holder,
          epochId,
          amount: data.pt_amount,
          timestamp,
          txHash,
        });
        break;
      }
      case 'claim_yield': {
        const [holder] = topicFields;
        await getOrCreateUser(tx, holder);
        await tx.yieldClaim.upsert({
          where: { id: eventId },
          create: {
            id: eventId,
            userId: holder,
            epochId,
            amount: data.sy_out,
            timestamp,
            txHash,
          },
          update: {},
        });
        break;
      }
      // pt-token / yt-token (contractLabel disambiguates which token contract emitted this)
      case 'mint': {
        const [to] = topicFields;
        await recordActivity(tx, {
          id: eventId,
          type: activityType,
          userId: to,
          epochId,
          amount: data.amount,
          timestamp,
          txHash,
        });
        break;
      }
      case 'burn': {
        const [from] = topicFields;
        await recordActivity(tx, {
          id: eventId,
          type: activityType,
          userId: from,
          epochId,
          amount: data.amount,
          timestamp,
          txHash,
        });
        break;
      }
      case 'transfer': {
        // Activity has no counterparty column, so a transfer is recorded as two legs
        // (sender/receiver) distinguished by an _out/_in suffix on the same eventId.
        const [from, to] = topicFields;
        await recordActivity(tx, {
          id: `${eventId}:out`,
          type: `${activityType}_out`,
          userId: from,
          epochId,
          amount: data.amount,
          timestamp,
          txHash,
        });
        await recordActivity(tx, {
          id: `${eventId}:in`,
          type: `${activityType}_in`,
          userId: to,
          epochId,
          amount: data.amount,
          timestamp,
          txHash,
        });
        break;
      }
      // amm
      case 'swap': {
        const [trader] = topicFields;
        await getOrCreateUser(tx, trader);
        await tx.trade.upsert({
          where: { id: eventId },
          create: {
            id: eventId,
            epochId,
            buyer: trader,
            amountIn: data.amount_in,
            amountOut: data.amount_out,
            // Not derivable from the Swap event alone (needs price/maturity context);
            // left as "0" until a rate-calculation source is implemented.
            impliedRate: '0',
            timestamp,
            txHash,
          },
          update: {},
        });
        break;
      }
      case 'add_liquidity': {
        const [provider] = topicFields;
        await recordActivity(tx, {
          id: eventId,
          type: activityType,
          userId: provider,
          epochId,
          amount: data.lp_out,
          timestamp,
          txHash,
        });
        break;
      }
      case 'remove_liquidity': {
        const [provider] = topicFields;
        await recordActivity(tx, {
          id: eventId,
          type: activityType,
          userId: provider,
          epochId,
          amount: data.lp_in,
          timestamp,
          txHash,
        });
        break;
      }
      default:
        console.log(`Unhandled event topic: ${topicName} (contract ${contractLabel})`);
    }
  } catch (error) {
    console.error(`Error processing event ${topicName}:`, error);
    throw error; // surface to the caller so the enclosing transaction rolls back
  }
}

export async function getSyncState() {
  let state = await prisma.syncState.findUnique({ where: { id: 'singleton' } });
  if (!state) {
    state = await prisma.syncState.create({
      data: { id: 'singleton', lastLedger: 0 },
    });
  }
  return state;
}

export async function runInTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn);
}
