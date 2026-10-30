/**
 * Extended-hours (US pre-market / after-hours) handling, shared by all providers.
 *
 * Rules:
 * - Pre-market trade newer than the last regular trade → it becomes the headline
 *   price, and change/% are measured against the last regular close. That is
 *   the "move since yesterday" a trader looks at before the open.
 * - After-hours trade newer than the last regular trade → headline stays on the
 *   regular close (the day's real move); the after-hours trade is attached as a
 *   secondary `extended` value (change vs. today's close).
 * - During the regular session, for crypto, or when no fresher extended trade
 *   exists, the quote is returned unchanged.
 */
import type { ExtendedQuote, Quote } from './types';

export interface ExtendedTrade {
  price?: number | null;
  /** ms epoch, seconds epoch or Date */
  time?: number | Date | null;
}

export interface ExtendedInput {
  pre?: ExtendedTrade | null;
  post?: ExtendedTrade | null;
  /** Time of the last regular-session trade (ms, s or Date). */
  regularTime?: number | Date | null;
}

/** Normalise Date / seconds / ms to ms epoch. */
export function toMs(t: number | Date | null | undefined): number | undefined {
  if (t == null) return undefined;
  if (t instanceof Date) {
    const ms = t.getTime();
    return Number.isFinite(ms) ? ms : undefined;
  }
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n < 1e12 ? n * 1000 : n;
}

function valid(p: number | null | undefined): p is number {
  return p != null && Number.isFinite(Number(p)) && Number(p) > 0;
}

function pct(change: number, base: number): number {
  return base ? (change / base) * 100 : 0;
}

export function applyExtendedHours(quote: Quote, input: ExtendedInput): Quote {
  if (quote.type === 'crypto' || quote.marketState === 'CRYPTO_24_7') return quote;
  if (quote.marketState === 'REGULAR') return quote;

  const regularTime = toMs(input.regularTime);
  const candidates: Array<{ session: 'PRE' | 'POST'; price: number; time?: number }> = [];
  for (const session of ['PRE', 'POST'] as const) {
    const trade = session === 'PRE' ? input.pre : input.post;
    if (!trade || !valid(trade.price)) continue;
    const time = toMs(trade.time);
    // Must be newer than the last regular trade (drops stale pre-market fields
    // Yahoo keeps around after the open). Without timestamps, trust the state.
    if (time != null && regularTime != null) {
      if (time <= regularTime) continue;
    } else if (quote.marketState !== session) {
      continue;
    }
    candidates.push({ session, price: Number(trade.price), time });
  }
  if (!candidates.length) return quote;
  candidates.sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
  const best = candidates[0];

  const base = quote.price; // last regular-session price = reference close
  const change = best.price - base;
  const extended: ExtendedQuote = {
    session: best.session,
    price: best.price,
    change,
    changePercent: pct(change, base),
    time: best.time,
    basePrice: base,
  };

  if (best.session === 'PRE') {
    return {
      ...quote,
      price: best.price,
      change,
      changePercent: extended.changePercent,
      extended,
    };
  }
  return { ...quote, extended };
}
