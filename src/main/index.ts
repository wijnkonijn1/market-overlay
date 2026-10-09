import {
  app,
  BrowserWindow,
  globalShortcut,
  screen,
  nativeTheme,
} from 'electron';
import path from 'path';
import {
  registerIpcHandlers,
  setMainWindow,
  getMainWindow,
  applyDockFromSettings,
  isDockApplyInProgress,
  syncCryptoStreamFromState,
} from './ipc';
import { createTray } from './tray';
import {
  loadWindowState,
  attachWindowStateListeners,
  applyAlwaysOnTop,
  applyOpacity,
} from './windowState';
import { get } from './store';
import { clearDockReservation, isApplyingDock } from './dock/workAreaReserve';
import { IPC } from '../shared/ipc';

if (process.platform === 'linux') {
  app.disableHardwareAcceleration();
}

// One overlay process only: two instances would each register an AppBar and
// the reserved work area would stack (much larger than the visible dock).
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = getMainWindow();
    if (w && !w.isDestroyed()) {
      if (w.isMinimized()) w.restore();
      w.show();
      w.focus();
    }
  });
}

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

function resolveIcon(): string | undefined {
  const candidates = [
    path.join(__dirname, '../../build/icons/icon.png'),
    path.join(process.resourcesPath || '', 'icons/icon.png'),
  ];
  for (const p of candidates) {
    try {
      if (require('fs').existsSync(p)) return p;
    } catch { /* next */ }
  }
  return undefined;
}

function createWindow(): BrowserWindow {
  const state = loadWindowState();
  const settings = get('settings');
  const displays = screen.getAllDisplays();
  let x = state.x;
  let y = state.y;
  if (x != null && y != null) {
    const onScreen = displays.some((d) => {
      const b = d.bounds;
      return x! >= b.x && y! >= b.y && x! < b.x + b.width && y! < b.y + b.height;
    });
    if (!onScreen) {
      x = undefined;
      y = undefined;
    }
  }

  const win = new BrowserWindow({
    width: state.width || 420,
    height: state.height || 560,
    x,
    y,
    minWidth: 140,
    minHeight: 140,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    resizable: true,
    alwaysOnTop: settings?.alwaysOnTop ?? true,
    show: false,
    title: 'Market Overlay',
    icon: resolveIcon(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  applyAlwaysOnTop(win, settings?.alwaysOnTop ?? true);
  applyOpacity(win, settings?.transparency ?? 92);
  if (state.isMaximized) win.maximize();

  attachWindowStateListeners(win);
  setMainWindow(win);

  win.once('ready-to-show', async () => {
    win.show();
    // Fire dock apply in background (non-blocking) for faster startup
    applyDockFromSettings(win).catch((err) => {
      console.warn('[dock] background apply failed:', err);
    });
    syncCryptoStreamFromState();
  });

  win.on('close', (e) => {
    const s = get('settings');
    if (!(app as any).isQuitting && s?.minimizeToTray) {
      e.preventDefault();
      win.hide();
    }
  });

  // Re-apply dock after display changes when docked.
  // Skip while we are applying (setBounds would otherwise recurse and can
  // fight user thickness via stale AppBar re-asserts). Debounce moved/resized
  // so OS noise does not thrash; always re-apply TO persisted thickness.
  let reapplyTimer: ReturnType<typeof setTimeout> | null = null;
  const reapplyDock = (source: string) => {
    if (isApplyingDock() || isDockApplyInProgress()) return;
    const s = get('settings');
    if (!s?.dockPosition || s.dockPosition === 'floating') return;
    if (reapplyTimer) clearTimeout(reapplyTimer);
    reapplyTimer = setTimeout(() => {
      reapplyTimer = null;
      if (isApplyingDock() || isDockApplyInProgress()) return;
      console.debug('[dock] reapply from', source);
      void applyDockFromSettings(win);
    }, source === 'display-metrics-changed' ? 50 : 180);
  };
  win.on('moved', () => reapplyDock('moved'));
  win.on('resized', () => reapplyDock('resized'));
  screen.on('display-metrics-changed', () => reapplyDock('display-metrics-changed'));

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  return win;
}

function registerShortcuts(win: BrowserWindow): void {
  const send = (action: string) => {
    if (!win.isDestroyed()) win.webContents.send(IPC.EVENT_SHORTCUT, action);
  };
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    if (ctrl && input.key.toLowerCase() === 'k') {
      event.preventDefault();
      send('add-ticker');
    } else if (ctrl && input.key.toLowerCase() === 'w') {
      event.preventDefault();
      send('close-hide');
    } else if (ctrl && input.key.toLowerCase() === 'r') {
      event.preventDefault();
      send('refresh');
    } else if (ctrl && input.key === ',') {
      event.preventDefault();
      send('settings');
    } else if (input.key === 'Escape') {
      send('escape');
    }
  });
  try {
    globalShortcut.register('CommandOrControl+Shift+K', () => {
      const w = getMainWindow();
      w?.show();
      w?.webContents.send(IPC.EVENT_SHORTCUT, 'add-ticker');
    });
  } catch { /* ignore */ }
}

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;
  nativeTheme.themeSource = 'dark';
  registerIpcHandlers();
  const win = createWindow();
  createTray(getMainWindow);
  registerShortcuts(win);

  const settings = get('settings');
  if (settings?.startWithOS) {
    try {
      app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
    } catch { /* best-effort */ }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else getMainWindow()?.show();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  // Best-effort restore of Windows AppBar / Linux strut before exit
  void clearDockReservation(getMainWindow());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if ((app as any).isQuitting) app.quit();
  }
});

app.on('before-quit', () => {
  (app as any).isQuitting = true;
  void clearDockReservation(getMainWindow());
});
