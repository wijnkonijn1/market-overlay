/**
 * Integration-style regression for "dock grows back after shrinking" (v1.1.7).
 *
 * Wires the REAL main-process pieces (ipc handlers, store merge rules,
 * applyDock, Windows AppBar path, reapply listeners) against a mocked Electron:
 * fake BrowserWindow (EventEmitter, emits resized/moved on setBounds), fake
 * screen (125% scale), fake electron-store and an injected fake shell32/user32.
 * The renderer is simulated: drag IPC burst, stale debounced full-state saves,
 * OS events — then ALL deferred timers run. Thickness must stay where the user put it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

const SCALE = 1.25;
const DISPLAY = { x: 0, y: 0, width: 1536, height: 864 }; // 1920x1080 @125%

const handlers = new Map<string, (...args: unknown[]) => unknown>();
const screenEmitter = new EventEmitter();

vi.mock('electron', () => {
  const display = { id: 1, bounds: DISPLAY, workArea: DISPLAY, scaleFactor: SCALE };
  return {
    ipcMain: { handle: (ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn) },
    BrowserWindow: { fromWebContents: () => null, getAllWindows: () => [] },
    Notification: class { static isSupported() { return false; } show() {} },
    app: { getVersion: () => '9.9.9', isPackaged: false },
    dialog: {},
    screen: Object.assign(screenEmitter, {
      getDisplayMatching: () => display,
      getAllDisplays: () => [display],
      dipToScreenRect: (_w: unknown, r: { x: number; y: number; width: number; height: number }) => ({
        x: Math.round(r.x * SCALE),
        y: Math.round(r.y * SCALE),
        width: Math.round(r.width * SCALE),
        height: Math.round(r.height * SCALE),
      }),
    }),
  };
});

const storeData: { store: Record<string, unknown> } = { store: {} };
vi.mock('electron-store', () => {
  return {
    default: class FakeStore {
      constructor(opts: { defaults: Record<string, unknown> }) {
        storeData.store = JSON.parse(JSON.stringify(opts.defaults));
      }
      get store() { return storeData.store; }
      set store(v: Record<string, unknown>) { storeData.store = JSON.parse(JSON.stringify(v)); }
      set(k: string, v: unknown) { storeData.store[k] = JSON.parse(JSON.stringify(v)); }
      get(k: string) { return storeData.store[k]; }
    },
  };
});
vi.mock('../src/main/tray', () => ({ rebuildTrayMenu: () => {} }));
vi.mock('../src/main/market/CompositeProvider', () => ({ marketDataService: {} }));
vi.mock('../src/main/market/CryptoStream', () => ({
  cryptoStream: { setHandlers: () => {}, disconnect: () => {}, setSymbols: () => {} },
}));

import { IPC } from '../src/shared/ipc';
import * as dock from '../src/shared/dockBounds';
import type { PersistedState } from '../src/shared/types';

class FakeWin extends EventEmitter {
  bounds = { x: 100, y: 100, width: 420, height: 560 };
  minW = 0;
  isDestroyed() { return false; }
  getBounds() { return { ...this.bounds }; }
  setBounds(b: { x: number; y: number; width: number; height: number }) {
    this.bounds = { ...b, width: Math.max(this.minW, b.width) };
    // Electron/OS emit these after a programmatic resize/move
    setTimeout(() => { this.emit('resize'); this.emit('resized'); this.emit('move'); this.emit('moved'); }, 5);
  }
  setMinimumSize(w: number) { this.minW = w; }
  getNativeWindowHandle() { const b = Buffer.alloc(8); b.writeBigUInt64LE(0xabcn); return b; }
  webContents = { send: () => {} };
}

let setposLog: { left: number; top: number; right: number; bottom: number }[] = [];

describe('dock shrink end-to-end (Windows path, mocked Electron)', () => {
  const realPlatform = process.platform;
  let win: FakeWin;
  let ipc: typeof import('../src/main/ipc');
  let persist: typeof import('../src/main/store');
  let wab: typeof import('../src/main/dock/windowsAppBar');

  beforeEach(async () => {
    vi.useFakeTimers();
    Object.defineProperty(process, 'platform', { value: 'win32' });
    handlers.clear();
    setposLog = [];
    vi.resetModules();
    wab = await import('../src/main/dock/windowsAppBar');
    wab._resetWindowsAppBarStateForTests();
    win = new FakeWin();
    wab._setAppBarApiForTests({
      sizeofAppBarData: 48,
      SHAppBarMessage: (msg, data) => {
        if (msg === 2) data.rc.right += 300; // QUERYPOS "suggests" a bigger bar
        if (msg === 3) setposLog.push({ ...data.rc });
        return 1;
      },
      getWindowRect: () => {
        const b = win.getBounds();
        const l = Math.round(b.x * SCALE), t = Math.round(b.y * SCALE);
        return { left: l, top: t, right: l + Math.round(b.width * SCALE), bottom: t + Math.round(b.height * SCALE) };
      },
    });
    persist = await import('../src/main/store');
    ipc = await import('../src/main/ipc');
    const { attachDockReapply } = await import('../src/main/dock/reapply');
    const { isApplyingDock } = await import('../src/main/dock/workAreaReserve');
    ipc.registerIpcHandlers();
    ipc.setMainWindow(win as never);
    attachDockReapply(win, screenEmitter, {
      isApplying: () => isApplyingDock(),
      isDocked: () => persist.get('settings').dockPosition !== 'floating',
      apply: () => ipc.applyDockFromSettings(win as never),
    });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: realPlatform });
    wab._resetWindowsAppBarStateForTests();
    vi.useRealTimers();
  });

  const call = (ch: string, ...args: unknown[]) => handlers.get(ch)!({ sender: null }, ...args) as Promise<unknown>;

  it('fresh install docks at the new default (210), not the floating width', async () => {
    const p = call(IPC.DOCK_SET, 'right');
    await vi.runAllTimersAsync();
    await p;
    expect(persist.get('settings').dockThickness).toBe(210);
    expect(win.getBounds().width).toBe(210);
    expect(win.getBounds().x).toBe(DISPLAY.width - 210);
  });

  for (const pos of ['left', 'right'] as const) {
    it(`${pos}: drag shrink 420→180 with stale renderer saves + OS events: stays 180`, async () => {
      await call(IPC.DOCK_SET_THICKNESS, 420);
      const d = call(IPC.DOCK_SET, pos);
      await vi.runAllTimersAsync();
      await d;
      expect(win.getBounds().width).toBe(420);

      // Stale renderer snapshot captured before the drag (debounced persist)
      const stale = JSON.parse(JSON.stringify(persist.getAll())) as PersistedState;
      stale.settings.dockThickness = 420;
      stale.window = { width: 420, height: 560 };

      // Drag burst: rAF-throttled IPC calls, not awaited (like the renderer)
      const pending: Promise<unknown>[] = [];
      for (const t of [400, 360, 320, 280, 240, 200, 180]) {
        pending.push(call(IPC.DOCK_SET_THICKNESS, t));
        await vi.advanceTimersByTimeAsync(16);
      }
      // Debounced full-state saves land after the drag with the stale value
      pending.push(call(IPC.STORE_SET_ALL, stale));
      pending.push(call(IPC.STORE_SET, 'settings', stale.settings));
      // OS noise: display metrics (work area changed by our AppBar)
      screenEmitter.emit('display-metrics-changed');
      await vi.runAllTimersAsync();
      await Promise.all(pending);
      await vi.runAllTimersAsync();

      expect(persist.get('settings').dockThickness).toBe(180);
      expect(persist.get('settings').dockThicknessUserSet).toBe(true);
      expect(win.getBounds().width).toBe(180);
      const last = setposLog[setposLog.length - 1];
      expect(last.right - last.left).toBe(Math.round(180 * SCALE)); // reserve == dock
      if (pos === 'right') expect(last.right).toBe(Math.round(DISPLAY.width * SCALE));
      // Nothing re-grew it at any point after the final drag step
      const after = setposLog.slice(setposLog.findIndex((r) => r.right - r.left === 225));
      expect(after.every((r) => r.right - r.left === 225)).toBe(true);
    });
  }

  it('renderer full-state save cannot change dock fields or window state', async () => {
    await call(IPC.DOCK_SET_THICKNESS, 260);
    const s = JSON.parse(JSON.stringify(persist.getAll())) as PersistedState;
    s.settings.dockThickness = 600;
    s.settings.fontSize = 15;
    s.window = { width: 1, height: 1 };
    await call(IPC.STORE_SET_ALL, s);
    await vi.runAllTimersAsync();
    expect(persist.get('settings').dockThickness).toBe(260);
    expect(persist.get('settings').fontSize).toBe(15); // other settings still saved
    expect(persist.get('window').width).not.toBe(1);
  });

  it('app:getVersion returns app.getVersion()', async () => {
    expect(await call(IPC.APP_GET_VERSION)).toBe('9.9.9');
  });
});

describe('drag math (renderer DockResizeHandle)', () => {
  /** Simulate a right-dock drag where the window moves as it shrinks. */
  function simulate(useScreen: boolean) {
    const displayRight = 1920;
    let thickness = 420;
    const start = 1920 - 420; // pointer starts on the handle (window's left edge)
    const startClient = 0;
    const startAxis = useScreen ? start : startClient;
    for (let screenX = start; screenX <= start + 240; screenX += 20) {
      const winX = displayRight - thickness; // window origin moves while shrinking
      const cur = useScreen ? screenX : screenX - winX; // clientX
      thickness = dock.computeDragThickness('right', startAxis, cur, 420);
    }
    return thickness;
  }
  it('screen coords: right dock shrinks to the pointer', () => {
    expect(simulate(true)).toBe(180);
  });
  it('client coords (old bug) bounce back near the start size', () => {
    expect(simulate(false)).toBeGreaterThanOrEqual(300); // never reaches 180
  });
  it('left/top grow with +delta, right/bottom with -delta', () => {
    expect(dock.computeDragThickness('left', 100, 60, 300)).toBe(260);
    expect(dock.computeDragThickness('bottom', 500, 540, 300)).toBe(260);
    expect(dock.computeDragThickness('right', 0, -1000, 300)).toBe(dock.MAX_DOCK_THICKNESS);
  });
});

describe('default thickness migration', () => {
  it('old default 420 never touched → 210', () => {
    const { settings, changed } = dock.migrateDockSettings({ dockThickness: 420 });
    expect(changed).toBe(true);
    expect(settings.dockThickness).toBe(210);
    expect(settings.settingsSchema).toBe(2);
  });
  it('user-set value is kept (even 420)', () => {
    expect(dock.migrateDockSettings({ dockThickness: 420, dockThicknessUserSet: true }).settings.dockThickness).toBe(420);
    expect(dock.migrateDockSettings({ dockThickness: 300 }).settings.dockThickness).toBe(300);
  });
  it('runs once', () => {
    const r = dock.migrateDockSettings({ dockThickness: 420, settingsSchema: 2 });
    expect(r.changed).toBe(false);
    expect(r.settings.dockThickness).toBe(420);
  });
  it('new default sits between MIN and MAX and shows price + change', () => {
    expect(dock.DEFAULT_DOCK_THICKNESS).toBe(210);
    expect(dock.DEFAULT_DOCK_THICKNESS).toBeGreaterThanOrEqual(dock.MIN_DOCK_THICKNESS);
    expect(dock.dockRowDensity('left', dock.DEFAULT_DOCK_THICKNESS)).toBe('medium');
  });
});
