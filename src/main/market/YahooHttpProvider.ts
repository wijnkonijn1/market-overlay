/**
 * Yahoo Finance HTTP chart/search provider (no API key / crumb).
 */
import type {
  SearchResult, Quote, SparklineData, Timeframe, MarketState, AssetType,
} from '../../shared/types';
import { normalizeSymbol, isCryptoSymbol, displaySymbol } from '../../shared/cryptoMap';
import { getMarketStateForSymbol, enrichQuoteWithNextOpen } from './marketHours';
import { coinGeckoQuote } from './CoinGeckoFallback';
import type { MarketDataProvider } from './types';

const UA = 'Mozilla/5.0 (compatible; MarketOverlay/1.1)';

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

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

export class YahooHttpProvider implements MarketDataProvider {
  readonly name = 'yahoo-http';
  private failures = 0;
  private lastFailureAt = 0;

  private async withBackoff<T>(fn: () => Promise<T>): Promise<T> {
    if (this.failures > 0) {
      const backoff = Math.min(30_000, 400 * Math.pow(2, this.failures - 1));
      const since = Date.now() - this.lastFailureAt;
      if (since < backoff) await new Promise((r) => setTimeout(r, backoff - since));
    }
    try {
      const result = await fn();
      this.failures = 0;
      return result;
    } catch (e) {
      this.failures = Math.min(8, this.failures + 1);
      this.lastFailureAt = Date.now();
      throw e;
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    const q = query.trim();
    if (!q) return [];
    const normalized = normalizeSymbol(q);
    const results: SearchResult[] = [];
    try {
      const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0`;
      const data = await this.withBackoff(() => fetchJson(url));
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
    } catch (err) {
      console.warn('[YahooHttpProvider] search failed:', err);
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
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const sym = normalizeSymbol(symbol);
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`;
      const data = await this.withBackoff(() => fetchJson(url));
      const result = data?.chart?.result?.[0];
      if (!result?.meta) throw new Error('empty chart');
      const quote = this.mapFromChartMeta(result.meta, sym);
      return quote ? enrichQuoteWithNextOpen(quote) : null;
    } catch (err) {
      console.warn(`[YahooHttpProvider] quote failed for ${sym}:`, err);
      if (isCryptoSymbol(sym)) return coinGeckoQuote(sym);
      return null;
    }
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    if (!symbols.length) return [];
    const normalized = [...new Set(symbols.map(normalizeSymbol))];
    const out: Quote[] = [];
    for (let i = 0; i < normalized.length; i += 4) {
      const chunk = normalized.slice(i, i + 4);
      const parts = await Promise.all(chunk.map((s) => this.getQuote(s)));
      for (const q of parts) if (q) out.push(q);
    }
    return out;
  }

  async getHistory(symbol: string, timeframe: Timeframe): Promise<SparklineData | null> {
    const sym = normalizeSymbol(symbol);
    const cfg = TIMEFRAME_CHART[timeframe];
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${cfg.interval}&range=${cfg.range}`;
      const data = await this.withBackoff(() => fetchJson(url));
      const result = data?.chart?.result?.[0];
      const timestamps: number[] = result?.timestamp ?? [];
      const closes: Array<number | null> = result?.indicators?.quote?.[0]?.close ?? [];
      const points = timestamps
        .map((t, i) => ({ date: t * 1000, close: closes[i] != null ? Number(closes[i]) : NaN }))
        .filter((p) => !Number.isNaN(p.close));
      if (!points.length) return null;
      return { symbol: sym, timeframe, points };
    } catch (err) {
      console.warn(`[YahooHttpProvider] history failed for ${sym}/${timeframe}:`, err);
      return null;
    }
  }

  getMarketStatus(symbol: string, quote?: Quote): MarketState {
    if (quote?.marketState) return quote.marketState;
    return getMarketStateForSymbol(symbol, quote?.exchange);
  }

  private mapFromChartMeta(meta: any, symbol: string): Quote | null {
    const price = meta.regularMarketPrice ?? meta.postMarketPrice ?? meta.previousClose;
    if (price == null || Number.isNaN(Number(price))) return null;
    const prev = meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPreviousClose;
    const change = prev != null ? Number(price) - Number(prev) : 0;
    const changePercent = prev ? (change / Number(prev)) * 100 : 0;
    const type = mapAssetType(meta.instrumentType, symbol);
    const exchange = meta.fullExchangeName || meta.exchangeName;
    const delayed = type !== 'crypto';
    return {
      symbol: meta.symbol || symbol,
      name: meta.shortName || meta.longName || displaySymbol(symbol),
      price: Number(price),
      change,
      changePercent,
      currency: meta.currency || 'USD',
      previousClose: prev != null ? Number(prev) : undefined,
      dayHigh: meta.regularMarketDayHigh != null ? Number(meta.regularMarketDayHigh) : undefined,
      dayLow: meta.regularMarketDayLow != null ? Number(meta.regularMarketDayLow) : undefined,
      volume: meta.regularMarketVolume != null ? Number(meta.regularMarketVolume) : undefined,
      marketCap: meta.marketCap != null ? Number(meta.marketCap) : undefined,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh != null ? Number(meta.fiftyTwoWeekHigh) : undefined,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow != null ? Number(meta.fiftyTwoWeekLow) : undefined,
      volume24h: type === 'crypto' && meta.regularMarketVolume != null ? Number(meta.regularMarketVolume) : undefined,
      high24h: type === 'crypto' && meta.regularMarketDayHigh != null ? Number(meta.regularMarketDayHigh) : undefined,
      low24h: type === 'crypto' && meta.regularMarketDayLow != null ? Number(meta.regularMarketDayLow) : undefined,
      marketState: getMarketStateForSymbol(symbol, exchange, meta.marketState),
      delayed,
      delayMinutes: delayed ? 15 : undefined,
      timestamp: Date.now(),
      type,
      exchange,
    };
  }
}

export const yahooHttpProvider = new YahooHttpProvider();
