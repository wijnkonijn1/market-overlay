/**
 * Price / change formatting with optional per-ticker decimals.
 *
 * decimals: undefined = automatic
 *   - forex (symbol ends with "=X" or type 'currency'): 4
 *   - everything else: existing smart rule — 2 decimals, up to 6 when |price| < 1
 *     (small crypto / penny prices)
 * decimals: 0..8 = fixed number of decimals for price AND absolute change.
 * Percent change always uses 2 decimals.
 */
import type { AssetType } from './types';

export const MIN_DECIMALS = 0;
export const MAX_DECIMALS = 8;
export const DECIMAL_CHOICES = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

export interface DecimalsSpec {
  min: number;
  max: number;
}

export function isForexSymbol(symbol: string, type?: AssetType): boolean {
  return type === 'currency' || /=X$/i.test(symbol.trim());
}

/** Validate a stored/imported value: integer 0..8, otherwise undefined (= auto). */
export function sanitizeDecimals(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  if (typeof v === 'string' && v.trim().toLowerCase() === 'auto') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  if (!Number.isFinite(n) || !Number.isInteger(n)) return undefined;
  if (n < MIN_DECIMALS || n > MAX_DECIMALS) return undefined;
  return n;
}

/** Automatic decimals for a ticker/price (used when no per-ticker value is set). */
export function autoDecimals(symbol: string, type: AssetType | undefined, price: number): DecimalsSpec {
  if (isForexSymbol(symbol, type)) return { min: 4, max: 4 };
  if (Number.isFinite(price) && Math.abs(price) < 1) return { min: 2, max: 6 };
  return { min: 2, max: 2 };
}

export function resolveDecimals(
  symbol: string,
  type: AssetType | undefined,
  price: number,
  decimals?: number
): DecimalsSpec {
  const d = sanitizeDecimals(decimals);
  if (d !== undefined) return { min: d, max: d };
  return autoDecimals(symbol, type, price);
}

/** Short label for "Auto (n)" menus. */
export function autoDecimalsLabel(symbol: string, type: AssetType | undefined, price: number): string {
  const a = autoDecimals(symbol, type, price);
  return a.min === a.max ? String(a.max) : `${a.min}–${a.max}`;
}

function fmtNumber(n: number, spec: DecimalsSpec): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: spec.min,
    maximumFractionDigits: spec.max,
  }).format(n);
}

export function formatPriceWith(n: number, currency: string | undefined, spec: DecimalsSpec): string {
  if (!Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: spec.min,
      maximumFractionDigits: spec.max,
    }).format(n);
  } catch {
    return fmtNumber(n, spec);
  }
}

/** Absolute change uses the price decimals; percent always 2. */
/** Percent change only, always 2 decimals, signed: "+3.06%". */
export function formatPercentChange(changePercent: number): string {
  if (!Number.isFinite(changePercent)) return '—';
  const sign = changePercent >= 0 ? '+' : '';
  return `${sign}${changePercent.toFixed(2)}%`;
}

export function formatChangeWith(change: number, pct: number, spec: DecimalsSpec): string {
  const sign = change > 0 ? '+' : '';
  const psign = pct > 0 ? '+' : '';
  const abs = Number.isFinite(change) ? fmtNumber(change, spec) : '—';
  const p = Number.isFinite(pct) ? pct.toFixed(2) : '—';
  return `${sign}${abs} (${psign}${p}%)`;
}

/** Convenience for a ticker entry + quote. */
export function formatTickerPrice(
  t: { symbol: string; type?: AssetType; decimals?: number },
  price: number,
  currency?: string
): string {
  return formatPriceWith(price, currency, resolveDecimals(t.symbol, t.type, price, t.decimals));
}

export function formatTickerChange(
  t: { symbol: string; type?: AssetType; decimals?: number },
  price: number,
  change: number,
  pct: number
): string {
  return formatChangeWith(change, pct, resolveDecimals(t.symbol, t.type, price, t.decimals));
}
