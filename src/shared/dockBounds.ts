/**
 * Pure dock geometry helpers — snap overlay to a display edge.
 */
import type { DockPosition } from './types';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIN_DOCK_THICKNESS = 200;
export const MAX_DOCK_THICKNESS = 800;
export const DEFAULT_DOCK_THICKNESS = 420;

export function clampThickness(thickness: number): number {
  if (!Number.isFinite(thickness)) return DEFAULT_DOCK_THICKNESS;
  return Math.min(MAX_DOCK_THICKNESS, Math.max(MIN_DOCK_THICKNESS, Math.round(thickness)));
}

/**
 * Compute window bounds for a docked overlay on a display.
 * Left/Right → full height, thickness = width.
 * Top/Bottom → full width, thickness = height.
 * Floating → returns null (caller keeps current bounds).
 */
export function computeDockBounds(
  displayBounds: Rect,
  position: DockPosition,
  thickness: number
): Rect | null {
  if (position === 'floating') return null;
  const t = clampThickness(thickness);
  const { x, y, width, height } = displayBounds;

  switch (position) {
    case 'left':
      return { x, y, width: Math.min(t, width), height };
    case 'right':
      return {
        x: x + Math.max(0, width - t),
        y,
        width: Math.min(t, width),
        height,
      };
    case 'top':
      return { x, y, width, height: Math.min(t, height) };
    case 'bottom':
      return {
        x,
        y: y + Math.max(0, height - t),
        width,
        height: Math.min(t, height),
      };
    default:
      return null;
  }
}

/**
 * Derive thickness from current window size given a dock position.
 * L/R → width; T/B → height; floating → width.
 */
export function thicknessFromBounds(position: DockPosition, bounds: Rect): number {
  if (position === 'top' || position === 'bottom') return clampThickness(bounds.height);
  return clampThickness(bounds.width);
}

/**
 * EWMH strut values in pixels for _NET_WM_STRUT / PARTIAL.
 * Order: left, right, top, bottom.
 * PARTIAL also needs start/end along the opposite axis (y for L/R, x for T/B).
 */
export interface StrutPartial {
  left: number;
  right: number;
  top: number;
  bottom: number;
  left_start_y: number;
  left_end_y: number;
  right_start_y: number;
  right_end_y: number;
  top_start_x: number;
  top_end_x: number;
  bottom_start_x: number;
  bottom_end_x: number;
}

export function computeStrutPartial(
  displayBounds: Rect,
  position: DockPosition,
  thickness: number
): StrutPartial | null {
  if (position === 'floating') return null;
  const t = clampThickness(thickness);
  const { x, y, width, height } = displayBounds;
  const empty: StrutPartial = {
    left: 0, right: 0, top: 0, bottom: 0,
    left_start_y: 0, left_end_y: 0,
    right_start_y: 0, right_end_y: 0,
    top_start_x: 0, top_end_x: 0,
    bottom_start_x: 0, bottom_end_x: 0,
  };

  switch (position) {
    case 'left':
      return {
        ...empty,
        left: x + Math.min(t, width), // strut from screen edge 0
        left_start_y: y,
        left_end_y: y + height,
      };
    case 'right':
      // right strut is measured from the right edge of the virtual screen;
      // for single-monitor at (0,0) this is just thickness. For multi-monitor
      // we approximate with thickness (EWMH is relative to root window).
      return {
        ...empty,
        right: Math.min(t, width),
        right_start_y: y,
        right_end_y: y + height,
      };
    case 'top':
      return {
        ...empty,
        top: y + Math.min(t, height),
        top_start_x: x,
        top_end_x: x + width,
      };
    case 'bottom':
      return {
        ...empty,
        bottom: Math.min(t, height),
        bottom_start_x: x,
        bottom_end_x: x + width,
      };
    default:
      return null;
  }
}

export function platformDockSupport(
  platform: NodeJS.Platform = process.platform
): 'strut' | 'appbar' | 'snap-only' | 'none' {
  if (platform === 'linux') return 'strut';
  if (platform === 'win32') return 'appbar';
  if (platform === 'darwin') return 'snap-only';
  return 'none';
}

/**
 * Win32 APPBARDATA edge constants (ABE_*).
 */
export type AppBarEdge = 0 | 1 | 2 | 3; // left, top, right, bottom

export function dockPositionToAppBarEdge(position: DockPosition): AppBarEdge | null {
  switch (position) {
    case 'left':
      return 0; // ABE_LEFT
    case 'top':
      return 1; // ABE_TOP
    case 'right':
      return 2; // ABE_RIGHT
    case 'bottom':
      return 3; // ABE_BOTTOM
    default:
      return null;
  }
}

export interface WinRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Convert a DIP rect (Electron) to a physical-pixel Win32 RECT using scaleFactor.
 */
export function dipRectToPhysical(rect: Rect, scaleFactor: number): WinRect {
  const s = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
  const left = Math.round(rect.x * s);
  const top = Math.round(rect.y * s);
  const right = Math.round((rect.x + rect.width) * s);
  const bottom = Math.round((rect.y + rect.height) * s);
  return { left, top, right, bottom };
}

/**
 * Convert a physical-pixel Win32 RECT back to a DIP Electron rect.
 */
export function physicalRectToDip(rc: WinRect, scaleFactor: number): Rect {
  const s = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
  return {
    x: Math.round(rc.left / s),
    y: Math.round(rc.top / s),
    width: Math.round((rc.right - rc.left) / s),
    height: Math.round((rc.bottom - rc.top) / s),
  };
}

/**
 * Build the AppBar RECT (physical pixels) for a docked overlay on a display.
 * Uses full display bounds (same geometry as computeDockBounds) scaled to physical pixels.
 */
export function computeAppBarPhysicalRect(
  displayBoundsDip: Rect,
  position: DockPosition,
  thicknessDip: number,
  scaleFactor: number
): WinRect | null {
  const bounds = computeDockBounds(displayBoundsDip, position, thicknessDip);
  if (!bounds) return null;
  return dipRectToPhysical(bounds, scaleFactor);
}

/**
 * Shrink a work-area rect by the dock strip on the given edge (pure geometry).
 * Useful for tests and for documenting expected maximize behavior.
 */
export function computeReservedWorkArea(
  workArea: Rect,
  position: DockPosition,
  thickness: number
): Rect | null {
  if (position === 'floating') return null;
  const t = clampThickness(thickness);
  switch (position) {
    case 'left':
      return {
        x: workArea.x + t,
        y: workArea.y,
        width: Math.max(0, workArea.width - t),
        height: workArea.height,
      };
    case 'right':
      return {
        x: workArea.x,
        y: workArea.y,
        width: Math.max(0, workArea.width - t),
        height: workArea.height,
      };
    case 'top':
      return {
        x: workArea.x,
        y: workArea.y + t,
        width: workArea.width,
        height: Math.max(0, workArea.height - t),
      };
    case 'bottom':
      return {
        x: workArea.x,
        y: workArea.y,
        width: workArea.width,
        height: Math.max(0, workArea.height - t),
      };
    default:
      return null;
  }
}
