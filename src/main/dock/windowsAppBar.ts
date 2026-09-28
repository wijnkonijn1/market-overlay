/**
 * Windows AppBar work-area reservation via SHAppBarMessage (shell32).
 *
 * SPI_SETWORKAREA is unreliable on Windows 10+ (Explorer recalculates from
 * registered AppBars and ignores SPI). AppBar registration is the supported path.
 *
 * Uses koffi for FFI. On process exit / HWND destroy, the shell removes the AppBar.
 */
import type { BrowserWindow } from 'electron';
import type { DockPosition } from '../../shared/types';
import {
  computeAppBarPhysicalRect,
  dockPositionToAppBarEdge,
  physicalRectToDip,
  type WinRect,
} from '../../shared/dockBounds';

const ABM_NEW = 0x00000000;
const ABM_REMOVE = 0x00000001;
const ABM_QUERYPOS = 0x00000002;
const ABM_SETPOS = 0x00000003;
const ABM_WINDOWPOSCHANGED = 0x00000009;

export interface WindowsAppBarResult {
  ok: boolean;
  detail: string;
  approvedRectDip?: { x: number; y: number; width: number; height: number };
}

interface AppBarApi {
  sizeofAppBarData: number;
  SHAppBarMessage: (dwMessage: number, data: AppBarDataJs) => number | bigint;
}

interface AppBarDataJs {
  cbSize: number;
  hWnd: number | bigint;
  uCallbackMessage: number;
  uEdge: number;
  rc: WinRect;
  lParam: number;
}

let api: AppBarApi | null | undefined; // undefined = not tried, null = failed
let registeredHwnd: number | bigint | null = null;
let reassertTimer: ReturnType<typeof setTimeout> | null = null;

function loadApi(): AppBarApi | null {
  if (api !== undefined) return api;
  if (process.platform !== 'win32') {
    api = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const koffiMod = require('koffi');
    const koffi = (koffiMod && koffiMod.default) ? koffiMod.default : koffiMod;
    const shell32 = koffi.load('shell32.dll');
    const RECT = koffi.struct('RECT', {
      left: 'int32',
      top: 'int32',
      right: 'int32',
      bottom: 'int32',
    });
    const APPBARDATA = koffi.struct('APPBARDATA', {
      cbSize: 'uint32',
      hWnd: 'uintptr_t',
      uCallbackMessage: 'uint32',
      uEdge: 'uint32',
      rc: RECT,
      lParam: 'intptr_t',
    });
    const SHAppBarMessage = shell32.func(
      'SHAppBarMessage',
      'uintptr_t',
      ['uint32', koffi.inout(koffi.pointer(APPBARDATA))]
    );
    api = {
      sizeofAppBarData: koffi.sizeof(APPBARDATA),
      SHAppBarMessage: (dwMessage, data) => SHAppBarMessage(dwMessage, data) as number | bigint,
    };
    return api;
  } catch (err) {
    console.warn('[dock/win] koffi/SHAppBarMessage unavailable:', err);
    api = null;
    return null;
  }
}

/** Read HWND from Electron's native handle Buffer. */
export function getHwnd(win: BrowserWindow): number | bigint | null {
  try {
    const buf = win.getNativeWindowHandle();
    if (!buf || buf.length < 4) return null;
    if (buf.length >= 8) {
      const v = buf.readBigUInt64LE(0);
      // Prefer Number when safe for simpler logging / comparisons
      if (v <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(v);
      return v;
    }
    return buf.readUInt32LE(0);
  } catch {
    return null;
  }
}

function clearReassertTimer(): void {
  if (reassertTimer) {
    clearTimeout(reassertTimer);
    reassertTimer = null;
  }
}

function makeData(
  hwnd: number | bigint,
  edge: number,
  rc: WinRect,
  sizeof: number
): AppBarDataJs {
  return {
    cbSize: sizeof,
    hWnd: hwnd,
    uCallbackMessage: 0,
    uEdge: edge,
    rc: { ...rc },
    lParam: 0,
  };
}

/**
 * Register or update an AppBar for the overlay window.
 * After SETPOS, re-asserts window bounds (immediate + deferred) to counter
 * Explorer briefly pushing our HWND out of the reserved strip.
 */
export function registerWindowsAppBar(
  win: BrowserWindow,
  displayBoundsDip: { x: number; y: number; width: number; height: number },
  position: DockPosition,
  thicknessDip: number,
  scaleFactor: number
): WindowsAppBarResult {
  const lib = loadApi();
  if (!lib) {
    return { ok: false, detail: 'Windows AppBar API unavailable (koffi/shell32)' };
  }
  const edge = dockPositionToAppBarEdge(position);
  if (edge == null) {
    return { ok: false, detail: 'no AppBar edge for floating' };
  }
  const hwnd = getHwnd(win);
  if (hwnd == null || hwnd === 0) {
    return { ok: false, detail: 'no HWND' };
  }

  const physical = computeAppBarPhysicalRect(
    displayBoundsDip,
    position,
    thicknessDip,
    scaleFactor
  );
  if (!physical) {
    return { ok: false, detail: 'could not compute AppBar rect' };
  }

  try {
    // If a different HWND was registered (shouldn't happen), remove it first.
    if (registeredHwnd != null && registeredHwnd !== hwnd) {
      removeWindowsAppBar(win);
    }

    const isNew = registeredHwnd == null || registeredHwnd !== hwnd;
    if (isNew) {
      const newData = makeData(hwnd, edge, physical, lib.sizeofAppBarData);
      const newResult = Number(lib.SHAppBarMessage(ABM_NEW, newData));
      if (!newResult) {
        // May already be registered after a partial prior attempt — try REMOVE then NEW
        lib.SHAppBarMessage(ABM_REMOVE, makeData(hwnd, edge, physical, lib.sizeofAppBarData));
        const retry = Number(lib.SHAppBarMessage(ABM_NEW, makeData(hwnd, edge, physical, lib.sizeofAppBarData)));
        if (!retry) {
          return { ok: false, detail: 'ABM_NEW failed' };
        }
      }
      registeredHwnd = hwnd;
    }

    const data = makeData(hwnd, edge, physical, lib.sizeofAppBarData);
    lib.SHAppBarMessage(ABM_QUERYPOS, data);
    lib.SHAppBarMessage(ABM_SETPOS, data);
    // Notify shell that our window position settled
    try {
      lib.SHAppBarMessage(ABM_WINDOWPOSCHANGED, makeData(hwnd, edge, data.rc, lib.sizeofAppBarData));
    } catch { /* optional */ }

    const approvedDip = physicalRectToDip(data.rc, scaleFactor);
    const applyBounds = () => {
      if (win.isDestroyed()) return;
      win.setBounds({
        x: Math.round(approvedDip.x),
        y: Math.round(approvedDip.y),
        width: Math.max(1, Math.round(approvedDip.width)),
        height: Math.max(1, Math.round(approvedDip.height)),
      });
    };
    applyBounds();

    // Explorer may asynchronously push our window out of the reserved strip once;
    // a single deferred re-assert (~150ms) holds for AppBar dock windows.
    clearReassertTimer();
    reassertTimer = setTimeout(() => {
      reassertTimer = null;
      applyBounds();
    }, 150);

    return {
      ok: true,
      detail: `AppBar registered edge=${edge} hwnd=${String(hwnd)} rc=${JSON.stringify(data.rc)}`,
      approvedRectDip: approvedDip,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    registeredHwnd = null;
    return { ok: false, detail: `SHAppBarMessage error: ${msg}` };
  }
}

/**
 * Unregister the AppBar so the system work area is restored.
 */
export function removeWindowsAppBar(win?: BrowserWindow | null): WindowsAppBarResult {
  clearReassertTimer();
  const lib = loadApi();
  if (!lib) {
    registeredHwnd = null;
    return { ok: false, detail: 'Windows AppBar API unavailable' };
  }

  const hwnd =
    registeredHwnd ??
    (win && !win.isDestroyed() ? getHwnd(win) : null);

  if (hwnd == null) {
    registeredHwnd = null;
    return { ok: true, detail: 'no AppBar registered' };
  }

  try {
    const data = makeData(
      hwnd,
      0,
      { left: 0, top: 0, right: 0, bottom: 0 },
      lib.sizeofAppBarData
    );
    lib.SHAppBarMessage(ABM_REMOVE, data);
    registeredHwnd = null;
    return { ok: true, detail: `AppBar removed hwnd=${String(hwnd)}` };
  } catch (err) {
    registeredHwnd = null;
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: `ABM_REMOVE error: ${msg}` };
  }
}

export function isWindowsAppBarRegistered(): boolean {
  return registeredHwnd != null;
}

/** Test helper: reset module state (unit tests only). */
export function _resetWindowsAppBarStateForTests(): void {
  clearReassertTimer();
  registeredHwnd = null;
  api = undefined;
}
