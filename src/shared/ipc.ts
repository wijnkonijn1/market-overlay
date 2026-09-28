/** IPC channel names shared between main and renderer */

export const IPC = {
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:isMaximized',
  WINDOW_SET_ALWAYS_ON_TOP: 'window:setAlwaysOnTop',
  WINDOW_GET_ALWAYS_ON_TOP: 'window:getAlwaysOnTop',
  WINDOW_SET_OPACITY: 'window:setOpacity',
  WINDOW_GET_BOUNDS: 'window:getBounds',
  WINDOW_SET_BOUNDS: 'window:setBounds',

  APP_QUIT: 'app:quit',
  APP_HIDE: 'app:hide',
  APP_SHOW: 'app:show',
  APP_SET_LOGIN_ITEM: 'app:setLoginItem',
  APP_GET_LOGIN_ITEM: 'app:getLoginItem',
  APP_NOTIFY: 'app:notify',

  STORE_GET: 'store:get',
  STORE_SET: 'store:set',
  STORE_GET_ALL: 'store:getAll',
  STORE_SET_ALL: 'store:setAll',

  MARKET_SEARCH: 'market:search',
  MARKET_QUOTE: 'market:quote',
  MARKET_QUOTES: 'market:quotes',
  MARKET_HISTORY: 'market:history',
  MARKET_STATUS: 'market:status',
  MARKET_NEXT_OPEN: 'market:nextOpen',

  WATCHLIST_EXPORT: 'watchlist:export',
  WATCHLIST_IMPORT: 'watchlist:import',

  DOCK_SET: 'dock:set',
  DOCK_GET: 'dock:get',
  DOCK_RESERVE: 'dock:reserve',

  EVENT_SHORTCUT: 'event:shortcut',
  EVENT_TRAY_ACTION: 'event:trayAction',
  EVENT_WATCHLIST_SWITCH: 'event:watchlistSwitch',
  EVENT_QUOTE_UPDATE: 'event:quoteUpdate',
  EVENT_STATE_RELOAD: 'event:stateReload',
  EVENT_CRYPTO_STREAM_STATUS: 'event:cryptoStreamStatus',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

export type ShortcutAction =
  | 'add-ticker'
  | 'close-hide'
  | 'refresh'
  | 'settings'
  | 'escape';

export type TrayAction =
  | 'show'
  | 'hide'
  | 'refresh'
  | 'settings'
  | 'quit'
  | { type: 'watchlist'; id: string };

export type WatchlistExportFormat = 'json' | 'csv';
export type WatchlistImportMode = 'merge' | 'replace';

export interface QuotePartialUpdate {
  symbol: string;
  price: number;
  change?: number;
  changePercent?: number;
  high24h?: number;
  low24h?: number;
  volume24h?: number;
  timestamp: number;
  source: 'binance-ws';
}

export interface CryptoStreamStatus {
  connected: boolean;
  streaming: boolean;
  symbols: string[];
  lastError?: string;
}

export interface DockState {
  position: import('./types').DockPosition;
  reserveWorkArea: boolean;
  thickness: number;
  workAreaReserved: boolean;
  platformSupport: 'strut' | 'appbar' | 'snap-only' | 'none';
}
