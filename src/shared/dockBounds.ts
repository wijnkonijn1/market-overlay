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

/** Minimum strip size (px) — enough for symbol + price in compact mode */
export const MIN_DOCK_THICKNESS = 140;
/** Maximum strip size (px) */
export const MAX_DOCK_THICKNESS = 720;
export const DEFAULT_DOCK_THICKNESS = 210;
/** Default before v1.1.7 (migrated to DEFAULT_DOCK_THICKNESS if never user-set). */
export const LEGACY_DEFAULT_DOCK_THICKNESS = 420;

/**
 * Below this thickness (width for L/R, height for T/B), rows show symbol + price only.
 */
export const COMPACT_DOCK_THRESHOLD = 200;
/**
 * Below this (and ≥ compact threshold), rows show symbol + price + change (no name/meta).
 */
export const MEDIUM_DOCK_THRESHOLD = 300;

export type DockRowDensity = 'compact' | 'medium' | 'full';

export function clampThickness(thickness: number): number {
  if (!Number.isFinite(thickness)) return DEFAULT_DOCK_THICKNESS;
  return Math.min(MAX_DOCK_THICKNESS, Math.max(MIN_DOCK_THICKNESS, Math.round(thickness)));
}

/**
 * Row density for a docked strip based on thickness.
 * Floating mode always uses full density (window can be resized freely).
 * Vertical dock (left/right) uses width; horizontal (top/bottom) uses height —
 * both are passed as `thickness`.
 */
export function dockRowDensity(
  position: DockPosition,
  thickness: number
): DockRowDensity {
  if (position === 'floating') return 'full';
  const t = clampThickness(thickness);
  if (t < COMPACT_DOCK_THRESHOLD) return 'compact';
  if (t < MEDIUM_DOCK_THRESHOLD) return 'medium';
  return 'full';
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
 * After ABM_QUERYPOS the shell may adjust the proposed RECT. Force the thickness
 * axis back to the user-chosen size (never expand past it). Keeps the dock
 * pinned to the display edge; the free/inner edge moves.
 *
 * Physical pixels. `thicknessDip` is the user setting in Electron DIP units.
 */
export function enforceAppBarUserThickness(
  rc: WinRect,
  position: DockPosition,
  thicknessDip: number,
  scaleFactor: number,
  displayBoundsDip: Rect
): WinRect {
  if (position === 'floating') return { ...rc };
  const s = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
  const tPhys = Math.round(clampThickness(thicknessDip) * s);
  const display = dipRectToPhysical(displayBoundsDip, scaleFactor);
  switch (position) {
    case 'left':
      return {
        left: display.left,
        top: display.top,
        right: display.left + tPhys,
        bottom: display.bottom,
      };
    case 'right':
      return {
        left: display.right - tPhys,
        top: display.top,
        right: display.right,
        bottom: display.bottom,
      };
    case 'top':
      return {
        left: display.left,
        top: display.top,
        right: display.right,
        bottom: display.top + tPhys,
      };
    case 'bottom':
      return {
        left: display.left,
        top: display.bottom - tPhys,
        right: display.right,
        bottom: display.bottom,
      };
    default:
      return { ...rc };
  }
}

/**
 * True when window bounds already match the dock strip for position+thickness
 * (within 1px rounding tolerance). Used to skip no-op setBounds / re-asserts.
 */
export function boundsMatchDockThickness(
  bounds: Rect,
  position: DockPosition,
  thickness: number,
  displayBounds: Rect
): boolean {
  const expected = computeDockBounds(displayBounds, position, thickness);
  if (!expected) return false;
  return (
    Math.abs(bounds.x - expected.x) <= 1 &&
    Math.abs(bounds.y - expected.y) <= 1 &&
    Math.abs(bounds.width - expected.width) <= 1 &&
    Math.abs(bounds.height - expected.height) <= 1
  );
}

/**
 * Electron BrowserWindow minimum size while docked so thickness can reach
 * MIN_DOCK_THICKNESS. Floating keeps a more comfortable default.
 */
export function dockMinimumWindowSize(
  position: DockPosition
): { minWidth: number; minHeight: number } {
  if (position === 'left' || position === 'right') {
    return { minWidth: MIN_DOCK_THICKNESS, minHeight: 1 };
  }
  if (position === 'top' || position === 'bottom') {
    return { minWidth: 1, minHeight: MIN_DOCK_THICKNESS };
  }
  return { minWidth: 280, minHeight: 200 };
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

/* ------------------------------------------------------------------------- */
/* v1.1.6: reserve == actual dock window (single source of truth)            */
/* ------------------------------------------------------------------------- */

/**
 * Thickness of a physical RECT along the dock axis
 * (width for left/right, height for top/bottom).
 */
export function winRectThickness(rc: WinRect, position: DockPosition): number {
  if (position === 'top' || position === 'bottom') return rc.bottom - rc.top;
  return rc.right - rc.left;
}

/** Thickness of a DIP rect along the dock axis. */
export function rectThickness(rect: Rect, position: DockPosition): number {
  if (position === 'top' || position === 'bottom') return rect.height;
  return rect.width;
}

/**
 * Convert a window rect (DIP) to physical pixels for the display it is on.
 *
 * Mirrors Electron's per-display mapping on Windows:
 *   physical = displayPhysicalOrigin + (dip - displayDipOrigin) * scale
 * For the primary monitor (or single monitor) the origins are equal, so this is
 * just `dip * scale`. The scale factor is applied exactly ONCE, and the far
 * edge is derived from the rounded width/height so the physical thickness never
 * drifts by a rounding pixel relative to the near edge.
 */
export function windowDipToPhysical(
  windowDip: Rect,
  scaleFactor: number,
  displayDipOrigin: { x: number; y: number } = { x: 0, y: 0 },
  displayPhysicalOrigin: { x: number; y: number } = displayDipOrigin
): WinRect {
  const s = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
  const left = Math.round(displayPhysicalOrigin.x + (windowDip.x - displayDipOrigin.x) * s);
  const top = Math.round(displayPhysicalOrigin.y + (windowDip.y - displayDipOrigin.y) * s);
  return {
    left,
    top,
    right: left + Math.round(windowDip.width * s),
    bottom: top + Math.round(windowDip.height * s),
  };
}

/**
 * The AppBar reservation rect for a docked window: exactly the window's own
 * physical rect. No re-derivation from display bounds or from the persisted
 * setting — whatever the dock actually occupies is what gets reserved.
 * Returns null for floating or an empty window rect.
 */
export function computeReserveRectFromWindow(
  windowPhysical: WinRect,
  position: DockPosition
): WinRect | null {
  if (position === 'floating') return null;
  if (windowPhysical.right <= windowPhysical.left) return null;
  if (windowPhysical.bottom <= windowPhysical.top) return null;
  return { ...windowPhysical };
}

export interface DockReservePlan {
  /** Dock window rect in DIP (what we setBounds to). */
  dockDip: Rect;
  /** Dock window rect in physical px. */
  dockPhysical: WinRect;
  /** Reserved AppBar rect in physical px (== dockPhysical). */
  reservePhysical: WinRect;
  /** Reserved thickness in physical px. */
  reservePx: number;
  /** Window thickness in physical px. */
  windowPx: number;
  scaleFactor: number;
}

/**
 * Pure end-to-end plan used by tests and as a reference for the runtime path:
 * display + thickness → dock rect (DIP) → physical (scale once) → reserve.
 * `windowDipOverride` lets callers pass the window's *actual* getBounds() after
 * setBounds (e.g. if the OS clamped it) — the reserve follows the actual window.
 */
export function planDockReserve(
  displayBoundsDip: Rect,
  position: DockPosition,
  thickness: number,
  scaleFactor: number,
  windowDipOverride?: Rect,
  displayPhysicalOrigin?: { x: number; y: number }
): DockReservePlan | null {
  const dockDip = windowDipOverride ?? computeDockBounds(displayBoundsDip, position, thickness);
  if (!dockDip) return null;
  const dockPhysical = windowDipToPhysical(
    dockDip,
    scaleFactor,
    { x: displayBoundsDip.x, y: displayBoundsDip.y },
    displayPhysicalOrigin ?? { x: displayBoundsDip.x, y: displayBoundsDip.y }
  );
  const reservePhysical = computeReserveRectFromWindow(dockPhysical, position);
  if (!reservePhysical) return null;
  return {
    dockDip,
    dockPhysical,
    reservePhysical,
    reservePx: winRectThickness(reservePhysical, position),
    windowPx: winRectThickness(dockPhysical, position),
    scaleFactor,
  };
}

/** Debug line required for field diagnostics. */
export function formatReserveLog(reservePx: number, windowPx: number, scale: number): string {
  return `[dock] reserve=${reservePx} window=${windowPx} scale=${scale}`;
}

/**
 * Reserved thickness (DIP) as observed from the display's work area after the
 * shell applied our AppBar. Includes any other AppBar/taskbar on the same edge,
 * so callers should compare against a baseline (work area without our AppBar).
 */
export function observedReserveFromWorkArea(
  displayBoundsDip: Rect,
  workAreaDip: Rect,
  position: DockPosition
): number {
  switch (position) {
    case 'left':
      return workAreaDip.x - displayBoundsDip.x;
    case 'right':
      return displayBoundsDip.x + displayBoundsDip.width - (workAreaDip.x + workAreaDip.width);
    case 'top':
      return workAreaDip.y - displayBoundsDip.y;
    case 'bottom':
      return displayBoundsDip.y + displayBoundsDip.height - (workAreaDip.y + workAreaDip.height);
    default:
      return 0;
  }
}

/**
 * If the shell reserved more than the window (observed / expected ≈ k), return a
 * physical rect whose thickness is divided by k so the effective reservation
 * equals the window. Only corrects a consistent scale-like ratio (>= 1.1) —
 * that is the signature of the rect being DPI-scaled a second time
 * (DPI virtualization). Returns null if no correction is warranted.
 */
export function correctOverReservedRect(
  reservePhysical: WinRect,
  position: DockPosition,
  expectedDip: number,
  observedDip: number
): WinRect | null {
  if (!(expectedDip > 0) || !(observedDip > 0)) return null;
  const ratio = observedDip / expectedDip;
  if (ratio < 1.1 || ratio > 4.5) return null;
  const t = winRectThickness(reservePhysical, position);
  const nt = Math.max(1, Math.round(t / ratio));
  switch (position) {
    case 'left':
      return { ...reservePhysical, right: reservePhysical.left + nt };
    case 'right':
      return { ...reservePhysical, left: reservePhysical.right - nt };
    case 'top':
      return { ...reservePhysical, bottom: reservePhysical.top + nt };
    case 'bottom':
      return { ...reservePhysical, top: reservePhysical.bottom - nt };
    default:
      return null;
  }
}

/**
 * X11 strut from the actual window rect (DIP) on the root window (union of all
 * displays, DIP). X11 struts are in physical root-window pixels and measured
 * from the root edges, so right/bottom are root edge minus the window's inner
 * edge (correct on multi-monitor layouts too). Scale applied once.
 */
export function computeStrutFromWindow(
  windowDip: Rect,
  rootDip: Rect,
  position: DockPosition,
  scaleFactor: number
): StrutPartial | null {
  if (position === 'floating') return null;
  const s = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
  const w = windowDipToPhysical(windowDip, s);
  const root = windowDipToPhysical(rootDip, s);
  const empty: StrutPartial = {
    left: 0, right: 0, top: 0, bottom: 0,
    left_start_y: 0, left_end_y: 0,
    right_start_y: 0, right_end_y: 0,
    top_start_x: 0, top_end_x: 0,
    bottom_start_x: 0, bottom_end_x: 0,
  };
  switch (position) {
    case 'left':
      return { ...empty, left: w.right - root.left, left_start_y: w.top, left_end_y: w.bottom - 1 };
    case 'right':
      return { ...empty, right: root.right - w.left, right_start_y: w.top, right_end_y: w.bottom - 1 };
    case 'top':
      return { ...empty, top: w.bottom - root.top, top_start_x: w.left, top_end_x: w.right - 1 };
    case 'bottom':
      return { ...empty, bottom: root.bottom - w.top, bottom_start_x: w.left, bottom_end_x: w.right - 1 };
    default:
      return null;
  }
}

/**
 * Physical px the work area is inset from the monitor on the dock edge
 * (Win32 rcMonitor vs rcWork). Includes the taskbar if it shares the edge.
 */
export function edgeInsetPhysical(
  monitor: WinRect,
  work: WinRect,
  position: DockPosition
): number {
  switch (position) {
    case 'left':
      return work.left - monitor.left;
    case 'right':
      return monitor.right - work.right;
    case 'top':
      return work.top - monitor.top;
    case 'bottom':
      return monitor.bottom - work.bottom;
    default:
      return 0;
  }
}

/**
 * Thickness during an inner-edge drag, from SCREEN coordinates.
 *
 * Must use screenX/screenY, not clientX/clientY: for right/bottom docks the
 * window's origin moves while it shrinks, so client coordinates shift under the
 * pointer and the computed delta collapses → the dock "grows back" (v1.1.3–1.1.6 bug).
 */
export function computeDragThickness(
  position: DockPosition,
  startScreen: number,
  currentScreen: number,
  startThickness: number
): number {
  let delta = currentScreen - startScreen;
  if (position === 'right' || position === 'bottom') delta = -delta;
  return clampThickness(startThickness + delta);
}

/** Dock fields owned by the main process (renderer full-state saves must not overwrite them). */
export const MAIN_OWNED_DOCK_KEYS = [
  'dockPosition',
  'dockThickness',
  'reserveWorkArea',
  'dockThicknessUserSet',
  'settingsSchema',
] as const;

/**
 * One-time migration: the old default (420) opened far too wide. If the user
 * never changed the thickness, move to the new default; a user-set value stays.
 */
export function migrateDockSettings<
  T extends { dockThickness?: number; dockThicknessUserSet?: boolean; settingsSchema?: number }
>(settings: T): { settings: T & { settingsSchema: number }; changed: boolean } {
  if ((settings.settingsSchema ?? 1) >= 2) {
    return { settings: settings as T & { settingsSchema: number }, changed: false };
  }
  const next = { ...settings, settingsSchema: 2 } as T & { settingsSchema: number };
  if (
    !settings.dockThicknessUserSet &&
    (settings.dockThickness == null || settings.dockThickness === LEGACY_DEFAULT_DOCK_THICKNESS)
  ) {
    next.dockThickness = DEFAULT_DOCK_THICKNESS;
  }
  return { settings: next, changed: true };
}
