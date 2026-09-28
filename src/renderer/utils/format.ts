export function formatPrice(n: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency, currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: n < 1 ? 6 : 2,
    }).format(n);
  } catch {
    return n.toFixed(2);
  }
}

export function formatChange(n: number, pct: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;
}

export function refreshLabel(seconds: number): string {
  if (seconds === 0) return 'Manual';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}
