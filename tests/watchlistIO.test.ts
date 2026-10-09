import { describe, it, expect } from 'vitest';
import * as io from '../src/shared/watchlistIO';
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

describe('per-ticker decimals in import/export (v1.1.9)', () => {
  const lists = [
    {
      id: 'main',
      name: 'Main',
      tickers: [
        { symbol: 'EURUSD=X', displaySymbol: 'EUR/USD', name: 'Euro, "quoted"', type: 'currency' as const, decimals: 4 },
        { symbol: 'AAPL', displaySymbol: 'AAPL', type: 'stock' as const },
        { symbol: 'BTC-USD', displaySymbol: 'BTC', type: 'crypto' as const, decimals: 0 },
      ],
    },
  ];
  it('JSON round-trip keeps decimals (incl. 0) and auto stays absent', () => {
    const back = io.parseWatchlistsJson(io.serializeWatchlistsJson(lists));
    expect(back[0].tickers.map((t) => t.decimals)).toEqual([4, undefined, 0]);
    expect('decimals' in back[0].tickers[1]).toBe(false);
  });
  it('CSV round-trip keeps decimals; empty column = auto', () => {
    const csv = io.serializeWatchlistsCsv(lists);
    expect(csv.split('\n')[0]).toBe('watchlist,symbol,displaySymbol,name,type,exchange,decimals');
    expect(csv).toMatch(/EURUSD=X.*,4\n/);
    const back = io.parseWatchlistsCsv(csv);
    expect(back[0].tickers.map((t) => t.decimals)).toEqual([4, undefined, 0]);
  });
  it('old CSV without decimals column / old JSON without field → auto', () => {
    const oldCsv = 'watchlist,symbol,displaySymbol,name,type,exchange\nMain,EURUSD=X,EUR/USD,,currency,\n';
    expect(io.parseWatchlistsCsv(oldCsv)[0].tickers[0].decimals).toBeUndefined();
    const oldJson = JSON.stringify({ version: 1, watchlists: [{ name: 'A', tickers: [{ symbol: 'AAPL', type: 'stock' }] }] });
    expect(io.parseWatchlistsJson(oldJson)[0].tickers[0].decimals).toBeUndefined();
  });
  it('header-less CSV: 7th column is decimals; invalid values → auto', () => {
    const csv = 'Main,EURUSD=X,EUR/USD,,currency,,5\nMain,AAPL,AAPL,,stock,,12\nMain,MSFT,MSFT,,stock,,auto\n';
    expect(io.parseWatchlistsCsv(csv)[0].tickers.map((t) => t.decimals)).toEqual([5, undefined, undefined]);
  });
  it('header order is respected (decimals column moved)', () => {
    const csv = 'watchlist,symbol,decimals,displaySymbol,name,type,exchange\nMain,EURUSD=X,3,EUR/USD,,currency,\n';
    const t = io.parseWatchlistsCsv(csv)[0].tickers[0];
    expect(t.decimals).toBe(3);
    expect(t.displaySymbol).toBe('EUR/USD');
    expect(t.type).toBe('currency');
  });
});
