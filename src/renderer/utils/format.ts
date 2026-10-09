import { formatPriceWith, formatChangeWith, autoDecimals } from '../../shared/priceFormat';

/** Legacy helpers (automatic decimals, no ticker context). Prefer formatTickerPrice. */
export function formatPrice(n: number, currency = 'USD'): string {
  return formatPriceWith(n, currency, autoDecimals('', undefined, n));
}

export function formatChange(n: number, pct: number): string {
  return formatChangeWith(n, pct, { min: 2, max: 2 });
}

export {
  formatTickerPrice,
  formatTickerChange,
  formatPercentChange,
  autoDecimalsLabel,
  DECIMAL_CHOICES,
} from '../../shared/priceFormat';

export function refreshLabel(seconds: number): string {
  if (seconds === 0) return 'Manual';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}
