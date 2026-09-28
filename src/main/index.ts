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
import { clearDockReservation } from './dock/workAreaReserve';
import { IPC } from '../shared/ipc';

if (process.platform === 'linux') {
  app.disableHardwareAcceleration();
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
    minWidth: 280,
    minHeight: 200,
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
    await applyDockFromSettings(win);
    syncCryptoStreamFromState();
  });

  win.on('close', (e) => {
    const s = get('settings');
    if (!(app as any).isQuitting && s?.minimizeToTray) {
      e.preventDefault();
      win.hide();
    }
  });

  // Re-apply dock after display changes / resize when docked
  const reapplyDock = () => {
    const s = get('settings');
    if (s?.dockPosition && s.dockPosition !== 'floating') {
      void applyDockFromSettings(win);
    }
  };
  win.on('moved', reapplyDock);
  win.on('resized', reapplyDock);
  screen.on('display-metrics-changed', reapplyDock);

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
