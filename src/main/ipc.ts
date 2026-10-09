import {
  ipcMain,
  BrowserWindow,
  shell,
  Notification,
  app,
  dialog,
} from 'electron';
import fs from 'fs/promises';
import { IPC } from '../shared/ipc';
import type {
  WatchlistExportFormat,
  WatchlistImportMode,
  QuotePartialUpdate,
  CryptoStreamStatus,
  DockState,
} from '../shared/ipc';
import type { PersistedState, Timeframe, DockPosition } from '../shared/types';
import * as persist from './store';
import { marketDataService } from './market/CompositeProvider';
import {
  applyAlwaysOnTop,
  applyOpacity,
  getDisplayBoundsForWindow,
} from './windowState';
import { rebuildTrayMenu } from './tray';
import { applyDock, isApplyingDock, type DockApplyResult } from './dock/workAreaReserve';
import { dockLog, getDockLogDir } from './dock/dockLog';
import { cryptoStream } from './market/CryptoStream';
import { getNextOpenTime } from './market/marketHours';
import {
  serializeWatchlistsJson,
  serializeWatchlistsCsv,
  parseWatchlistsJson,
  parseWatchlistsCsv,
  applyWatchlistImport,
} from '../shared/watchlistIO';
import { isCryptoSymbol } from '../shared/cryptoMap';
import { platformDockSupport, clampThickness, DEFAULT_DOCK_THICKNESS } from '../shared/dockBounds';

let mainWindowRef: BrowserWindow | null = null;
let lastDockResult: DockApplyResult | null = null;

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindowRef = win;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindowRef;
}

function send(channel: string, payload?: unknown): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

export function syncCryptoStreamFromState(): void {
  const state = persist.getAll();
  if (!state.settings.cryptoStreaming) {
    cryptoStream.disconnect();
    const status: CryptoStreamStatus = {
      connected: false,
      streaming: false,
      symbols: [],
    };
    send(IPC.EVENT_CRYPTO_STREAM_STATUS, status);
    return;
  }
  const wl = state.watchlists.find((w) => w.id === state.activeWatchlistId);
  const symbols = (wl?.tickers ?? []).map((t) => t.symbol).filter(isCryptoSymbol);
  cryptoStream.setSymbols(symbols);
}

/** Monotonic seq so concurrent thickness applies only keep the latest. */
let dockApplySeq = 0;
let dockApplyChain: Promise<void> = Promise.resolve();

export function isDockApplyInProgress(): boolean {
  return isApplyingDock();
}

/**
 * Apply dock from persisted settings.
 * Concurrent calls are serialized; superseded (older) applies are skipped so a
 * shrink cannot be overwritten by an in-flight larger-thickness AppBar re-assert.
 */
export async function applyDockFromSettings(win?: BrowserWindow | null): Promise<void> {
  const seq = ++dockApplySeq;
  const run = async () => {
    if (seq !== dockApplySeq) return; // newer apply already queued
    const target = win ?? getMainWindow();
    if (!target || target.isDestroyed()) return;
    const settings = persist.get('settings');
    const displayBounds = getDisplayBoundsForWindow(target);
    const position = settings.dockPosition ?? 'floating';
    const thickness = settings.dockThickness ?? DEFAULT_DOCK_THICKNESS;
    const reserve = settings.reserveWorkArea !== false && position !== 'floating';
    const result = await applyDock(target, displayBounds, position, thickness, reserve);
    if (seq !== dockApplySeq) return; // superseded while applying
    lastDockResult = result;
    dockLog('applied', `${result.detail} bounds=${JSON.stringify(target.isDestroyed() ? null : target.getBounds())}`);
  };
  const next = dockApplyChain.then(run, run);
  dockApplyChain = next.catch(() => {});
  await next;
}

/**
 * Single entry point for every thickness change (drag, slider, +/- buttons,
 * numeric input, tray, keyboard shortcut, adopted native resize).
 * Persists, applies, tells the renderer, logs with a source tag.
 */
export async function requestDockThickness(thickness: number, source: string): Promise<number> {
  const before = persist.get('settings').dockThickness;
  const t = clampThickness(Number(thickness));
  dockLog('request', `source=${source} requested=${thickness} clamped=${t} previous=${before}`);
  const settings = { ...persist.get('settings'), dockThickness: t, dockThicknessUserSet: true };
  persist.set('settings', settings);
  await applyDockFromSettings();
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    dockLog('request', `source=${source} done: window=${JSON.stringify(win.getBounds())}`);
  }
  send(IPC.EVENT_DOCK_CHANGED, { thickness: t, position: settings.dockPosition });
  rebuildTrayMenu();
  return t;
}

/** Step the thickness by `delta` px (tray / shortcuts / +- buttons). */
export function stepDockThickness(delta: number, source: string): Promise<number> {
  const cur = persist.get('settings').dockThickness ?? DEFAULT_DOCK_THICKNESS;
  return requestDockThickness(cur + delta, source);
}

export function registerIpcHandlers(): void {
  cryptoStream.setHandlers(
    (update: QuotePartialUpdate) => send(IPC.EVENT_QUOTE_UPDATE, update),
    (status: CryptoStreamStatus) => send(IPC.EVENT_CRYPTO_STREAM_STATUS, status)
  );

  ipcMain.handle(IPC.WINDOW_MINIMIZE, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize();
  });
  ipcMain.handle(IPC.WINDOW_MAXIMIZE, (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });
  ipcMain.handle(IPC.WINDOW_CLOSE, (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const settings = persist.get('settings');
    if (settings?.minimizeToTray) win?.hide();
    else {
      (app as any).isQuitting = true;
      win?.close();
    }
  });
  ipcMain.handle(IPC.WINDOW_IS_MAXIMIZED, (e) =>
    BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false
  );
  ipcMain.handle(IPC.WINDOW_SET_ALWAYS_ON_TOP, (e, value: boolean) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return false;
    return applyAlwaysOnTop(win, value);
  });
  ipcMain.handle(IPC.WINDOW_GET_ALWAYS_ON_TOP, (e) =>
    BrowserWindow.fromWebContents(e.sender)?.isAlwaysOnTop() ?? false
  );
  ipcMain.handle(IPC.WINDOW_SET_OPACITY, (e, percent: number) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return 1;
    return applyOpacity(win, percent);
  });
  ipcMain.handle(IPC.WINDOW_GET_BOUNDS, (e) =>
    BrowserWindow.fromWebContents(e.sender)?.getBounds()
  );
  ipcMain.handle(IPC.WINDOW_SET_BOUNDS, (e, bounds) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win && bounds) win.setBounds(bounds);
  });

  ipcMain.handle(IPC.APP_QUIT, () => {
    (app as any).isQuitting = true;
    app.quit();
  });
  ipcMain.handle(IPC.APP_HIDE, (e) => BrowserWindow.fromWebContents(e.sender)?.hide());
  ipcMain.handle(IPC.APP_SHOW, (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    win?.show();
    win?.focus();
  });
  ipcMain.handle(IPC.APP_SET_LOGIN_ITEM, (_e, openAtLogin: boolean) => {
    try {
      app.setLoginItemSettings({ openAtLogin: Boolean(openAtLogin), path: process.execPath });
      return app.getLoginItemSettings().openAtLogin;
    } catch {
      return false;
    }
  });
  ipcMain.handle(IPC.APP_GET_LOGIN_ITEM, () => {
    try {
      return app.getLoginItemSettings().openAtLogin;
    } catch {
      return false;
    }
  });
  ipcMain.handle(IPC.APP_GET_VERSION, () => app.getVersion());
  ipcMain.handle(IPC.APP_OPEN_LOG_FOLDER, () => openDockLogFolder());
  ipcMain.on?.(IPC.DOCK_UI_LOG, (_e, msg: string) => dockLog('ui', String(msg).slice(0, 500)));
  ipcMain.handle(IPC.APP_NOTIFY, (_e, payload: { title: string; body: string }) => {
    if (!Notification.isSupported()) return false;
    new Notification({
      title: payload.title || 'Market Overlay',
      body: payload.body || '',
    }).show();
    return true;
  });

  ipcMain.handle(IPC.STORE_GET_ALL, () => persist.getAll());
  ipcMain.handle(IPC.STORE_SET_ALL, async (_e, state: PersistedState) => {
    // Dock fields + window bounds are main-owned; a (debounced, possibly stale)
    // renderer snapshot must never re-apply an old thickness.
    persist.setAllFromRenderer(state);
    rebuildTrayMenu();
    syncCryptoStreamFromState();
  });
  ipcMain.handle(IPC.STORE_GET, (_e, key: keyof PersistedState) => persist.get(key));
  ipcMain.handle(IPC.STORE_SET, async (_e, key: keyof PersistedState, value: unknown) => {
    if (key === 'settings') persist.mergeSettingsFromRenderer(value as PersistedState['settings']);
    else if (key !== 'window') persist.set(key, value as never);
    if (key === 'watchlists' || key === 'activeWatchlistId') {
      rebuildTrayMenu();
      syncCryptoStreamFromState();
    }
    if (key === 'settings') {
      syncCryptoStreamFromState();
    }
  });

  ipcMain.handle(IPC.MARKET_SEARCH, async (_e, query: string) => marketDataService.search(query));
  ipcMain.handle(IPC.MARKET_QUOTE, async (_e, symbol: string) => marketDataService.getQuote(symbol));
  ipcMain.handle(IPC.MARKET_QUOTES, async (_e, symbols: string[]) =>
    marketDataService.getQuotes(symbols)
  );
  ipcMain.handle(IPC.MARKET_HISTORY, async (_e, symbol: string, timeframe: Timeframe) =>
    marketDataService.getHistory(symbol, timeframe)
  );
  ipcMain.handle(IPC.MARKET_STATUS, async (_e, symbol: string) =>
    marketDataService.getMarketStatus(symbol)
  );
  ipcMain.handle(IPC.MARKET_NEXT_OPEN, async (_e, symbol: string, exchange?: string) =>
    getNextOpenTime(symbol, exchange)
  );

  ipcMain.handle(IPC.DOCK_SET, async (_e, position: DockPosition) => {
    // Keep the stored thickness: deriving it from the (floating) window size
    // made the dock open at the floating width (420+).
    const settings = { ...persist.get('settings'), dockPosition: position };
    persist.set('settings', settings);
    await applyDockFromSettings();
    return settings;
  });
  ipcMain.handle(IPC.DOCK_GET, (): DockState => {
    const s = persist.get('settings');
    return {
      position: s.dockPosition,
      reserveWorkArea: s.reserveWorkArea,
      thickness: s.dockThickness,
      workAreaReserved: lastDockResult?.workAreaReserved ?? false,
      platformSupport: platformDockSupport(),
    };
  });
  ipcMain.handle(IPC.DOCK_RESERVE, async (_e, reserve: boolean) => {
    const settings = { ...persist.get('settings'), reserveWorkArea: Boolean(reserve) };
    persist.set('settings', settings);
    await applyDockFromSettings();
    return settings;
  });
  ipcMain.handle(IPC.DOCK_SET_THICKNESS, async (_e, thickness: number, source?: string) =>
    requestDockThickness(Number(thickness), `renderer:${source || 'ui'}`)
  );

  ipcMain.handle(IPC.WATCHLIST_EXPORT, async (e, format: WatchlistExportFormat) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const state = persist.getAll();
    const result = await dialog.showSaveDialog(win!, {
      title: 'Export watchlists',
      defaultPath: format === 'json' ? 'watchlists.json' : 'watchlists.csv',
      filters:
        format === 'json'
          ? [{ name: 'JSON', extensions: ['json'] }]
          : [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    const content =
      format === 'json'
        ? serializeWatchlistsJson(state.watchlists)
        : serializeWatchlistsCsv(state.watchlists);
    await fs.writeFile(result.filePath, content, 'utf8');
    return { ok: true, path: result.filePath };
  });

  ipcMain.handle(IPC.WATCHLIST_IMPORT, async (e, mode: WatchlistImportMode) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const result = await dialog.showOpenDialog(win!, {
      title: 'Import watchlists',
      filters: [
        { name: 'Watchlist files', extensions: ['json', 'csv'] },
        { name: 'All files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths?.[0]) return { ok: false, canceled: true };
    const filePath = result.filePaths[0];
    const text = await fs.readFile(filePath, 'utf8');
    const imported = filePath.toLowerCase().endsWith('.csv')
      ? parseWatchlistsCsv(text)
      : parseWatchlistsJson(text);
    const state = persist.getAll();
    const watchlists = applyWatchlistImport(
      state.watchlists,
      imported,
      mode === 'replace' ? 'replace' : 'merge'
    );
    const activeWatchlistId = watchlists.some((w) => w.id === state.activeWatchlistId)
      ? state.activeWatchlistId
      : watchlists[0].id;
    persist.setAll({ ...state, watchlists, activeWatchlistId });
    rebuildTrayMenu();
    syncCryptoStreamFromState();
    send(IPC.EVENT_STATE_RELOAD);
    return { ok: true, count: watchlists.length };
  });
}

/** Open <userData>/logs in Explorer/Finder (creates it if needed). */
export async function openDockLogFolder(): Promise<string | null> {
  const dir = getDockLogDir();
  if (!dir) return null;
  try {
    await fs.mkdir(dir, { recursive: true });
    dockLog('ui', 'open log folder');
    await shell.openPath(dir);
  } catch { /* ignore */ }
  return dir;
}
