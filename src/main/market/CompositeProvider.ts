/**
 * Provider stack: yahoo-finance2 → HTTP → CoinGecko (crypto only).
 */
import type { SearchResult, Quote, SparklineData, Timeframe, MarketState } from '../../shared/types';
import { isCryptoSymbol } from '../../shared/cryptoMap';
import { coinGeckoQuote } from './CoinGeckoFallback';
import { YahooFinance2Provider } from './YahooFinance2Provider';
import { YahooHttpProvider } from './YahooHttpProvider';
import type { MarketDataProvider } from './types';
import { classifyYahooFailure } from './types';
import { getMarketStateForSymbol, enrichQuoteWithNextOpen } from './marketHours';

export type ProviderBackend = 'yahoo-finance2' | 'yahoo-http' | 'coingecko';

export interface CompositeProviderOptions {
  primary?: MarketDataProvider;
  http?: MarketDataProvider;
  preferFinance2?: boolean;
  debug?: boolean;
}

function debugLog(enabled: boolean, ...args: unknown[]) {
  if (enabled) console.debug('[CompositeProvider]', ...args);
}

export class CompositeProvider implements MarketDataProvider {
  readonly name = 'composite';
  private primary: MarketDataProvider;
  private http: MarketDataProvider;
  private preferFinance2: boolean;
  private debug: boolean;
  lastBackend: ProviderBackend | null = null;

  constructor(opts: CompositeProviderOptions = {}) {
    this.primary = opts.primary ?? new YahooFinance2Provider();
    this.http = opts.http ?? new YahooHttpProvider();
    this.preferFinance2 = opts.preferFinance2 !== false;
    this.debug = opts.debug ?? process.env.DEBUG_MARKET === '1';
  }

  private async tryPrimaryThenHttp<T>(
    op: string,
    primaryFn: () => Promise<T>,
    httpFn: () => Promise<T>,
    isEmpty?: (v: T) => boolean
  ): Promise<T> {
    if (this.preferFinance2) {
      try {
        const result = await primaryFn();
        if (!isEmpty?.(result)) {
          this.lastBackend = 'yahoo-finance2';
          debugLog(this.debug, op, 'served by yahoo-finance2');
          return result;
        }
        debugLog(this.debug, op, 'yahoo-finance2 empty → HTTP');
      } catch (err) {
        const auth = classifyYahooFailure(err);
        debugLog(this.debug, op, 'yahoo-finance2 failed → HTTP', auth ? auth.code : err);
      }
    }
    const httpResult = await httpFn();
    this.lastBackend = 'yahoo-http';
    debugLog(this.debug, op, 'served by yahoo-http');
    return httpResult;
  }

  async search(query: string): Promise<SearchResult[]> {
    return this.tryPrimaryThenHttp(
      'search',
      () => this.primary.search(query),
      () => this.http.search(query),
      (r) => !r?.length
    );
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    let quote: Quote | null = null;
    try {
      quote = await this.tryPrimaryThenHttp(
        `quote:${symbol}`,
        () => this.primary.getQuote(symbol),
        () => this.http.getQuote(symbol),
        (r) => r == null
      );
    } catch (err) {
      debugLog(this.debug, 'quote both failed', symbol, err);
      quote = null;
    }
    if (!quote && isCryptoSymbol(symbol)) {
      quote = await coinGeckoQuote(symbol);
      if (quote) {
        this.lastBackend = 'coingecko';
        debugLog(this.debug, `quote:${symbol}`, 'served by coingecko');
      }
    }
    return quote ? enrichQuoteWithNextOpen(quote) : null;
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    if (!symbols.length) return [];
    let quotes: Quote[] = [];
    if (this.preferFinance2) {
      try {
        quotes = await this.primary.getQuotes(symbols);
        if (quotes.length) {
          this.lastBackend = 'yahoo-finance2';
          debugLog(this.debug, 'quotes', `served by yahoo-finance2 (${quotes.length})`);
        }
      } catch (err) {
        debugLog(this.debug, 'quotes yahoo-finance2 failed → HTTP', err);
        quotes = [];
      }
    }
    if (!quotes.length) {
      quotes = await this.http.getQuotes(symbols);
      this.lastBackend = 'yahoo-http';
      debugLog(this.debug, 'quotes', `served by yahoo-http (${quotes.length})`);
    }
    const got = new Set(quotes.map((q) => q.symbol));
    for (const sym of symbols.filter((s) => !got.has(s) && isCryptoSymbol(s))) {
      const cg = await coinGeckoQuote(sym);
      if (cg) {
        quotes.push(cg);
        this.lastBackend = 'coingecko';
        debugLog(this.debug, `quote:${sym}`, 'served by coingecko');
      }
    }
    return quotes.map(enrichQuoteWithNextOpen);
  }

  async getHistory(symbol: string, timeframe: Timeframe): Promise<SparklineData | null> {
    return this.tryPrimaryThenHttp(
      `history:${symbol}/${timeframe}`,
      () => this.primary.getHistory(symbol, timeframe),
      () => this.http.getHistory(symbol, timeframe),
      (r) => r == null
    );
  }

  getMarketStatus(symbol: string, quote?: Quote): MarketState {
    if (quote?.marketState) return quote.marketState;
    return getMarketStateForSymbol(symbol, quote?.exchange);
  }
}

export const marketDataService = new CompositeProvider();
