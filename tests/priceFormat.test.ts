import { describe, it, expect } from 'vitest';
import {
  autoDecimals,
  resolveDecimals,
  sanitizeDecimals,
  formatTickerPrice,
  formatTickerChange,
  autoDecimalsLabel,
  isForexSymbol,
} from '../src/shared/priceFormat';
import { formatPercentChange } from '../src/shared/priceFormat';

const digitsAfterPoint = (s: string) => {
  const m = /\.(\d+)/.exec(s.replace(/[^\d.,+\-()%]/g, ''));
  return m ? m[1].length : 0;
};

describe('automatic decimals', () => {
  it('forex (=X or currency type) → 4', () => {
    expect(isForexSymbol('EURUSD=X')).toBe(true);
    expect(isForexSymbol('eurusd=x')).toBe(true);
    expect(autoDecimals('EURUSD=X', 'currency', 1.0845)).toEqual({ min: 4, max: 4 });
    expect(autoDecimals('GBPUSD', 'currency', 1.27)).toEqual({ min: 4, max: 4 });
    expect(formatTickerPrice({ symbol: 'EURUSD=X', type: 'currency' }, 1.08451234, 'USD')).toBe('$1.0845');
  });
  it('stocks / ETFs / indices → 2', () => {
    expect(formatTickerPrice({ symbol: 'AAPL', type: 'stock' }, 187.456, 'USD')).toBe('$187.46');
    expect(formatTickerPrice({ symbol: 'SPY', type: 'etf' }, 500, 'USD')).toBe('$500.00');
    expect(formatTickerPrice({ symbol: '^GSPC', type: 'index' }, 5123.4, 'USD')).toBe('$5,123.40');
  });
  it('crypto keeps the smart rule (2, up to 6 below 1)', () => {
    expect(formatTickerPrice({ symbol: 'BTC-USD', type: 'crypto' }, 64321.987, 'USD')).toBe('$64,321.99');
    expect(formatTickerPrice({ symbol: 'SHIB-USD', type: 'crypto' }, 0.0000234567, 'USD')).toBe('$0.000023');
    expect(formatTickerPrice({ symbol: 'DOGE-USD', type: 'crypto' }, 0.1234, 'USD')).toBe('$0.1234');
    expect(autoDecimalsLabel('DOGE-USD', 'crypto', 0.12)).toBe('2–6');
    expect(autoDecimalsLabel('EURUSD=X', 'currency', 1.08)).toBe('4');
  });
});

describe('per-ticker decimals', () => {
  it('fixed decimals 0..8 override auto for price and absolute change', () => {
    for (const d of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
      const p = formatTickerPrice({ symbol: 'EURUSD=X', decimals: d }, 1.084512345, 'USD');
      expect(digitsAfterPoint(p)).toBe(d);
    }
    expect(formatTickerPrice({ symbol: 'AAPL', decimals: 0 }, 187.6, 'USD')).toBe('$188');
    expect(formatTickerPrice({ symbol: 'AAPL', decimals: 3 }, 187.6, 'USD')).toBe('$187.600');
    expect(formatTickerChange({ symbol: 'AAPL', decimals: 3 }, 187.6, 1.23456, 0.6612)).toBe('+1.235 (+0.66%)');
  });
  it('percent change always 2 decimals; forex change uses 4', () => {
    expect(formatTickerChange({ symbol: 'EURUSD=X' }, 1.08, 0.00123, 0.1137)).toBe('+0.0012 (+0.11%)');
    expect(formatTickerChange({ symbol: 'EURUSD=X', decimals: 5 }, 1.08, -0.00123, -0.1137)).toBe('-0.00123 (-0.11%)');
    expect(formatTickerChange({ symbol: 'AAPL' }, 187, 1.5, 0.8)).toBe('+1.50 (+0.80%)');
  });
  it('sanitizeDecimals: integers 0..8 only, else auto', () => {
    expect(sanitizeDecimals(4)).toBe(4);
    expect(sanitizeDecimals('3')).toBe(3);
    expect(sanitizeDecimals(0)).toBe(0);
    for (const bad of [undefined, null, '', 'auto', 'AUTO', -1, 9, 2.5, 'x', NaN]) {
      expect(sanitizeDecimals(bad)).toBeUndefined();
    }
    expect(resolveDecimals('AAPL', 'stock', 10, 9)).toEqual({ min: 2, max: 2 });
  });
});

describe('formatPercentChange (medium dock rows)', () => {
  it('signed, always 2 decimals', () => {
    expect(formatPercentChange(3.0612)).toBe('+3.06%');
    expect(formatPercentChange(-0.5)).toBe('-0.50%');
    expect(formatPercentChange(0)).toBe('+0.00%');
    expect(formatPercentChange(NaN)).toBe('—');
  });
});
