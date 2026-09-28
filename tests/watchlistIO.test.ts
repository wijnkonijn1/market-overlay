import { describe, it, expect } from 'vitest';
import {
  serializeWatchlistsJson,
  parseWatchlistsJson,
  serializeWatchlistsCsv,
  parseWatchlistsCsv,
  applyWatchlistImport,
} from '../src/shared/watchlistIO';
import type { Watchlist } from '../src/shared/types';

const sample: Watchlist[] = [
  {
    id: 'main',
    name: 'Main',
    tickers: [
      { symbol: 'AAPL', displaySymbol: 'AAPL', name: 'Apple', type: 'stock', exchange: 'NMS' },
      { symbol: 'BTC-USD', displaySymbol: 'BTC', name: 'Bitcoin', type: 'crypto', exchange: 'CCC' },
    ],
  },
  {
    id: 'eu',
    name: 'Europe',
    tickers: [
      { symbol: 'ASML.AS', displaySymbol: 'ASML', name: 'ASML', type: 'stock', exchange: 'AMS' },
    ],
  },
];

describe('watchlistIO', () => {
  it('round-trips JSON', () => {
    const json = serializeWatchlistsJson(sample);
    const parsed = parseWatchlistsJson(json);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].tickers.map((t) => t.symbol)).toEqual(['AAPL', 'BTC-USD']);
  });

  it('round-trips CSV', () => {
    const csv = serializeWatchlistsCsv(sample);
    expect(csv.split('\n')[0]).toContain('watchlist');
    const parsed = parseWatchlistsCsv(csv);
    expect(parsed.find((w) => w.name === 'Europe')?.tickers[0].symbol).toBe('ASML.AS');
  });

  it('merges by watchlist name without duplicates', () => {
    const imported: Watchlist[] = [
      {
        id: 'x',
        name: 'Main',
        tickers: [
          { symbol: 'AAPL', displaySymbol: 'AAPL', type: 'stock' },
          { symbol: 'MSFT', displaySymbol: 'MSFT', type: 'stock' },
        ],
      },
      {
        id: 'y',
        name: 'Crypto',
        tickers: [{ symbol: 'ETH-USD', displaySymbol: 'ETH', type: 'crypto' }],
      },
    ];
    const merged = applyWatchlistImport(sample, imported, 'merge');
    const main = merged.find((w) => w.name === 'Main')!;
    expect(main.tickers.map((t) => t.symbol).sort()).toEqual(['AAPL', 'BTC-USD', 'MSFT']);
    expect(merged.some((w) => w.name === 'Crypto')).toBe(true);
  });

  it('replace swaps lists', () => {
    const imported: Watchlist[] = [
      { id: 'only', name: 'Only', tickers: [{ symbol: 'NVDA', displaySymbol: 'NVDA', type: 'stock' }] },
    ];
    const replaced = applyWatchlistImport(sample, imported, 'replace');
    expect(replaced).toHaveLength(1);
    expect(replaced[0].tickers[0].symbol).toBe('NVDA');
  });
});
