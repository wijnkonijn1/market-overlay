import { describe, it, expect, vi } from 'vitest';
import { CompositeProvider } from '../src/main/market/CompositeProvider';
import type { MarketDataProvider } from '../src/main/market/types';
import type { Quote, SearchResult, SparklineData } from '../src/shared/types';
import { YahooAuthError } from '../src/main/market/types';

function mockProvider(name: string, opts: { fail?: boolean; quotes?: Quote[] }): MarketDataProvider {
  return {
    name,
    async search(q: string): Promise<SearchResult[]> {
      if (opts.fail) throw new YahooAuthError('auth', 'AUTH', 401);
      return q ? [{ symbol: 'AAPL', name: 'Apple', type: 'stock' }] : [];
    },
    async getQuote(symbol: string) {
      if (opts.fail) throw new YahooAuthError('auth', 'AUTH', 401);
      return opts.quotes?.find((q) => q.symbol === symbol) ?? null;
    },
    async getQuotes(symbols: string[]) {
      if (opts.fail) throw new YahooAuthError('rate', 'RATE_LIMIT', 429);
      return (opts.quotes || []).filter((q) => symbols.includes(q.symbol));
    },
    async getHistory(): Promise<SparklineData | null> {
      if (opts.fail) throw new Error('fail');
      return null;
    },
    getMarketStatus() {
      return 'UNKNOWN';
    },
  };
}

const sample: Quote = {
  symbol: 'AAPL',
  price: 190,
  change: 1,
  changePercent: 0.5,
  currency: 'USD',
  marketState: 'REGULAR',
  delayed: true,
  timestamp: Date.now(),
  type: 'stock',
};

describe('CompositeProvider fallback', () => {
  it('uses primary when healthy', async () => {
    const primary = mockProvider('yf2', { quotes: [sample] });
    const http = mockProvider('http', { quotes: [] });
    const spy = vi.spyOn(http, 'getQuote');
    const c = new CompositeProvider({ primary, http, preferFinance2: true });
    const q = await c.getQuote('AAPL');
    expect(q?.price).toBe(190);
    expect(c.lastBackend).toBe('yahoo-finance2');
    expect(spy).not.toHaveBeenCalled();
  });

  it('falls back to HTTP on auth failure', async () => {
    const primary = mockProvider('yf2', { fail: true });
    const http = mockProvider('http', { quotes: [sample] });
    const c = new CompositeProvider({ primary, http, preferFinance2: true, debug: false });
    const q = await c.getQuote('AAPL');
    expect(q?.price).toBe(190);
    expect(c.lastBackend).toBe('yahoo-http');
  });
});
