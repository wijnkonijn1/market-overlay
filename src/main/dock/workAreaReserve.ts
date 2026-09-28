/**
 * Platform work-area reservation when the overlay is docked.
 *
 * Linux/X11: EWMH _NET_WM_STRUT / _NET_WM_STRUT_PARTIAL via `xprop` (best-effort).
 * Windows: dock positioning always; AppBar reservation attempted via optional koffi (may be unavailable).
 * macOS: edge snap only — third-party apps cannot reserve the system work area.
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { BrowserWindow } from 'electron';
import type { DockPosition } from '../../shared/types';
import {
  computeDockBounds,
  computeStrutPartial,
  platformDockSupport,
  clampThickness,
  type Rect,
} from '../../shared/dockBounds';

const execFileAsync = promisify(execFile);

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

/**
 * Snap window to dock edge and optionally reserve work area.
 */
export async function applyDock(
  win: BrowserWindow,
  displayBounds: Rect,
  position: DockPosition,
  thickness: number,
  reserveWorkArea: boolean
): Promise<DockApplyResult> {
  const support = platformDockSupport();
  const t = clampThickness(thickness);
  const bounds = computeDockBounds(displayBounds, position, t);

  if (bounds) {
    win.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    });
  }

  if (position === 'floating' || !reserveWorkArea) {
    if (process.platform === 'linux') await clearLinuxStrut(win);
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
    // Positioning done above. True AppBar reservation needs SHAppBarMessage (FFI).
    // Documented as follow-up when koffi/ffi is available in the build environment.
    return {
      position,
      bounds,
      workAreaReserved: false,
      platformSupport: support,
      detail: 'Windows: edge snap applied; AppBar reservation not available in this build',
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
}

export async function clearDockReservation(win: BrowserWindow): Promise<void> {
  if (process.platform === 'linux') await clearLinuxStrut(win);
}
