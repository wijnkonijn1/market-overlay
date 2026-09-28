import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type { PersistedState, Timeframe, DockPosition } from '../shared/types';
import type {
  ShortcutAction,
  TrayAction,
  WatchlistExportFormat,
  WatchlistImportMode,
  QuotePartialUpdate,
  CryptoStreamStatus,
  DockState,
} from '../shared/ipc';

const api = {
  minimize: () => ipcRenderer.invoke(IPC.WINDOW_MINIMIZE),
  maximize: () => ipcRenderer.invoke(IPC.WINDOW_MAXIMIZE) as Promise<boolean>,
  close: () => ipcRenderer.invoke(IPC.WINDOW_CLOSE),
  isMaximized: () => ipcRenderer.invoke(IPC.WINDOW_IS_MAXIMIZED) as Promise<boolean>,
  setAlwaysOnTop: (v: boolean) =>
    ipcRenderer.invoke(IPC.WINDOW_SET_ALWAYS_ON_TOP, v) as Promise<boolean>,
  getAlwaysOnTop: () => ipcRenderer.invoke(IPC.WINDOW_GET_ALWAYS_ON_TOP) as Promise<boolean>,
  setOpacity: (percent: number) =>
    ipcRenderer.invoke(IPC.WINDOW_SET_OPACITY, percent) as Promise<number>,
  getBounds: () => ipcRenderer.invoke(IPC.WINDOW_GET_BOUNDS),
  setBounds: (bounds: object) => ipcRenderer.invoke(IPC.WINDOW_SET_BOUNDS, bounds),

  quit: () => ipcRenderer.invoke(IPC.APP_QUIT),
  hide: () => ipcRenderer.invoke(IPC.APP_HIDE),
  show: () => ipcRenderer.invoke(IPC.APP_SHOW),
  setLoginItem: (open: boolean) =>
    ipcRenderer.invoke(IPC.APP_SET_LOGIN_ITEM, open) as Promise<boolean>,
  getLoginItem: () => ipcRenderer.invoke(IPC.APP_GET_LOGIN_ITEM) as Promise<boolean>,
  notify: (title: string, body: string) =>
    ipcRenderer.invoke(IPC.APP_NOTIFY, { title, body }) as Promise<boolean>,

  getState: () => ipcRenderer.invoke(IPC.STORE_GET_ALL) as Promise<PersistedState>,
  setState: (state: PersistedState) => ipcRenderer.invoke(IPC.STORE_SET_ALL, state),
  storeGet: (key: string) => ipcRenderer.invoke(IPC.STORE_GET, key),
  storeSet: (key: string, value: unknown) => ipcRenderer.invoke(IPC.STORE_SET, key, value),

  search: (query: string) => ipcRenderer.invoke(IPC.MARKET_SEARCH, query),
  quote: (symbol: string) => ipcRenderer.invoke(IPC.MARKET_QUOTE, symbol),
  quotes: (symbols: string[]) => ipcRenderer.invoke(IPC.MARKET_QUOTES, symbols),
  history: (symbol: string, timeframe: Timeframe) =>
    ipcRenderer.invoke(IPC.MARKET_HISTORY, symbol, timeframe),
  marketStatus: (symbol: string) => ipcRenderer.invoke(IPC.MARKET_STATUS, symbol),
  nextOpen: (symbol: string, exchange?: string) =>
    ipcRenderer.invoke(IPC.MARKET_NEXT_OPEN, symbol, exchange),

  exportWatchlists: (format: WatchlistExportFormat) =>
    ipcRenderer.invoke(IPC.WATCHLIST_EXPORT, format),
  importWatchlists: (mode: WatchlistImportMode) =>
    ipcRenderer.invoke(IPC.WATCHLIST_IMPORT, mode),

  setDock: (position: DockPosition) => ipcRenderer.invoke(IPC.DOCK_SET, position),
  getDock: () => ipcRenderer.invoke(IPC.DOCK_GET) as Promise<DockState>,
  setDockReserve: (reserve: boolean) => ipcRenderer.invoke(IPC.DOCK_RESERVE, reserve),

  onShortcut: (cb: (action: ShortcutAction) => void) => {
    const handler = (_: Electron.IpcRendererEvent, action: ShortcutAction) => cb(action);
    ipcRenderer.on(IPC.EVENT_SHORTCUT, handler);
    return () => ipcRenderer.removeListener(IPC.EVENT_SHORTCUT, handler);
  },
  onTrayAction: (cb: (action: TrayAction) => void) => {
    const handler = (_: Electron.IpcRendererEvent, action: TrayAction) => cb(action);
    ipcRenderer.on(IPC.EVENT_TRAY_ACTION, handler);
    return () => ipcRenderer.removeListener(IPC.EVENT_TRAY_ACTION, handler);
  },
  onQuoteUpdate: (cb: (update: QuotePartialUpdate) => void) => {
    const handler = (_: Electron.IpcRendererEvent, update: QuotePartialUpdate) => cb(update);
    ipcRenderer.on(IPC.EVENT_QUOTE_UPDATE, handler);
    return () => ipcRenderer.removeListener(IPC.EVENT_QUOTE_UPDATE, handler);
  },
  onStateReload: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on(IPC.EVENT_STATE_RELOAD, handler);
    return () => ipcRenderer.removeListener(IPC.EVENT_STATE_RELOAD, handler);
  },
  onCryptoStreamStatus: (cb: (status: CryptoStreamStatus) => void) => {
    const handler = (_: Electron.IpcRendererEvent, status: CryptoStreamStatus) => cb(status);
    ipcRenderer.on(IPC.EVENT_CRYPTO_STREAM_STATUS, handler);
    return () => ipcRenderer.removeListener(IPC.EVENT_CRYPTO_STREAM_STATUS, handler);
  },
};

contextBridge.exposeInMainWorld('marketOverlay', api);

export type MarketOverlayApi = typeof api;
