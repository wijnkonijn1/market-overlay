/**
 * Primary Yahoo provider via yahoo-finance2 (dynamic ESM import).
 */
import type {
  SearchResult, Quote, SparklineData, Timeframe, MarketState, AssetType,
} from '../../shared/types';
import { normalizeSymbol, isCryptoSymbol, displaySymbol } from '../../shared/cryptoMap';
import { getMarketStateForSymbol, enrichQuoteWithNextOpen } from './marketHours';
import type { MarketDataProvider } from './types';
import { classifyYahooFailure } from './types';

let yfPromise: Promise<any> | null = null;

async function getYf(): Promise<any> {
  if (!yfPromise) {
    yfPromise = (async () => {
      const mod = await import('yahoo-finance2');
      return (mod as any).default ?? mod;
    })();
  }
  return yfPromise;
}

export function resetYahooFinance2Module(): void {
  yfPromise = null;
}

function mapAssetType(qt?: string, symbol?: string): AssetType {
  const t = (qt || '').toUpperCase();
  if (symbol && isCryptoSymbol(symbol)) return 'crypto';
  if (t.includes('CRYPTO') || t === 'CRYPTOCURRENCY') return 'crypto';
  if (t === 'ETF' || t === 'MUTUALFUND') return 'etf';
  if (t === 'INDEX') return 'index';
  if (t === 'CURRENCY' || t === 'CURRENCYPAIR') return 'currency';
  if (t === 'EQUITY' || t === 'STOCK') return 'stock';
  return 'other';
}

const TIMEFRAME_CHART: Record<Timeframe, { range: string; interval: string }> = {
  '1D': { range: '1d', interval: '5m' },
  '5D': { range: '5d', interval: '15m' },
  '1M': { range: '1mo', interval: '1h' },
  '3M': { range: '3mo', interval: '1d' },
  '6M': { range: '6mo', interval: '1d' },
  '1Y': { range: '1y', interval: '1d' },
  '5Y': { range: '5y', interval: '1wk' },
};

function rethrowAuth(err: unknown): never {
  const classified = classifyYahooFailure(err);
  if (classified) throw classified;
  throw err instanceof Error ? err : new Error(String(err));
}

function mapQuoteResult(q: any, symbol: string): Quote | null {
  if (!q) return null;
  const price = q.regularMarketPrice ?? q.postMarketPrice ?? q.preMarketPrice ?? null;
  if (price == null || Number.isNaN(Number(price))) return null;
  const prev = q.regularMarketPreviousClose ?? q.previousClose;
  const change =
    q.regularMarketChange != null
      ? Number(q.regularMarketChange)
      : prev != null
        ? Number(price) - Number(prev)
        : 0;
  const changePercent =
    q.regularMarketChangePercent != null
      ? Number(q.regularMarketChangePercent)
      : prev
        ? (change / Number(prev)) * 100
        : 0;
  const type = mapAssetType(q.quoteType || q.typeDisp, symbol);
  const exchange = q.fullExchangeName || q.exchange;
  const delayed = type !== 'crypto';
  return {
    symbol: q.symbol || symbol,
    name: q.shortName || q.longName || q.displayName || displaySymbol(symbol),
    price: Number(price),
    change,
    changePercent,
    currency: q.currency || 'USD',
    previousClose: prev != null ? Number(prev) : undefined,
    dayHigh: q.regularMarketDayHigh != null ? Number(q.regularMarketDayHigh) : undefined,
    dayLow: q.regularMarketDayLow != null ? Number(q.regularMarketDayLow) : undefined,
    volume: q.regularMarketVolume != null ? Number(q.regularMarketVolume) : undefined,
    marketCap: q.marketCap != null ? Number(q.marketCap) : undefined,
    fiftyTwoWeekHigh: q.fiftyTwoWeekHigh != null ? Number(q.fiftyTwoWeekHigh) : undefined,
    fiftyTwoWeekLow: q.fiftyTwoWeekLow != null ? Number(q.fiftyTwoWeekLow) : undefined,
    volume24h: type === 'crypto' && q.regularMarketVolume != null ? Number(q.regularMarketVolume) : undefined,
    high24h: type === 'crypto' && q.regularMarketDayHigh != null ? Number(q.regularMarketDayHigh) : undefined,
    low24h: type === 'crypto' && q.regularMarketDayLow != null ? Number(q.regularMarketDayLow) : undefined,
    marketState: getMarketStateForSymbol(symbol, exchange, q.marketState),
    delayed,
    delayMinutes: delayed ? 15 : undefined,
    timestamp: Date.now(),
    type,
    exchange,
  };
}

export class YahooFinance2Provider implements MarketDataProvider {
  readonly name = 'yahoo-finance2';

  async search(query: string): Promise<SearchResult[]> {
    const q = query.trim();
    if (!q) return [];
    const normalized = normalizeSymbol(q);
    try {
      const yf = await getYf();
      const data = await yf.search(q, { quotesCount: 12, newsCount: 0 });
      const results: SearchResult[] = [];
      for (const item of data?.quotes ?? []) {
        const symbol = item.symbol as string;
        if (!symbol) continue;
        results.push({
          symbol,
          name: item.shortname || item.longname || item.name || symbol,
          type: mapAssetType(item.quoteType || item.typeDisp, symbol),
          exchange: item.exchange || item.exchDisp,
        });
      }
      if (normalized !== q.toUpperCase() && !results.some((r) => r.symbol === normalized)) {
        results.unshift({
          symbol: normalized,
          name: `${displaySymbol(normalized)} / USD`,
          type: 'crypto',
          exchange: 'CCC',
        });
      }
      return results;
    } catch (err) {
      rethrowAuth(err);
    }
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const sym = normalizeSymbol(symbol);
    try {
      const yf = await getYf();
      const q = await yf.quote(sym);
      const mapped = mapQuoteResult(Array.isArray(q) ? q[0] : q, sym);
      if (!mapped) throw new Error(`empty quote for ${sym}`);
      return enrichQuoteWithNextOpen(mapped);
    } catch (err) {
      rethrowAuth(err);
    }
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    if (!symbols.length) return [];
    const normalized = [...new Set(symbols.map(normalizeSymbol))];
    try {
      const yf = await getYf();
      const raw = await yf.quote(normalized);
      const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
      const out: Quote[] = [];
      for (const item of list) {
        const mapped = mapQuoteResult(item, item?.symbol || '');
        if (mapped) out.push(enrichQuoteWithNextOpen(mapped));
      }
      return out;
    } catch (err) {
      rethrowAuth(err);
    }
  }

  async getHistory(symbol: string, timeframe: Timeframe): Promise<SparklineData | null> {
    const sym = normalizeSymbol(symbol);
    const cfg = TIMEFRAME_CHART[timeframe];
    try {
      const yf = await getYf();
      const result = await yf.chart(sym, { interval: cfg.interval, range: cfg.range });
      const quotes = result?.quotes ?? [];
      const points = quotes
        .filter((p: any) => p?.close != null && !Number.isNaN(Number(p.close)))
        .map((p: any) => ({
          date: p.date instanceof Date ? p.date.getTime() : Number(p.date),
          close: Number(p.close),
        }));
      if (!points.length) return null;
      return { symbol: sym, timeframe, points };
    } catch (err) {
      rethrowAuth(err);
    }
  }

  getMarketStatus(symbol: string, quote?: Quote): MarketState {
    if (quote?.marketState) return quote.marketState;
    return getMarketStateForSymbol(symbol, quote?.exchange);
  }
}

export const yahooFinance2Provider = new YahooFinance2Provider();
