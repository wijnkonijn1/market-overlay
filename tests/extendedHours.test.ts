import { describe, it, expect } from 'vitest';
import { applyExtendedHours, toMs } from '../src/shared/extendedHours';
import { mapQuoteResult } from '../src/main/market/YahooFinance2Provider';
import { mapChartResult } from '../src/main/market/YahooHttpProvider';
import { getMarketStateForSymbol } from '../src/main/market/marketHours';
import { CompositeProvider } from '../src/main/market/CompositeProvider';
import type { MarketDataProvider } from '../src/main/market/types';
import type { Quote } from '../src/shared/types';

// Fri 2026-10-23 16:00 ET close, Mon 2026-10-26 07:30 ET pre-market trade.
const FRI_CLOSE = new Date('2026-10-23T20:00:00Z');
const MON_PRE = new Date('2026-10-26T11:30:00Z');
const MON_OPEN_TRADE = new Date('2026-10-26T14:00:00Z');

const base: Quote = {
  symbol: 'AAPL', price: 200, change: 2, changePercent: 1.01, currency: 'USD',
  marketState: 'PRE', delayed: true, timestamp: 0, type: 'stock',
};

describe('applyExtendedHours', () => {
  it('PRE: pre-market price becomes the headline, change vs last close', () => {
    const q = applyExtendedHours(base, { pre: { price: 205, time: MON_PRE }, regularTime: FRI_CLOSE });
    expect(q.price).toBe(205);
    expect(q.change).toBeCloseTo(5);
    expect(q.changePercent).toBeCloseTo(2.5);
    expect(q.extended).toMatchObject({ session: 'PRE', price: 205, basePrice: 200 });
  });

  it('REGULAR: stale pre-market fields are ignored', () => {
    const q = applyExtendedHours({ ...base, marketState: 'REGULAR' }, {
      pre: { price: 205, time: MON_PRE }, regularTime: MON_OPEN_TRADE,
    });
    expect(q.price).toBe(200);
    expect(q.extended).toBeUndefined();
  });

  it('pre-market older than the last regular trade is ignored', () => {
    const q = applyExtendedHours({ ...base, marketState: 'CLOSED' }, {
      pre: { price: 205, time: MON_PRE }, regularTime: MON_OPEN_TRADE,
    });
    expect(q.extended).toBeUndefined();
  });

  it('POST: headline keeps the regular close, after-hours is secondary', () => {
    const q = applyExtendedHours({ ...base, marketState: 'POST' }, {
      post: { price: 198, time: new Date('2026-10-23T21:00:00Z') }, regularTime: FRI_CLOSE,
    });
    expect(q.price).toBe(200);
    expect(q.change).toBe(2);
    expect(q.extended).toMatchObject({ session: 'POST', price: 198, change: -2, changePercent: -1 });
  });

  it('crypto is never touched', () => {
    const c: Quote = { ...base, symbol: 'BTC-USD', type: 'crypto', marketState: 'CRYPTO_24_7' };
    expect(applyExtendedHours(c, { pre: { price: 1, time: MON_PRE } })).toBe(c);
  });

  it('without timestamps, trusts the market state', () => {
    expect(applyExtendedHours(base, { pre: { price: 201 } }).price).toBe(201);
    expect(applyExtendedHours({ ...base, marketState: 'CLOSED' }, { pre: { price: 201 } }).extended).toBeUndefined();
  });

  it('toMs handles Date, seconds and ms', () => {
    expect(toMs(MON_PRE)).toBe(MON_PRE.getTime());
    expect(toMs(MON_PRE.getTime() / 1000)).toBe(MON_PRE.getTime());
    expect(toMs(MON_PRE.getTime())).toBe(MON_PRE.getTime());
    expect(toMs(null)).toBeUndefined();
  });
});

describe('yahoo-finance2 quote mapping', () => {
  it('shows the pre-market move instead of Friday close', () => {
    const q = mapQuoteResult({
      symbol: 'AAPL', quoteType: 'EQUITY', fullExchangeName: 'NasdaqGS', marketState: 'PRE',
      regularMarketPrice: 200, regularMarketChange: 2, regularMarketChangePercent: 1.01,
      regularMarketPreviousClose: 198, regularMarketTime: FRI_CLOSE,
      preMarketPrice: 196, preMarketTime: MON_PRE,
    }, 'AAPL')!;
    expect(q.price).toBe(196);
    expect(q.change).toBeCloseTo(-4);
    expect(q.changePercent).toBeCloseTo(-2);
    expect(q.extended?.session).toBe('PRE');
    expect(q.marketState).toBe('PRE');
  });
});

describe('HTTP chart mapping', () => {
  const t = (d: Date) => Math.floor(d.getTime() / 1000);
  const tradingPeriod = {
    pre: { start: t(new Date('2026-10-26T08:00:00Z')), end: t(new Date('2026-10-26T13:30:00Z')) },
    regular: { start: t(new Date('2026-10-26T13:30:00Z')), end: t(new Date('2026-10-26T20:00:00Z')) },
    post: { start: t(new Date('2026-10-26T20:00:00Z')), end: t(new Date('2026-10-27T00:00:00Z')) },
  };

  it('uses the last pre-market bar as headline price', () => {
    const q = mapChartResult({
      meta: {
        symbol: 'AAPL', instrumentType: 'EQUITY', exchangeName: 'NMS', currency: 'USD',
        regularMarketPrice: 200, previousClose: 200, chartPreviousClose: 200,
        regularMarketTime: t(FRI_CLOSE), currentTradingPeriod: tradingPeriod,
      },
      timestamp: [t(MON_PRE) - 300, t(MON_PRE)],
      indicators: { quote: [{ close: [203, 204] }] },
    }, 'AAPL')!;
    expect(q.price).toBe(204);
    expect(q.changePercent).toBeCloseTo(2);
    expect(q.extended?.session).toBe('PRE');
  });

  it('prefers previousClose (prior session) over chartPreviousClose', () => {
    const q = mapChartResult({
      meta: {
        symbol: 'ABI.BR', exchangeName: 'BRU', instrumentType: 'EQUITY', currency: 'EUR',
        regularMarketPrice: 55, previousClose: 50, chartPreviousClose: 40,
      },
      timestamp: [], indicators: { quote: [{ close: [] }] },
    }, 'ABI.BR')!;
    expect(q.changePercent).toBeCloseTo(10);
    expect(q.extended).toBeUndefined();
  });
});

describe('market state mapping', () => {
  it('PREPRE / POSTPOST (overnight) map to CLOSED', () => {
    expect(getMarketStateForSymbol('AAPL', 'NMS', 'PREPRE')).toBe('CLOSED');
    expect(getMarketStateForSymbol('AAPL', 'NMS', 'POSTPOST')).toBe('CLOSED');
    expect(getMarketStateForSymbol('AAPL', 'NMS', 'PRE')).toBe('PRE');
  });
});

describe('CompositeProvider partial batch', () => {
  it('fills symbols missing from yahoo-finance2 via HTTP', async () => {
    const mk = (name: string, have: string[]): MarketDataProvider => ({
      name,
      search: async () => [],
      getQuote: async () => null,
      getQuotes: async (syms) => syms.filter((s) => have.includes(s)).map((s) => ({ ...base, symbol: s, marketState: 'REGULAR' as const })),
      getHistory: async () => null,
      getMarketStatus: () => 'UNKNOWN',
    });
    const c = new CompositeProvider({ primary: mk('yf2', ['AAPL']), http: mk('http', ['MSFT']), debug: false });
    const quotes = await c.getQuotes(['AAPL', 'MSFT']);
    expect(quotes.map((q) => q.symbol).sort()).toEqual(['AAPL', 'MSFT']);
  });
});
