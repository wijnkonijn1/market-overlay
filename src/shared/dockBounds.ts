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
