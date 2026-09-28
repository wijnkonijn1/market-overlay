import { describe, it, expect } from 'vitest';
import * as crypto from '../src/shared/cryptoMap';
import * as stream from '../src/main/market/CryptoStream';

describe('cryptoMap', () => {
  it('normalizes and displays crypto', () => {
    expect(crypto.normalizeSymbol('btc')).toBe('BTC-USD');
    expect(crypto.displaySymbol('BTC-USD')).toBe('BTC');
    expect(crypto.isCryptoSymbol('ETH-USD')).toBe(true);
    expect(crypto.isCryptoSymbol('AAPL')).toBe(false);
  });

  it('maps binance stream symbols', () => {
    expect(crypto.toBinanceStreamSymbol('BTC-USD')).toBe('btcusdt');
    expect(crypto.fromBinanceStreamSymbol('ethusdt')).toMatch(/ETH/);
  });
});

describe('crypto stream merge', () => {
  it('parses and merges ticker', () => {
    const update = stream.parseBinanceTicker(
      { c: '65000.5', P: '1.5', p: '960', h: '66000', l: '64000', q: '1e9' },
      'BTC-USD'
    )!;
    expect(update.price).toBeCloseTo(65000.5);
    expect(update.source).toBe('binance-ws');
    const merged = stream.mergeStreamIntoQuote({ price: 64000, previousClose: 64040 }, update);
    expect(merged.price).toBeCloseTo(65000.5);
  });
});
