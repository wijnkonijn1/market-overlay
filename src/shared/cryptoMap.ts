/** Crypto symbol helpers: Yahoo pairs + Binance stream ids */

const CRYPTO_MAP: Record<string, string> = {
  BTC: 'BTC-USD', ETH: 'ETH-USD', SOL: 'SOL-USD', XRP: 'XRP-USD', BNB: 'BNB-USD',
  DOGE: 'DOGE-USD', ADA: 'ADA-USD', AVAX: 'AVAX-USD', DOT: 'DOT-USD', MATIC: 'MATIC-USD',
  POL: 'POL-USD', LINK: 'LINK-USD', LTC: 'LTC-USD', UNI: 'UNI-USD', ATOM: 'ATOM-USD',
  SHIB: 'SHIB-USD', TRX: 'TRX-USD', NEAR: 'NEAR-USD', APT: 'APT-USD', ARB: 'ARB-USD',
  OP: 'OP-USD', SUI: 'SUI-USD', PEPE: 'PEPE-USD', FIL: 'FIL-USD', ICP: 'ICP-USD',
  HBAR: 'HBAR-USD', VET: 'VET-USD', ALGO: 'ALGO-USD', XLM: 'XLM-USD', AAVE: 'AAVE-USD',
  MKR: 'MKR-USD', CRV: 'CRV-USD', SAND: 'SAND-USD', MANA: 'MANA-USD', AXS: 'AXS-USD',
  GRT: 'GRT-USD', EOS: 'EOS-USD', XTZ: 'XTZ-USD', THETA: 'THETA-USD', FTM: 'FTM-USD',
  RUNE: 'RUNE-USD', INJ: 'INJ-USD', TIA: 'TIA-USD', SEI: 'SEI-USD', WIF: 'WIF-USD',
  BONK: 'BONK-USD',
};

const CRYPTO_BASES = new Set(Object.keys(CRYPTO_MAP));

export function normalizeSymbol(input: string): string {
  const raw = input.trim().toUpperCase();
  if (!raw) return raw;
  if (/^[A-Z0-9]+-USD$/.test(raw) || /^[A-Z0-9]+-EUR$/.test(raw)) return raw;
  if (CRYPTO_MAP[raw]) return CRYPTO_MAP[raw];
  return raw;
}

export function displaySymbol(yahooSymbol: string): string {
  const s = yahooSymbol.toUpperCase();
  if (s.endsWith('-USD') || s.endsWith('-EUR') || s.endsWith('-GBP')) {
    const base = s.split('-')[0];
    if (CRYPTO_BASES.has(base) || s.endsWith('-USD')) return base;
  }
  return yahooSymbol;
}

export function isCryptoSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase();
  if (CRYPTO_MAP[s]) return true;
  return /^[A-Z0-9]+-(USD|EUR|GBP)$/.test(s);
}

export function getCryptoMap(): Readonly<Record<string, string>> {
  return CRYPTO_MAP;
}

/** BTC-USD / BTC → btcusdt */
export function toBinanceStreamSymbol(yahooOrShort: string): string | null {
  const normalized = normalizeSymbol(yahooOrShort);
  const upper = normalized.toUpperCase();
  let base: string | null = null;
  if (/^[A-Z0-9]+-USD$/.test(upper)) base = upper.split('-')[0];
  else if (CRYPTO_MAP[upper]) base = upper;
  if (!base) return null;
  const binanceBase = base === 'POL' ? 'matic' : base.toLowerCase();
  return `${binanceBase}usdt`;
}

export function fromBinanceStreamSymbol(streamSym: string): string | null {
  const s = streamSym.toLowerCase().replace(/usdt$/, '');
  if (!s) return null;
  const base = s === 'matic' ? 'POL' : s.toUpperCase();
  return CRYPTO_MAP[base] ?? `${base}-USD`;
}

export { CRYPTO_MAP };
