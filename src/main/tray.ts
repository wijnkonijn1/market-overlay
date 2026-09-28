import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron';
import path from 'path';
import { IPC } from '../shared/ipc';
import { getAll } from './store';

let tray: Tray | null = null;

function loadTrayIcon(): Electron.NativeImage {
  const candidates = [
    path.join(__dirname, '../../build/icons/tray.png'),
    path.join(process.resourcesPath || '', 'icons/tray.png'),
    path.join(__dirname, '../../build/icons/icon.png'),
  ];
  for (const p of candidates) {
    try {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) return img.resize({ width: 16, height: 16 });
    } catch { /* next */ }
  }
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAPElEQVQ4T2NkYGD4z0AAMBFK4P8QOsYG/' +
      'GEaMBoD0AAiDYAa8B8NMBoDiDZgNAYQbcBoDCDagP8wAAD6owQErEfR3QAAAABJRU5ErkJggg==',
    'base64'
  );
  try {
    const img = nativeImage.createFromBuffer(png);
    if (!img.isEmpty()) return img;
  } catch { /* empty */ }
  return nativeImage.createEmpty();
}

export function createTray(getMainWindow: () => BrowserWindow | null): Tray {
  if (tray) return tray;
  tray = new Tray(loadTrayIcon());
  tray.setToolTip('Market Overlay');

  const rebuild = () => {
    const state = getAll();
    const items = state.watchlists.map((wl) => ({
      label: wl.name + (wl.id === state.activeWatchlistId ? ' ✓' : ''),
      click: () => {
        const win = getMainWindow();
        win?.webContents.send(IPC.EVENT_TRAY_ACTION, { type: 'watchlist', id: wl.id } as const);
        win?.show();
      },
    }));
    tray?.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Show', click: () => { const w = getMainWindow(); w?.show(); w?.focus(); } },
        { label: 'Hide', click: () => getMainWindow()?.hide() },
        { type: 'separator' },
        {
          label: 'Refresh',
          click: () => getMainWindow()?.webContents.send(IPC.EVENT_TRAY_ACTION, 'refresh'),
        },
        {
          label: 'Watchlists',
          submenu: items.length ? items : [{ label: '(none)', enabled: false }],
        },
        {
          label: 'Settings',
          click: () => {
            const w = getMainWindow();
            w?.show();
            w?.webContents.send(IPC.EVENT_TRAY_ACTION, 'settings');
          },
        },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => {
            (app as any).isQuitting = true;
            app.quit();
          },
        },
      ])
    );
  };

  rebuild();
  tray.on('click', () => {
    const win = getMainWindow();
    if (!win) return;
    if (win.isVisible()) win.hide();
    else { win.show(); win.focus(); }
  });
  (tray as any).rebuildMenu = rebuild;
  return tray;
}

export function rebuildTrayMenu(): void {
  if (tray && typeof (tray as any).rebuildMenu === 'function') (tray as any).rebuildMenu();
}
