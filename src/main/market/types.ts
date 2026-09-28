import type {
  SearchResult, Quote, SparklineData, Timeframe, MarketState,
} from '../../shared/types';

export interface MarketDataProvider {
  readonly name: string;
  search(query: string): Promise<SearchResult[]>;
  getQuote(symbol: string): Promise<Quote | null>;
  getQuotes(symbols: string[]): Promise<Quote[]>;
  getHistory(symbol: string, timeframe: Timeframe): Promise<SparklineData | null>;
  getMarketStatus(symbol: string, quote?: Quote): MarketState | Promise<MarketState>;
}

export class YahooAuthError extends Error {
  readonly code: 'AUTH' | 'RATE_LIMIT' | 'CRUMB' | 'UNKNOWN';
  readonly status?: number;
  constructor(message: string, code: YahooAuthError['code'] = 'AUTH', status?: number) {
    super(message);
    this.name = 'YahooAuthError';
    this.code = code;
    this.status = status;
  }
}

export function isYahooAuthError(err: unknown): err is YahooAuthError {
  return err instanceof YahooAuthError;
}

export function classifyYahooFailure(err: unknown): YahooAuthError | null {
  if (err instanceof YahooAuthError) return err;
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const lower = msg.toLowerCase();
  const statusMatch = msg.match(/\b(401|403|429)\b/);
  const status = statusMatch ? Number(statusMatch[1]) : undefined;
  if (
    status === 401 || status === 403 ||
    lower.includes('unauthorized') || lower.includes('crumb') ||
    lower.includes('cookie') || lower.includes('invalid cookie') ||
    (lower.includes('auth') && !lower.includes('author'))
  ) {
    return new YahooAuthError(msg, lower.includes('crumb') ? 'CRUMB' : 'AUTH', status);
  }
  if (status === 429 || lower.includes('rate limit') || lower.includes('too many')) {
    return new YahooAuthError(msg, 'RATE_LIMIT', status ?? 429);
  }
  return null;
}


