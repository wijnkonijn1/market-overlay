/** CoinGecko public API fallback for crypto (no key). */
import type { Quote } from '../../shared/types';
import { displaySymbol } from '../../shared/cryptoMap';

const ID_MAP: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple', BNB: 'binancecoin',
  DOGE: 'dogecoin', ADA: 'cardano', AVAX: 'avalanche-2', DOT: 'polkadot',
  LINK: 'chainlink', LTC: 'litecoin', MATIC: 'matic-network', POL: 'polygon-ecosystem-token',
  SHIB: 'shiba-inu', UNI: 'uniswap', ATOM: 'cosmos', NEAR: 'near', APT: 'aptos',
};

export async function coinGeckoQuote(yahooSymbol: string): Promise<Quote | null> {
  const base = displaySymbol(yahooSymbol).toUpperCase();
  const id = ID_MAP[base];
  if (!id) return null;
  try {
    const url =
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd` +
      `&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const row = data[id];
    if (!row || row.usd == null) return null;
    const changePercent = row.usd_24h_change ?? 0;
    const price = row.usd;
    const change = (price * changePercent) / 100;
    return {
      symbol: yahooSymbol.includes('-') ? yahooSymbol : `${base}-USD`,
      name: base,
      price,
      change,
      changePercent,
      currency: 'USD',
      volume24h: row.usd_24h_vol,
      marketCap: row.usd_market_cap,
      marketState: 'CRYPTO_24_7',
      delayed: false,
      timestamp: Date.now(),
      type: 'crypto',
      exchange: 'CoinGecko',
    };
  } catch (err) {
    console.warn('[CoinGeckoFallback] failed:', err);
    return null;
  }
}

