/**
 * Platform work-area reservation when the overlay is docked.
 *
 * Linux/X11: EWMH _NET_WM_STRUT / _NET_WM_STRUT_PARTIAL via `xprop` (best-effort).
 * Windows: SHAppBarMessage AppBar via koffi (reserves system work area so maximize
 *          stops at the overlay edge). Falls back to edge snap only if FFI unavailable.
 * macOS: edge snap only — third-party apps cannot reserve the system work area.
 *
 * Apply order (must stick user thickness — see docs/WINDOWS_APPBAR.md):
 * 1. Caller persists dockThickness.
 * 2. Lower Electron min size so thickness can reach MIN_DOCK_THICKNESS.
 * 3. setBounds to the exact dock rect for that thickness.
 * 4. Register AppBar / strut to the same rect (Windows never expands past user size).
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import { screen, type BrowserWindow } from 'electron';
import type { DockPosition } from '../../shared/types';
import {
  computeDockBounds,
  computeStrutPartial,
  platformDockSupport,
  clampThickness,
  dockMinimumWindowSize,
  type Rect,
} from '../../shared/dockBounds';
import {
  registerWindowsAppBar,
  removeWindowsAppBar,
  isWindowsAppBarRegistered,
  cancelPendingAppBarReassert,
} from './windowsAppBar';

const execFileAsync = promisify(execFile);

/** True while applyDock is running or settling setBounds side-effects. */
let applyingDockDepth = 0;
let applyingDockClearTimer: ReturnType<typeof setTimeout> | null = null;

export function isApplyingDock(): boolean {
  return applyingDockDepth > 0;
}

function beginApplyingDock(): void {
  applyingDockDepth += 1;
  if (applyingDockClearTimer) {
    clearTimeout(applyingDockClearTimer);
    applyingDockClearTimer = null;
  }
}

function endApplyingDock(): void {
  // Keep the flag set briefly so Electron 'resized'/'moved' from our setBounds
  // do not immediately re-enter applyDock and fight the user thickness.
  applyingDockClearTimer = setTimeout(() => {
    applyingDockClearTimer = null;
    applyingDockDepth = Math.max(0, applyingDockDepth - 1);
  }, 200);
}

export interface DockApplyResult {
  position: DockPosition;
  bounds: Rect | null;
  workAreaReserved: boolean;
  platformSupport: ReturnType<typeof platformDockSupport>;
  detail?: string;
}

function getNativeWindowId(win: BrowserWindow): string | null {
  try {
    // Electron returns a Buffer handle on X11; parse numeric XID
    const buf = win.getNativeWindowHandle();
    if (!buf || buf.length < 4) return null;
    // little-endian uint32 on most Linux builds
    const id = buf.readUInt32LE(0);
    return id ? String(id) : null;
  } catch {
    return null;
  }
}

async function clearLinuxStrut(win: BrowserWindow): Promise<void> {
  const xid = getNativeWindowId(win);
  if (!xid) return;
  const zeros = Array(12).fill('0').join(', ');
  try {
    await execFileAsync('xprop', [
      '-id', xid,
      '-f', '_NET_WM_STRUT_PARTIAL', '32c',
      '-set', '_NET_WM_STRUT_PARTIAL', zeros,
    ], { timeout: 3000 });
    await execFileAsync('xprop', [
      '-id', xid,
      '-f', '_NET_WM_STRUT', '32c',
      '-set', '_NET_WM_STRUT', '0, 0, 0, 0',
    ], { timeout: 3000 });
  } catch (err) {
    console.warn('[dock] clear strut failed:', err);
  }
}

async function applyLinuxStrut(
  win: BrowserWindow,
  displayBounds: Rect,
  position: DockPosition,
  thickness: number
): Promise<{ ok: boolean; detail: string }> {
  const strut = computeStrutPartial(displayBounds, position, thickness);
  if (!strut) return { ok: false, detail: 'no strut for floating' };
  const xid = getNativeWindowId(win);
  if (!xid) return { ok: false, detail: 'no X11 window id (Wayland?)' };

  const partial = [
    strut.left, strut.right, strut.top, strut.bottom,
    strut.left_start_y, strut.left_end_y,
    strut.right_start_y, strut.right_end_y,
    strut.top_start_x, strut.top_end_x,
    strut.bottom_start_x, strut.bottom_end_x,
  ].join(', ');

  try {
    await execFileAsync('xprop', [
      '-id', xid,
      '-f', '_NET_WM_STRUT_PARTIAL', '32c',
      '-set', '_NET_WM_STRUT_PARTIAL', partial,
    ], { timeout: 3000 });
    await execFileAsync('xprop', [
      '-id', xid,
      '-f', '_NET_WM_STRUT', '32c',
      '-set', '_NET_WM_STRUT',
      `${strut.left}, ${strut.right}, ${strut.top}, ${strut.bottom}`,
    ], { timeout: 3000 });
    // Hint window type as dock so WMs respect struts more reliably
    try {
      await execFileAsync('xprop', [
        '-id', xid,
        '-f', '_NET_WM_WINDOW_TYPE', '32a',
        '-set', '_NET_WM_WINDOW_TYPE', '_NET_WM_WINDOW_TYPE_DOCK',
      ], { timeout: 3000 });
    } catch { /* optional */ }
    return { ok: true, detail: `strut applied xid=${xid}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: `xprop failed: ${msg}` };
  }
}

function resolveScaleFactor(win: BrowserWindow, displayBounds: Rect): number {
  try {
    const display = screen.getDisplayMatching({
      x: displayBounds.x,
      y: displayBounds.y,
      width: displayBounds.width,
      height: displayBounds.height,
    });
    if (display?.scaleFactor) return display.scaleFactor;
    if (!win.isDestroyed()) {
      return screen.getDisplayMatching(win.getBounds()).scaleFactor || 1;
    }
  } catch { /* fall through */ }
  return 1;
}

function applyDockMinimumSize(win: BrowserWindow, position: DockPosition): void {
  if (win.isDestroyed()) return;
  const { minWidth, minHeight } = dockMinimumWindowSize(position);
  try {
    win.setMinimumSize(minWidth, minHeight);
  } catch { /* best-effort */ }
}

/**
 * Snap window to dock edge and optionally reserve work area.
 * Ordering: min size → setBounds(exact user rect) → AppBar/strut for that same rect.
 */
export async function applyDock(
  win: BrowserWindow,
  displayBounds: Rect,
  position: DockPosition,
  thickness: number,
  reserveWorkArea: boolean
): Promise<DockApplyResult> {
  beginApplyingDock();
  try {
    // Cancel any deferred AppBar re-assert from a previous (often larger) thickness.
    cancelPendingAppBarReassert();

    const support = platformDockSupport();
    const t = clampThickness(thickness);
    applyDockMinimumSize(win, position);
    const bounds = computeDockBounds(displayBounds, position, t);

    // Exact user dock rect first — before AppBar — so Electron is not fighting a strut.
    if (bounds && !win.isDestroyed()) {
      win.setBounds({
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      });
    }

    if (position === 'floating' || !reserveWorkArea) {
      if (process.platform === 'linux') await clearLinuxStrut(win);
      if (process.platform === 'win32') {
        const removed = removeWindowsAppBar(win);
        return {
          position,
          bounds,
          workAreaReserved: false,
          platformSupport: support,
          detail:
            position === 'floating'
              ? `undocked (${removed.detail})`
              : `snap only (reserve off; ${removed.detail})`,
        };
      }
      return {
        position,
        bounds,
        workAreaReserved: false,
        platformSupport: support,
        detail: position === 'floating' ? 'undocked' : 'snap only (reserve off)',
      };
    }

    if (process.platform === 'linux') {
      const result = await applyLinuxStrut(win, displayBounds, position, t);
      return {
        position,
        bounds,
        workAreaReserved: result.ok,
        platformSupport: support,
        detail: result.detail,
      };
    }

    if (process.platform === 'win32') {
      const scaleFactor = resolveScaleFactor(win, displayBounds);
      const result = registerWindowsAppBar(win, displayBounds, position, t, scaleFactor);
      // approvedRectDip is always the user-thickness rect (never QUERYPOS-expanded)
      const finalBounds = result.approvedRectDip ?? bounds;
      return {
        position,
        bounds: finalBounds,
        workAreaReserved: result.ok,
        platformSupport: support,
        detail: result.ok
          ? result.detail
          : `${result.detail}; edge snap applied without work-area reservation`,
      };
    }

    if (process.platform === 'darwin') {
      return {
        position,
        bounds,
        workAreaReserved: false,
        platformSupport: support,
        detail: 'macOS: edge snap only — work-area reservation is not available to third-party apps',
      };
    }

    return {
      position,
      bounds,
      workAreaReserved: false,
      platformSupport: support,
      detail: 'unsupported platform',
    };
  } finally {
    endApplyingDock();
  }
}

export async function clearDockReservation(win?: BrowserWindow | null): Promise<void> {
  if (process.platform === 'linux' && win && !win.isDestroyed()) {
    await clearLinuxStrut(win);
  }
  if (process.platform === 'win32') {
    removeWindowsAppBar(win);
  }
}

export { isWindowsAppBarRegistered };
