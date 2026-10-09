/**
 * Windows AppBar work-area reservation via SHAppBarMessage (shell32).
 *
 * SPI_SETWORKAREA is unreliable on Windows 10+ (Explorer recalculates from
 * registered AppBars and ignores SPI). AppBar registration is the supported path.
 *
 * Uses koffi for FFI. On process exit / HWND destroy, the shell removes the AppBar.
 *
 * Reserve policy (v1.1.6+) — single source of truth = the dock window itself:
 * 1. Caller persists thickness and setBounds()es the window to the exact dock rect.
 * 2. We read the window's ACTUAL rect from the OS (user32 GetWindowRect). That
 *    rect is in the same coordinate space SHAppBarMessage uses for this thread,
 *    so no DIP<->physical math is involved at all (no double scaling, no
 *    mixed-DPI origin errors). Fallback: screen.dipToScreenRect(getBounds()),
 *    i.e. scale applied exactly once.
 * 3. ABM_QUERYPOS (protocol) then ABM_SETPOS with exactly the window rect —
 *    shell adjustments are ignored so the reservation never exceeds the dock.
 * 4. Deferred re-assert (~150ms) only if the OS moved the window; it re-reads
 *    the window rect and re-SETPOSes so reserve and window stay identical.
 *    A generation counter cancels stale re-asserts from superseded resizes.
 */
import type { BrowserWindow } from 'electron';
import { dockLog } from './dockLog';
import type { DockPosition } from '../../shared/types';
import {
  boundsMatchDockThickness,
  computeDockBounds,
  computeReserveRectFromWindow,
  clampThickness,
  correctOverReservedRect,
  dockPositionToAppBarEdge,
  edgeInsetPhysical,
  formatReserveLog,
  rectThickness,
  winRectThickness,
  type Rect,
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
  approvedRectDip?: Rect;
  /** Physical rect handed to ABM_SETPOS (== window rect). */
  reservePhysical?: WinRect;
  reservePx?: number;
  windowPx?: number;
}

export interface AppBarApi {
  sizeofAppBarData: number;
  SHAppBarMessage: (dwMessage: number, data: AppBarDataJs) => number | bigint;
  /** user32 GetWindowRect; null when unavailable/failed. */
  getWindowRect?: (hwnd: number | bigint) => WinRect | null;
  /** user32 MonitorFromWindow + GetMonitorInfoW (physical rcMonitor / rcWork). */
  getMonitorInfo?: (hwnd: number | bigint) => { monitor: WinRect; work: WinRect; id: string } | null;
}

export interface AppBarDataJs {
  cbSize: number;
  hWnd: number | bigint;
  uCallbackMessage: number;
  uEdge: number;
  rc: WinRect;
  lParam: number;
}

export interface RegisterAppBarOptions {
  /** DIP rect → physical (screen.dipToScreenRect). Used only if GetWindowRect fails. */
  toPhysical: (dip: Rect) => WinRect;
  scaleFactor: number;
  log?: (line: string) => void;
}

let api: AppBarApi | null | undefined; // undefined = not tried, null = failed
let registeredHwnd: number | bigint | null = null;
let registeredEdge: number | null = null;
let lastReserve: WinRect | null = null;
/** API used for the current registration (real koffi or injected in tests). */
let activeLib: AppBarApi | null = null;
/**
 * Over-reservation ratio detected from the real work area (1 = none). When the
 * shell DPI-scales our rect a second time, we pre-divide by this ratio so the
 * effective reservation equals the window.
 */
let dpiCorrection = 1;
/** Work-area inset on monitor+edge without our AppBar (e.g. taskbar on same edge). */
const baselines = new Map<string, number>();
let verifyTimers: ReturnType<typeof setTimeout>[] = [];

function clearVerifyTimers(): void {
  for (const t of verifyTimers) clearTimeout(t);
  verifyTimers = [];
}

function captureBaseline(lib: AppBarApi, hwnd: number | bigint, position: DockPosition, edge: number): void {
  try {
    const mi = lib.getMonitorInfo?.(hwnd);
    if (!mi) return;
    const key = `${mi.id}:${edge}`;
    const inset = Math.max(0, edgeInsetPhysical(mi.monitor, mi.work, position));
    const prev = baselines.get(key);
    baselines.set(key, prev == null ? inset : Math.min(prev, inset));
  } catch { /* best-effort */ }
}
let reassertTimer: ReturnType<typeof setTimeout> | null = null;
/** Bumped on every register/remove so deferred re-asserts from older sizes are no-ops. */
let applyGeneration = 0;

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
    let getWindowRect: AppBarApi['getWindowRect'];
    try {
      const user32 = koffi.load('user32.dll');
      const GetWindowRect = user32.func('GetWindowRect', 'bool', [
        'uintptr_t',
        koffi.out(koffi.pointer(RECT)),
      ]);
      getWindowRect = (hwnd) => {
        const rc: WinRect = { left: 0, top: 0, right: 0, bottom: 0 };
        const ok = GetWindowRect(hwnd, rc);
        if (!ok || rc.right <= rc.left || rc.bottom <= rc.top) return null;
        return { left: rc.left, top: rc.top, right: rc.right, bottom: rc.bottom };
      };
    } catch (err) {
      console.warn('[dock/win] GetWindowRect unavailable, using dipToScreenRect:', err);
    }
    let getMonitorInfo: AppBarApi['getMonitorInfo'];
    try {
      const user32 = koffi.load('user32.dll');
      const MONITORINFO = koffi.struct('MONITORINFO', {
        cbSize: 'uint32',
        rcMonitor: RECT,
        rcWork: RECT,
        dwFlags: 'uint32',
      });
      const MonitorFromWindow = user32.func('MonitorFromWindow', 'uintptr_t', ['uintptr_t', 'uint32']);
      const GetMonitorInfoW = user32.func('GetMonitorInfoW', 'bool', [
        'uintptr_t',
        koffi.inout(koffi.pointer(MONITORINFO)),
      ]);
      const size = koffi.sizeof(MONITORINFO);
      getMonitorInfo = (hwnd) => {
        const hmon = MonitorFromWindow(hwnd, 2 /* MONITOR_DEFAULTTONEAREST */);
        if (!hmon) return null;
        const mi = {
          cbSize: size,
          rcMonitor: { left: 0, top: 0, right: 0, bottom: 0 },
          rcWork: { left: 0, top: 0, right: 0, bottom: 0 },
          dwFlags: 0,
        };
        if (!GetMonitorInfoW(hmon, mi)) return null;
        return { monitor: { ...mi.rcMonitor }, work: { ...mi.rcWork }, id: String(hmon) };
      };
    } catch (err) {
      console.warn('[dock/win] GetMonitorInfoW unavailable (no work-area verify):', err);
    }
    api = {
      sizeofAppBarData: koffi.sizeof(APPBARDATA),
      SHAppBarMessage: (dwMessage, data) => SHAppBarMessage(dwMessage, data) as number | bigint,
      getWindowRect,
      getMonitorInfo,
    };
    return api;
  } catch (err) {
    console.warn('[dock/win] koffi/SHAppBarMessage unavailable:', err);
    dockLog('appbar', `koffi/SHAppBarMessage unavailable: ${String(err)}`);
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
  clearVerifyTimers();
  if (reassertTimer) {
    clearTimeout(reassertTimer);
    reassertTimer = null;
  }
}

/** Cancel any pending deferred bounds re-assert (e.g. before a newer thickness apply). */
export function cancelPendingAppBarReassert(): void {
  applyGeneration += 1;
  clearReassertTimer();
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
 * Physical rect of the window as the OS sees it. GetWindowRect first (same
 * coordinate space as SHAppBarMessage), else dipToScreenRect(getBounds()).
 */
function readWindowPhysical(
  lib: AppBarApi,
  hwnd: number | bigint,
  win: BrowserWindow,
  toPhysical: (dip: Rect) => WinRect
): { rect: WinRect; source: 'GetWindowRect' | 'dipToScreenRect' } {
  try {
    const r = lib.getWindowRect?.(hwnd);
    if (r) return { rect: r, source: 'GetWindowRect' };
  } catch { /* fall back */ }
  return { rect: toPhysical(win.getBounds()), source: 'dipToScreenRect' };
}

/** QUERYPOS (protocol) + SETPOS with exactly `rc` (never the shell-adjusted rect). */
function setPos(lib: AppBarApi, hwnd: number | bigint, edge: number, rc: WinRect): void {
  const q = makeData(hwnd, edge, rc, lib.sizeofAppBarData);
  lib.SHAppBarMessage(ABM_QUERYPOS, q);
  // Shell may have adjusted q.rc (e.g. grown/moved). Reserve == window, always.
  const data = makeData(hwnd, edge, rc, lib.sizeofAppBarData);
  lib.SHAppBarMessage(ABM_SETPOS, data);
  dockLog('appbar', `edge=${edge} QUERYPOS in=${JSON.stringify(rc)} shell-suggested=${JSON.stringify(q.rc)} SETPOS sent=${JSON.stringify(rc)} shell-returned=${JSON.stringify(data.rc)}`);
  try {
    lib.SHAppBarMessage(ABM_WINDOWPOSCHANGED, makeData(hwnd, edge, rc, lib.sizeofAppBarData));
  } catch { /* optional */ }
  lastReserve = { ...rc };
}

/**
 * Register or update an AppBar for the overlay window. The caller must already
 * have setBounds()'d the window to the dock rect; the reservation is taken from
 * the window's actual rect.
 */
export function registerWindowsAppBar(
  win: BrowserWindow,
  displayBoundsDip: Rect,
  position: DockPosition,
  thicknessDip: number,
  opts: RegisterAppBarOptions
): WindowsAppBarResult {
  const lib = loadApi();
  if (!lib) {
    return { ok: false, detail: 'Windows AppBar API unavailable (koffi/shell32)' };
  }
  return registerWithApi(lib, win, displayBoundsDip, position, thicknessDip, opts);
}

/** Same as registerWindowsAppBar with an injected API (unit tests). */
export function registerWithApi(
  lib: AppBarApi,
  win: BrowserWindow,
  displayBoundsDip: Rect,
  position: DockPosition,
  thicknessDip: number,
  opts: RegisterAppBarOptions
): WindowsAppBarResult {
  const log = opts.log ?? ((l: string) => console.log(l));
  const edge = dockPositionToAppBarEdge(position);
  if (edge == null) {
    return { ok: false, detail: 'no AppBar edge for floating' };
  }
  const hwnd = getHwnd(win);
  if (hwnd == null || hwnd === 0) {
    return { ok: false, detail: 'no HWND' };
  }

  const thickness = clampThickness(thicknessDip);
  const intendedDip = computeDockBounds(displayBoundsDip, position, thickness);
  if (!intendedDip) {
    return { ok: false, detail: 'could not compute dock bounds' };
  }

  // New apply supersedes any pending re-assert from a previous (often larger) size.
  const gen = ++applyGeneration;
  clearReassertTimer();

  try {
    // Make sure the window really sits at the dock rect before we measure it.
    if (!win.isDestroyed() && !boundsMatchDockThickness(win.getBounds(), position, thickness, displayBoundsDip)) {
      win.setBounds(intendedDip);
    }

    const measured = readWindowPhysical(lib, hwnd, win, opts.toPhysical);
    const exact = computeReserveRectFromWindow(measured.rect, position);
    if (!exact) return { ok: false, detail: 'empty window rect' };
    const reserve = applyDpiCorrection(exact, position);
    activeLib = lib;

    if (registeredHwnd != null && (registeredHwnd !== hwnd || registeredEdge !== edge)) {
      // Different window or edge: drop the old reservation completely first.
      removeWindowsAppBar(win);
      applyGeneration = gen; // remove bumps the generation; keep this apply current
    }
    const isNew = registeredHwnd == null;
    if (isNew) {
      captureBaseline(lib, hwnd, position, edge);
      const newResult = Number(lib.SHAppBarMessage(ABM_NEW, makeData(hwnd, edge, reserve, lib.sizeofAppBarData)));
      if (!newResult) {
        // May already be registered after a partial prior attempt — try REMOVE then NEW
        lib.SHAppBarMessage(ABM_REMOVE, makeData(hwnd, edge, reserve, lib.sizeofAppBarData));
        const retry = Number(lib.SHAppBarMessage(ABM_NEW, makeData(hwnd, edge, reserve, lib.sizeofAppBarData)));
        if (!retry) {
          return { ok: false, detail: 'ABM_NEW failed' };
        }
      }
      registeredHwnd = hwnd;
    }
    registeredEdge = edge;
    setPos(lib, hwnd, edge, reserve);

    const reservePx = winRectThickness(reserve, position);
    const windowPx = winRectThickness(measured.rect, position);
    log(
      `${formatReserveLog(reservePx, windowPx, opts.scaleFactor)} dip=${rectThickness(
        win.isDestroyed() ? intendedDip : win.getBounds(),
        position
      )} src=${measured.source}`
    );

    // Explorer may asynchronously push our HWND once; if the window drifted,
    // put it back and re-reserve from the *re-measured* window rect.
    reassertTimer = setTimeout(() => {
      reassertTimer = null;
      if (gen !== applyGeneration || win.isDestroyed()) return;
      const cur = win.getBounds();
      if (!boundsMatchDockThickness(cur, position, thickness, displayBoundsDip)) {
        log(`[dock] re-assert (timer 150ms): window drifted to ${JSON.stringify(cur)}, restoring ${JSON.stringify(intendedDip)}`);
        win.setBounds(intendedDip);
      }
      const again = readWindowPhysical(lib, hwnd, win, opts.toPhysical);
      const exactRc = computeReserveRectFromWindow(again.rect, position);
      if (!exactRc || registeredHwnd !== hwnd) return;
      const rc = applyDpiCorrection(exactRc, position);
      if (
        !lastReserve ||
        rc.left !== lastReserve.left ||
        rc.top !== lastReserve.top ||
        rc.right !== lastReserve.right ||
        rc.bottom !== lastReserve.bottom
      ) {
        setPos(lib, hwnd, edge, rc);
        log(`${formatReserveLog(winRectThickness(rc, position), winRectThickness(again.rect, position), opts.scaleFactor)} (re-assert)`);
      }
    }, 150);

    scheduleVerify(lib, hwnd, win, position, edge, gen, opts, log);

    return {
      ok: true,
      detail: `AppBar registered edge=${edge} hwnd=${String(hwnd)} rc=${JSON.stringify(reserve)} reservePx=${reservePx} windowPx=${windowPx} thicknessDip=${thickness}`,
      approvedRectDip: intendedDip,
      reservePhysical: reserve,
      reservePx,
      windowPx,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    registeredHwnd = null;
    return { ok: false, detail: `SHAppBarMessage error: ${msg}` };
  }
}

/**
 * Check the real work area (GetMonitorInfoW) after the shell applied SETPOS:
 * our inset (minus baseline) must equal the window thickness. If the shell
 * consistently reserved a scale-like multiple more (DPI virtualization), learn
 * that ratio and re-SETPOS so the effective reservation equals the window.
 */
function scheduleVerify(
  lib: AppBarApi,
  hwnd: number | bigint,
  win: BrowserWindow,
  position: DockPosition,
  edge: number,
  gen: number,
  opts: RegisterAppBarOptions,
  log: (line: string) => void
): void {
  if (!lib.getMonitorInfo) return;
  const samples: number[] = [];
  const sample = (final: boolean) => {
    if (gen !== applyGeneration || win.isDestroyed() || registeredHwnd !== hwnd) return;
    const mi = lib.getMonitorInfo?.(hwnd);
    const wr = readWindowPhysical(lib, hwnd, win, opts.toPhysical).rect;
    if (!mi) return;
    const base = baselines.get(`${mi.id}:${edge}`) ?? 0;
    const observed = edgeInsetPhysical(mi.monitor, mi.work, position) - base;
    const expected = winRectThickness(wr, position);
    samples.push(observed);
    log(`[dock] verify reserve=${observed} window=${expected} scale=${opts.scaleFactor} baseline=${base}`);
    if (!final) return;
    const stable = samples.length >= 2 && samples.every((v) => v === samples[0]);
    if (!stable || Math.abs(observed - expected) <= 2) return;
    if (observed < expected) {
      log(`[dock] work area reserves less than the dock (${observed} < ${expected})`);
      if (dpiCorrection > 1) {
        // A previous correction overshot — relax it and re-reserve.
        setWindowsAppBarDpiCorrection(dpiCorrection * (observed / expected));
        const exactRc = computeReserveRectFromWindow(wr, position);
        if (exactRc) setPos(lib, hwnd, edge, applyDpiCorrection(exactRc, position));
      }
      return;
    }
    const ratio = observed / expected;
    if (ratio < 1.1 || ratio > 4.5) {
      log(`[dock] reserve mismatch ${observed} vs ${expected} (ratio ${ratio.toFixed(3)}) — not auto-correcting`);
      return;
    }
    // Ratio is relative to what we last sent (which may already be corrected).
    setWindowsAppBarDpiCorrection(dpiCorrection * ratio);
    const exact = computeReserveRectFromWindow(wr, position);
    if (!exact) return;
    const rc = applyDpiCorrection(exact, position);
    setPos(lib, hwnd, edge, rc);
    log(`[dock] corrected over-reservation ratio=${dpiCorrection.toFixed(3)} sent=${winRectThickness(rc, position)} window=${expected}`);
  };
  verifyTimers.push(setTimeout(() => sample(false), 400));
  verifyTimers.push(setTimeout(() => sample(true), 1200));
}

function applyDpiCorrection(rc: WinRect, position: DockPosition): WinRect {
  if (dpiCorrection <= 1) return rc;
  return correctOverReservedRect(rc, position, 1, dpiCorrection) ?? rc;
}

/** Set the over-reservation ratio detected from the observed work area. */
export function setWindowsAppBarDpiCorrection(ratio: number): void {
  dpiCorrection = Number.isFinite(ratio) && ratio >= 1.1 && ratio <= 4.5 ? ratio : 1;
}

export function getWindowsAppBarDpiCorrection(): number {
  return dpiCorrection;
}

/**
 * Re-SETPOS with a corrected physical rect (used when the observed work area
 * shows the shell reserved more than the window — e.g. DPI virtualization).
 */
export function setWindowsAppBarReserve(rc: WinRect): boolean {
  const lib = activeLib;
  if (!lib || registeredHwnd == null || registeredEdge == null) return false;
  try {
    setPos(lib, registeredHwnd, registeredEdge, rc);
    return true;
  } catch {
    return false;
  }
}

export function getLastWindowsAppBarReserve(): WinRect | null {
  return lastReserve ? { ...lastReserve } : null;
}

/**
 * Unregister the AppBar so the system work area is restored.
 */
export function removeWindowsAppBar(win?: BrowserWindow | null): WindowsAppBarResult {
  cancelPendingAppBarReassert();
  lastReserve = null;
  registeredEdge = null;
  const lib = activeLib ?? loadApi();
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
  registeredEdge = null;
  lastReserve = null;
  activeLib = null;
  baselines.clear();
  clearVerifyTimers();
  dpiCorrection = 1;
  api = undefined;
  applyGeneration = 0;
}

/** Test helper: inject a fake shell32/user32 API (unit/integration tests only). */
export function _setAppBarApiForTests(fake: AppBarApi | null): void {
  api = fake;
}
