/**
 * Pure serialize/parse helpers for watchlist JSON/CSV import/export.
 */
import type { Watchlist, TickerItem, AssetType } from './types';
import { sanitizeDecimals } from './priceFormat';

export const WATCHLIST_IO_VERSION = 1;

export interface WatchlistExportPayload {
  version: number;
  exportedAt: string;
  watchlists: Watchlist[];
}

export type ImportMode = 'merge' | 'replace';

const ASSET_TYPES: AssetType[] = ['stock', 'etf', 'index', 'crypto', 'currency', 'other'];

function uid(prefix = 'wl'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeTicker(
  raw: Omit<Partial<TickerItem>, 'decimals'> & { symbol?: string; decimals?: unknown }
): TickerItem | null {
  const symbol = (raw.symbol || '').trim();
  if (!symbol) return null;
  const type = ASSET_TYPES.includes(raw.type as AssetType) ? (raw.type as AssetType) : 'other';
  const t: TickerItem = {
    symbol,
    displaySymbol: (raw.displaySymbol || symbol).trim() || symbol,
    name: raw.name?.trim() || undefined,
    type,
    exchange: raw.exchange?.trim() || undefined,
  };
  const decimals = sanitizeDecimals(raw.decimals);
  if (decimals !== undefined) t.decimals = decimals; // missing/invalid = automatic
  return t;
}

function sanitizeWatchlist(raw: Partial<Watchlist>): Watchlist | null {
  const name = (raw.name || '').trim() || 'Watchlist';
  const tickers = Array.isArray(raw.tickers)
    ? raw.tickers.map(sanitizeTicker).filter((t): t is TickerItem => Boolean(t))
    : [];
  const seen = new Set<string>();
  const unique: TickerItem[] = [];
  for (const t of tickers) {
    if (seen.has(t.symbol)) continue;
    seen.add(t.symbol);
    unique.push(t);
  }
  return {
    id: (raw.id || '').trim() || uid('wl'),
    name,
    tickers: unique,
  };
}

export function serializeWatchlistsJson(watchlists: Watchlist[], exportedAt = new Date()): string {
  const payload: WatchlistExportPayload = {
    version: WATCHLIST_IO_VERSION,
    exportedAt: exportedAt.toISOString(),
    watchlists: watchlists.map((w) => ({
      id: w.id,
      name: w.name,
      tickers: w.tickers.map((t) => ({ ...t })),
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export function parseWatchlistsJson(text: string): Watchlist[] {
  const data = JSON.parse(text) as WatchlistExportPayload | Watchlist[];
  let lists: unknown[];
  if (Array.isArray(data)) {
    lists = data;
  } else if (data && Array.isArray((data as WatchlistExportPayload).watchlists)) {
    lists = (data as WatchlistExportPayload).watchlists;
  } else {
    throw new Error('Invalid watchlist JSON: expected { watchlists: [...] } or an array');
  }
  const out = lists
    .map((w) => sanitizeWatchlist(w as Partial<Watchlist>))
    .filter((w): w is Watchlist => Boolean(w));
  if (!out.length) throw new Error('No watchlists found in JSON');
  return out;
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function csvUnescape(value: string): string {
  const v = value.trim();
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1).replace(/""/g, '"');
  return v;
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { fields.push(cur); cur = ''; }
    else cur += ch;
  }
  fields.push(cur);
  return fields;
}

export function serializeWatchlistsCsv(watchlists: Watchlist[]): string {
  const rows = ['watchlist,symbol,displaySymbol,name,type,exchange,decimals'];
  for (const wl of watchlists) {
    for (const t of wl.tickers) {
      rows.push(
        [
          csvEscape(wl.name),
          csvEscape(t.symbol),
          csvEscape(t.displaySymbol),
          csvEscape(t.name || ''),
          csvEscape(t.type),
          csvEscape(t.exchange || ''),
          t.decimals === undefined ? '' : String(t.decimals), // empty = auto
        ].join(',')
      );
    }
  }
  return rows.join('\n') + '\n';
}

export function parseWatchlistsCsv(text: string): Watchlist[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  if (!lines.length) throw new Error('Empty CSV');
  const headerFields = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const hasHeader = headerFields[0] === 'watchlist';
  const dataLines = hasHeader ? lines.slice(1) : lines;
  // Column positions from the header when present (older files have no "decimals").
  const col = (name: string, fallback: number) => {
    if (!hasHeader) return fallback;
    const i = headerFields.indexOf(name.toLowerCase());
    return i;
  };
  const cDecimals = col('decimals', 6);
  // Legacy files always had the fixed order; use header positions when present.
  const pos = (name: string, fallback: number) => {
    const i = col(name, fallback);
    return i >= 0 ? i : hasHeader ? -1 : fallback;
  };
  const cWl = pos('watchlist', 0);
  const cSym = pos('symbol', 1);
  const cDisp = pos('displaysymbol', 2);
  const cName = pos('name', 3);
  const cType = pos('type', 4);
  const cExch = pos('exchange', 5);
  const at = (cols: string[], i: number) => (i >= 0 ? cols[i] : undefined);
  const byName = new Map<string, Watchlist>();

  for (const line of dataLines) {
    const cols = splitCsvLine(line).map(csvUnescape);
    const watchlistName = (at(cols, cWl) || 'Imported').trim() || 'Imported';
    const symbol = (at(cols, cSym) || '').trim();
    if (!symbol) continue;
    const ticker = sanitizeTicker({
      symbol,
      displaySymbol: at(cols, cDisp) || symbol,
      name: at(cols, cName) || undefined,
      type: (at(cols, cType) as AssetType) || 'other',
      exchange: at(cols, cExch) || undefined,
      decimals: at(cols, cDecimals),
    });
    if (!ticker) continue;
    let wl = byName.get(watchlistName);
    if (!wl) {
      wl = { id: uid('wl'), name: watchlistName, tickers: [] };
      byName.set(watchlistName, wl);
    }
    if (!wl.tickers.some((t) => t.symbol === ticker.symbol)) wl.tickers.push(ticker);
  }
  const out = [...byName.values()];
  if (!out.length) throw new Error('No tickers found in CSV');
  return out;
}

export function applyWatchlistImport(
  existing: Watchlist[],
  imported: Watchlist[],
  mode: ImportMode
): Watchlist[] {
  if (mode === 'replace') {
    const replaced = imported.map((w) => ({
      ...w,
      id: w.id || uid('wl'),
      tickers: w.tickers.map((t) => ({ ...t })),
    }));
    return replaced.length ? replaced : [{ id: 'main', name: 'Main', tickers: [] }];
  }

  const result = existing.map((w) => ({
    ...w,
    tickers: w.tickers.map((t) => ({ ...t })),
  }));
  const byName = new Map(result.map((w) => [w.name.toLowerCase(), w]));

  for (const imp of imported) {
    const key = imp.name.toLowerCase();
    const target = byName.get(key);
    if (!target) {
      const created: Watchlist = {
        id: uid('wl'),
        name: imp.name,
        tickers: imp.tickers.map((t) => ({ ...t })),
      };
      result.push(created);
      byName.set(key, created);
      continue;
    }
    for (const t of imp.tickers) {
      if (!target.tickers.some((x) => x.symbol === t.symbol)) {
        target.tickers.push({ ...t });
      }
    }
  }
  return result;
}
