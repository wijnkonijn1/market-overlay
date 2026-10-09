/** Shared types used by main and renderer */

export type AssetType = 'stock' | 'etf' | 'index' | 'crypto' | 'currency' | 'other';

export type MarketState = 'REGULAR' | 'PRE' | 'POST' | 'CLOSED' | 'CRYPTO_24_7' | 'UNKNOWN';

export type Timeframe = '1D' | '5D' | '1M' | '3M' | '6M' | '1Y' | '5Y';

export type RefreshInterval = 5 | 10 | 30 | 60 | 300 | 900 | 0; // 0 = manual

export type Theme = 'dark' | 'light' | 'transparent';

export type LayoutMode = 'compact' | 'detailed';

export type DisplayCurrency = 'native' | 'USD' | 'EUR' | 'GBP';

export type DockPosition = 'floating' | 'left' | 'right' | 'top' | 'bottom';

export interface SearchResult {
  symbol: string;
  name: string;
  type: AssetType;
  exchange?: string;
  currency?: string;
}

export interface Quote {
  symbol: string;
  name?: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  previousClose?: number;
  dayHigh?: number;
  dayLow?: number;
  volume?: number;
  marketCap?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  volume24h?: number;
  high24h?: number;
  low24h?: number;
  marketState: MarketState;
  delayed: boolean;
  delayMinutes?: number;
  timestamp: number;
  type: AssetType;
  exchange?: string;
  nextOpenLabel?: string;
  nextOpenAt?: number;
}

export interface HistoricalPoint {
  date: number;
  close: number;
}

export interface SparklineData {
  symbol: string;
  timeframe: Timeframe;
  points: HistoricalPoint[];
}

export interface TickerItem {
  symbol: string;
  displaySymbol: string;
  name?: string;
  type: AssetType;
  exchange?: string;
}

export interface Watchlist {
  id: string;
  name: string;
  tickers: TickerItem[];
}

export type AlertCondition = 'price_above' | 'price_below' | 'pct_above' | 'pct_below';

export interface Alert {
  id: string;
  symbol: string;
  condition: AlertCondition;
  threshold: number;
  enabled: boolean;
  triggered: boolean;
  lastFiredAt?: number;
}

export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized?: boolean;
}

export interface AppSettings {
  transparency: number;
  alwaysOnTop: boolean;
  refreshInterval: RefreshInterval;
  showCharts: boolean;
  showPercent: boolean;
  showAbsolute: boolean;
  layout: LayoutMode;
  fontSize: number;
  theme: Theme;
  displayCurrency: DisplayCurrency;
  defaultWatchlistId: string;
  minimizeToTray: boolean;
  startWithOS: boolean;
  chartTimeframe: Timeframe;
  /** Prefer Binance public WebSocket for crypto mid prices */
  cryptoStreaming: boolean;
  /** Dock position; floating = undocked */
  dockPosition: DockPosition;
  /** Shrink usable work area when docked (taskbar-like). Platform-dependent. */
  reserveWorkArea: boolean;
  /** Dock strip thickness in px (width for L/R, height for T/B) */
  dockThickness: number;
  /** True once the user changed thickness (drag or slider). Used for default migration. */
  dockThicknessUserSet?: boolean;
  /** Settings schema marker for one-time migrations (2 = default thickness 210). */
  settingsSchema?: number;
}

export interface PersistedState {
  version: number;
  watchlists: Watchlist[];
  activeWatchlistId: string;
  settings: AppSettings;
  alerts: Alert[];
  window: WindowState;
  quoteCache?: Record<string, Quote>;
}

export const DEFAULT_SETTINGS: AppSettings = {
  transparency: 92,
  alwaysOnTop: true,
  refreshInterval: 30,
  showCharts: true,
  showPercent: true,
  showAbsolute: true,
  layout: 'detailed',
  fontSize: 13,
  theme: 'dark',
  displayCurrency: 'native',
  defaultWatchlistId: 'main',
  minimizeToTray: true,
  startWithOS: false,
  chartTimeframe: '1D',
  cryptoStreaming: true,
  dockPosition: 'floating',
  reserveWorkArea: true,
  dockThickness: 210,
  dockThicknessUserSet: false,
  settingsSchema: 2,
};

export const DEFAULT_WINDOW: WindowState = {
  width: 420,
  height: 560,
};

export function createDefaultState(): PersistedState {
  return {
    version: 1,
    watchlists: [{ id: 'main', name: 'Main', tickers: [] }],
    activeWatchlistId: 'main',
    settings: { ...DEFAULT_SETTINGS },
    alerts: [],
    window: { ...DEFAULT_WINDOW },
    quoteCache: {},
  };
}
