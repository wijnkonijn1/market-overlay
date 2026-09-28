/**
 * Binance public ticker WebSocket for crypto watchlist symbols.
 * No API key. Reconnects with exponential backoff.
 */
import WebSocket from 'ws';
import {
  toBinanceStreamSymbol,
  fromBinanceStreamSymbol,
  isCryptoSymbol,
} from '../../shared/cryptoMap';
import type { QuotePartialUpdate } from '../../shared/ipc';

export interface BinanceTickerPayload {
  e?: string;
  s?: string;
  c?: string;
  P?: string;
  p?: string;
  h?: string;
  l?: string;
  v?: string;
  q?: string;
}

export type QuoteUpdateHandler = (update: QuotePartialUpdate) => void;
export type StatusHandler = (status: {
  connected: boolean;
  streaming: boolean;
  symbols: string[];
  lastError?: string;
}) => void;

/** Merge a live stream tick into cached quote fields (pure). */
export function mergeStreamIntoQuote(
  existing: {
    price: number;
    change?: number;
    changePercent?: number;
    previousClose?: number;
    high24h?: number;
    low24h?: number;
    volume24h?: number;
  },
  update: QuotePartialUpdate
): {
  price: number;
  change: number;
  changePercent: number;
  high24h?: number;
  low24h?: number;
  volume24h?: number;
  timestamp: number;
} {
  const price = update.price;
  let change = update.change;
  let changePercent = update.changePercent;

  if (change == null || changePercent == null) {
    if (existing.previousClose != null && existing.previousClose !== 0) {
      change = price - existing.previousClose;
      changePercent = (change / existing.previousClose) * 100;
    } else {
      change = change ?? existing.change ?? 0;
      changePercent = changePercent ?? existing.changePercent ?? 0;
    }
  }

  return {
    price,
    change: change ?? 0,
    changePercent: changePercent ?? 0,
    high24h: update.high24h ?? existing.high24h,
    low24h: update.low24h ?? existing.low24h,
    volume24h: update.volume24h ?? existing.volume24h,
    timestamp: update.timestamp,
  };
}

export function parseBinanceTicker(
  data: BinanceTickerPayload,
  yahooSymbol: string
): QuotePartialUpdate | null {
  const price = data.c != null ? Number(data.c) : NaN;
  if (!Number.isFinite(price)) return null;
  const changePercent = data.P != null ? Number(data.P) : undefined;
  const change = data.p != null ? Number(data.p) : undefined;
  return {
    symbol: yahooSymbol,
    price,
    change: Number.isFinite(change as number) ? change : undefined,
    changePercent: Number.isFinite(changePercent as number) ? changePercent : undefined,
    high24h: data.h != null && Number.isFinite(Number(data.h)) ? Number(data.h) : undefined,
    low24h: data.l != null && Number.isFinite(Number(data.l)) ? Number(data.l) : undefined,
    volume24h: data.q != null && Number.isFinite(Number(data.q)) ? Number(data.q) : undefined,
    timestamp: Date.now(),
    source: 'binance-ws',
  };
}

export class CryptoStream {
  private ws: WebSocket | null = null;
  private yahooSymbols: string[] = [];
  private streamToYahoo = new Map<string, string>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private connected = false;
  private onUpdate: QuoteUpdateHandler | null = null;
  private onStatus: StatusHandler | null = null;
  private lastError?: string;

  setHandlers(onUpdate: QuoteUpdateHandler, onStatus?: StatusHandler): void {
    this.onUpdate = onUpdate;
    this.onStatus = onStatus ?? null;
  }

  setSymbols(symbols: string[]): void {
    const crypto = [...new Set(symbols.filter(isCryptoSymbol).map((s) => s.toUpperCase()))].sort();
    const same =
      crypto.length === this.yahooSymbols.length &&
      crypto.every((s, i) => s === this.yahooSymbols[i]);
    if (same && this.ws && this.connected) return;

    this.yahooSymbols = crypto;
    this.streamToYahoo.clear();
    for (const y of crypto) {
      const binance = toBinanceStreamSymbol(y);
      if (binance) this.streamToYahoo.set(binance, y);
    }

    this.reconnectAttempt = 0;
    this.disconnect();
    if (this.streamToYahoo.size) this.connect();
    else this.emitStatus();
  }

  getSymbols(): string[] {
    return [...this.yahooSymbols];
  }

  isConnected(): boolean {
    return this.connected;
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch { /* ignore */ }
      this.ws = null;
    }
    this.connected = false;
    this.intentionalClose = false;
  }

  private connect(): void {
    if (!this.streamToYahoo.size) return;
    const streams = [...this.streamToYahoo.keys()].map((s) => `${s}@ticker`).join('/');
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    this.intentionalClose = false;
    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.scheduleReconnect();
      this.emitStatus();
      return;
    }

    this.ws.on('open', () => {
      this.connected = true;
      this.reconnectAttempt = 0;
      this.lastError = undefined;
      this.emitStatus();
    });

    this.ws.on('message', (buf) => {
      try {
        const msg = JSON.parse(buf.toString()) as { stream?: string; data?: BinanceTickerPayload };
        const data = msg.data ?? (msg as unknown as BinanceTickerPayload);
        const binanceSym = (data.s || msg.stream?.split('@')[0] || '').toLowerCase();
        const yahoo =
          this.streamToYahoo.get(binanceSym) || fromBinanceStreamSymbol(binanceSym) || null;
        if (!yahoo || !data) return;
        const update = parseBinanceTicker(data, yahoo);
        if (update && this.onUpdate) this.onUpdate(update);
      } catch { /* ignore malformed */ }
    });

    this.ws.on('error', (err) => {
      this.lastError = err.message || 'stream error';
    });

    this.ws.on('close', () => {
      this.connected = false;
      this.ws = null;
      this.emitStatus();
      if (!this.intentionalClose && this.streamToYahoo.size) this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(30_000, 500 * Math.pow(2, this.reconnectAttempt));
    this.reconnectAttempt = Math.min(8, this.reconnectAttempt + 1);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private emitStatus(): void {
    this.onStatus?.({
      connected: this.connected,
      streaming: this.yahooSymbols.length > 0,
      symbols: [...this.yahooSymbols],
      lastError: this.lastError,
    });
  }
}

export const cryptoStream = new CryptoStream();
