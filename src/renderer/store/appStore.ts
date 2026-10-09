import { create } from 'zustand';
import type {
  PersistedState,
  AppSettings,
  Watchlist,
  TickerItem,
  Alert,
  Quote,
  SparklineData,
  SearchResult,
} from '../../shared/types';
import { createDefaultState, DEFAULT_SETTINGS } from '../../shared/types';
import { displaySymbol, normalizeSymbol } from '../../shared/cryptoMap';
import type { QuotePartialUpdate, CryptoStreamStatus } from '../../shared/ipc';

export type PanelView = 'none' | 'add' | 'settings' | 'alerts' | 'detail';

interface AppStore {
  hydrated: boolean;
  watchlists: Watchlist[];
  activeWatchlistId: string;
  settings: AppSettings;
  alerts: Alert[];
  quotes: Record<string, Quote>;
  sparklines: Record<string, SparklineData>;
  lastUpdated: number | null;
  refreshing: boolean;
  dataUnavailable: boolean;
  selectedSymbol: string | null;
  panel: PanelView;
  searchQuery: string;
  searchResults: SearchResult[];
  searching: boolean;
  cryptoStream: CryptoStreamStatus;
  hydrate: (state: PersistedState) => void;
  persist: () => Promise<void>;
  toPersisted: () => PersistedState;
  activeWatchlist: () => Watchlist | undefined;
  createWatchlist: (name: string) => string;
  setActiveWatchlist: (id: string) => void;
  addTicker: (ticker: TickerItem) => void;
  removeTicker: (symbol: string) => void;
  updateSettings: (partial: Partial<AppSettings>) => void;
  setQuotes: (quotes: Quote[], opts?: { unavailable?: boolean }) => void;
  applyQuotePartial: (update: QuotePartialUpdate) => void;
  setSparkline: (data: SparklineData) => void;
  setRefreshing: (v: boolean) => void;
  setPanel: (panel: PanelView) => void;
  setSelectedSymbol: (symbol: string | null) => void;
  setSearchQuery: (q: string) => void;
  setSearchResults: (r: SearchResult[]) => void;
  setSearching: (v: boolean) => void;
  setCryptoStream: (s: CryptoStreamStatus) => void;
}

function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

async function doPersist(getState: () => AppStore) {
  const api = typeof window !== 'undefined' ? window.marketOverlay : null;
  if (!api?.setState) return;
  const s = getState();
  if (!s.hydrated) return;
  await api.setState(s.toPersisted());
}

export const useAppStore = create<AppStore>((set, get) => ({
  hydrated: false,
  watchlists: createDefaultState().watchlists,
  activeWatchlistId: 'main',
  settings: { ...DEFAULT_SETTINGS },
  alerts: [],
  quotes: {},
  sparklines: {},
  lastUpdated: null,
  refreshing: false,
  dataUnavailable: false,
  selectedSymbol: null,
  panel: 'none',
  searchQuery: '',
  searchResults: [],
  searching: false,
  cryptoStream: { connected: false, streaming: false, symbols: [] },

  hydrate: (state) => {
    set({
      hydrated: true,
      watchlists: state.watchlists?.length ? state.watchlists : createDefaultState().watchlists,
      activeWatchlistId: state.activeWatchlistId || 'main',
      settings: { ...DEFAULT_SETTINGS, ...(state.settings || {}) },
      alerts: state.alerts || [],
      quotes: state.quoteCache || {},
    });
  },

  persist: async () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => void doPersist(get), 200);
  },

  toPersisted: () => {
    const s = get();
    return {
      version: 1,
      watchlists: s.watchlists,
      activeWatchlistId: s.activeWatchlistId,
      settings: s.settings,
      alerts: s.alerts,
      window: createDefaultState().window,
      quoteCache: s.quotes,
    };
  },

  activeWatchlist: () => get().watchlists.find((w) => w.id === get().activeWatchlistId),

  createWatchlist: (name) => {
    const id = uid('wl');
    set((s) => ({
      watchlists: [...s.watchlists, { id, name: name.trim() || 'Watchlist', tickers: [] }],
      activeWatchlistId: id,
    }));
    void get().persist();
    return id;
  },

  setActiveWatchlist: (id) => {
    set({ activeWatchlistId: id });
    void get().persist();
  },

  addTicker: (ticker) => {
    const symbol = normalizeSymbol(ticker.symbol);
    const item: TickerItem = {
      ...ticker,
      symbol,
      displaySymbol: ticker.displaySymbol || displaySymbol(symbol),
    };
    set((s) => ({
      watchlists: s.watchlists.map((w) => {
        if (w.id !== s.activeWatchlistId) return w;
        if (w.tickers.some((t) => t.symbol === item.symbol)) return w;
        return { ...w, tickers: [...w.tickers, item] };
      }),
    }));
    void get().persist();
  },

  removeTicker: (symbol) => {
    set((s) => ({
      watchlists: s.watchlists.map((w) =>
        w.id === s.activeWatchlistId
          ? { ...w, tickers: w.tickers.filter((t) => t.symbol !== symbol) }
          : w
      ),
      selectedSymbol: s.selectedSymbol === symbol ? null : s.selectedSymbol,
    }));
    void get().persist();
  },

  updateSettings: (partial) => {
    set((s) => ({ settings: { ...s.settings, ...partial } }));
    void get().persist();
    const api = window.marketOverlay;
    const next = get().settings;
    if (partial.alwaysOnTop != null) void api?.setAlwaysOnTop(next.alwaysOnTop);
    if (partial.transparency != null) void api?.setOpacity(next.transparency);
    if (partial.startWithOS != null) void api?.setLoginItem(next.startWithOS);
    if (partial.dockPosition != null) void api?.setDock(next.dockPosition);
    if (partial.reserveWorkArea != null) void api?.setDockReserve(next.reserveWorkArea);
    if (partial.dockThickness != null) {
      void api?.setDockThickness?.(next.dockThickness, 'settings').then((applied) => {
        if (typeof applied === 'number' && get().settings.dockThickness === next.dockThickness && applied !== next.dockThickness) {
          set((s) => ({ settings: { ...s.settings, dockThickness: applied } }));
        }
      });
    }
  },

  setQuotes: (quotes, opts) => {
    set((s) => {
      const next = { ...s.quotes };
      for (const q of quotes) next[q.symbol] = q;
      return {
        quotes: next,
        lastUpdated: quotes.length ? Date.now() : s.lastUpdated,
        dataUnavailable: Boolean(opts?.unavailable),
        refreshing: false,
      };
    });
    void get().persist();
  },

  applyQuotePartial: (update) => {
    set((s) => {
      const prev = s.quotes[update.symbol];
      if (!prev) {
        return {
          quotes: {
            ...s.quotes,
            [update.symbol]: {
              symbol: update.symbol,
              price: update.price,
              change: update.change ?? 0,
              changePercent: update.changePercent ?? 0,
              currency: 'USD',
              marketState: 'CRYPTO_24_7',
              delayed: false,
              timestamp: update.timestamp,
              type: 'crypto',
              high24h: update.high24h,
              low24h: update.low24h,
              volume24h: update.volume24h,
            },
          },
          lastUpdated: Date.now(),
        };
      }
      return {
        quotes: {
          ...s.quotes,
          [update.symbol]: {
            ...prev,
            price: update.price,
            change: update.change ?? prev.change,
            changePercent: update.changePercent ?? prev.changePercent,
            high24h: update.high24h ?? prev.high24h,
            low24h: update.low24h ?? prev.low24h,
            volume24h: update.volume24h ?? prev.volume24h,
            timestamp: update.timestamp,
            delayed: false,
          },
        },
        lastUpdated: Date.now(),
      };
    });
  },

  setSparkline: (data) => {
    set((s) => ({
      sparklines: { ...s.sparklines, [`${data.symbol}:${data.timeframe}`]: data },
    }));
  },
  setRefreshing: (v) => set({ refreshing: v }),
  setPanel: (panel) => set({ panel }),
  setSelectedSymbol: (symbol) =>
    set({
      selectedSymbol: symbol,
      panel: symbol ? 'detail' : get().panel === 'detail' ? 'none' : get().panel,
    }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSearchResults: (r) => set({ searchResults: r }),
  setSearching: (v) => set({ searching: v }),
  setCryptoStream: (cryptoStream) => set({ cryptoStream }),
}));
