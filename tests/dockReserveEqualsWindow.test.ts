/**
 * v1.1.6 regression: reserved work area must ALWAYS equal the docked window.
 * - pure geometry at 100/125/150/200% for 140/260/420
 * - shrink → reserve shrinks
 * - Windows AppBar path with an injected fake shell32/user32 (no FFI)
 * - Linux strut from the actual window rect
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as dock from '../src/shared/dockBounds';
import {
  registerWithApi,
  removeWindowsAppBar,
  getWindowsAppBarDpiCorrection,
  _resetWindowsAppBarStateForTests,
  type AppBarApi,
  type AppBarDataJs,
} from '../src/main/dock/windowsAppBar';
import type { DockPosition } from '../src/shared/types';

const SCALES = [1, 1.25, 1.5, 2];
const THICKNESSES = [140, 260, 420];
const POSITIONS: DockPosition[] = ['left', 'right', 'top', 'bottom'];
const PHYS_DISPLAY = { w: 2560, h: 1440 };

function displayDip(scale: number) {
  return { x: 0, y: 0, width: Math.round(PHYS_DISPLAY.w / scale), height: Math.round(PHYS_DISPLAY.h / scale) };
}

describe('planDockReserve: reserve rect == dock rect (physical px)', () => {
  for (const s of SCALES) {
    for (const t of THICKNESSES) {
      for (const pos of POSITIONS) {
        it(`scale ${s} thickness ${t} ${pos}`, () => {
          const plan = dock.planDockReserve(displayDip(s), pos, t, s)!;
          expect(plan).not.toBeNull();
          expect(plan.reservePhysical).toEqual(plan.dockPhysical);
          expect(plan.reservePx).toBe(plan.windowPx);
          expect(plan.reservePx).toBe(Math.round(t * s));
          // Never double-scaled
          if (s !== 1) expect(plan.reservePx).not.toBe(Math.round(t * s * s));
          // DIP thickness of the reserve equals the visible dock thickness
          expect(Math.round(plan.reservePx / s)).toBe(t);
          expect(dock.formatReserveLog(plan.reservePx, plan.windowPx, s)).toBe(
            `[dock] reserve=${Math.round(t * s)} window=${Math.round(t * s)} scale=${s}`
          );
        });
      }
    }
  }

  it('after shrink the reserve shrinks (every scale, every edge)', () => {
    for (const s of SCALES) {
      for (const pos of POSITIONS) {
        const px = [420, 260, 140].map((t) => dock.planDockReserve(displayDip(s), pos, t, s)!.reservePx);
        expect(px[0]).toBeGreaterThan(px[1]);
        expect(px[1]).toBeGreaterThan(px[2]);
      }
    }
  });

  it('follows the ACTUAL window rect, not the setting (e.g. OS clamped)', () => {
    const d = displayDip(1.25);
    const actual = { x: 0, y: 0, width: 150, height: d.height };
    const plan = dock.planDockReserve(d, 'left', 420, 1.25, actual)!;
    expect(plan.reservePx).toBe(Math.round(150 * 1.25));
  });

  it('secondary monitor with different DPI: origin mapped, scale applied once', () => {
    // Primary 1920x1080 @100%, secondary 2560x1440 @150% to the right.
    const secDip = { x: 1920, y: 0, width: 1707, height: 960 };
    const plan = dock.planDockReserve(secDip, 'left', 180, 1.5, undefined, { x: 1920, y: 0 })!;
    expect(plan.reservePhysical.left).toBe(1920); // NOT 1920*1.5
    expect(plan.reservePx).toBe(270);
    const right = dock.planDockReserve(secDip, 'right', 180, 1.5, undefined, { x: 1920, y: 0 })!;
    expect(right.reservePhysical.right - right.reservePhysical.left).toBe(270);
  });
});

/* ---------------------------- fake Windows path --------------------------- */

class FakeWin {
  bounds: dock.Rect;
  constructor(b: dock.Rect, public scale: number) {
    this.bounds = { ...b };
  }
  isDestroyed() { return false; }
  getBounds() { return { ...this.bounds }; }
  setBounds(b: dock.Rect) { this.bounds = { ...b }; }
  getNativeWindowHandle() {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(0x1234n);
    return buf;
  }
}

interface FakeShellOptions {
  /** Shell's effective scale on SETPOS rects (simulates DPI virtualization). */
  virtualizeFactor?: number;
  queryPosInflate?: number;
  taskbarInsetSameEdge?: number;
}

function makeFakeApi(win: FakeWin, display: dock.Rect, opts: FakeShellOptions = {}) {
  const calls: { msg: number; rc: dock.WinRect; edge: number }[] = [];
  let setpos: dock.WinRect | null = null;
  let edge = 0;
  const monitor = dock.windowDipToPhysical(display, win.scale);
  const api: AppBarApi = {
    sizeofAppBarData: 48,
    SHAppBarMessage: (msg: number, data: AppBarDataJs) => {
      calls.push({ msg, rc: { ...data.rc }, edge: data.uEdge });
      if (msg === 2 && opts.queryPosInflate) {
        data.rc.right += opts.queryPosInflate; // shell grows proposal
      }
      if (msg === 3) { setpos = { ...data.rc }; edge = data.uEdge; }
      if (msg === 1) setpos = null;
      return 1;
    },
    getWindowRect: () => dock.windowDipToPhysical(win.getBounds(), win.scale),
    getMonitorInfo: () => {
      const work = { ...monitor };
      const f = opts.virtualizeFactor ?? 1;
      // Static taskbar at the bottom (stacks with an AppBar on the same edge)
      work.bottom -= opts.taskbarInsetSameEdge ?? 0;
      const pos: DockPosition = (['left', 'top', 'right', 'bottom'] as const)[edge];
      const t = setpos ? Math.round(dock.winRectThickness(setpos, pos) * f) : 0;
      if (pos === 'left') work.left += t;
      if (pos === 'right') work.right -= t;
      if (pos === 'top') work.top += t;
      if (pos === 'bottom') work.bottom -= t;
      return { monitor, work, id: 'mon1' };
    },
  };
  return { api, calls, getSetpos: () => setpos };
}

describe('registerWithApi (fake shell32): SETPOS rect == window rect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetWindowsAppBarStateForTests();
  });
  afterEach(() => {
    _resetWindowsAppBarStateForTests();
    vi.useRealTimers();
  });

  for (const s of SCALES) {
    it(`scale ${s}: drag shrink 420→260→140 then grow; reserve tracks window`, () => {
      const d = displayDip(s);
      const win = new FakeWin({ x: 300, y: 200, width: 600, height: 400 }, s);
      const { api, getSetpos } = makeFakeApi(win, d, { queryPosInflate: 500 });
      const logs: string[] = [];
      let prevPx = Infinity;
      for (const t of [420, 260, 140]) {
        const bounds = dock.computeDockBounds(d, 'left', t)!;
        win.setBounds(bounds); // applyDock sets bounds first
        const r = registerWithApi(api, win as never, d, 'left', t, {
          toPhysical: (dip) => dock.windowDipToPhysical(dip, s),
          scaleFactor: s,
          log: (l) => logs.push(l),
        });
        expect(r.ok).toBe(true);
        const sp = getSetpos()!;
        const wr = dock.windowDipToPhysical(win.getBounds(), s);
        expect(sp).toEqual(wr); // QUERYPOS inflation ignored
        expect(r.reservePx).toBe(r.windowPx);
        expect(r.reservePx).toBe(Math.round(t * s));
        expect(r.reservePx!).toBeLessThan(prevPx);
        prevPx = r.reservePx!;
        vi.advanceTimersByTime(1500);
        expect(getSetpos()).toEqual(wr); // re-assert/verify did not change it
      }
      expect(logs.some((l) => l.startsWith(`[dock] reserve=${Math.round(140 * s)} window=${Math.round(140 * s)} scale=${s}`))).toBe(true);
      expect(logs.some((l) => /\[dock\] verify reserve=(\d+) window=\1 /.test(l))).toBe(true);
      // grow again
      win.setBounds(dock.computeDockBounds(d, 'left', 300)!);
      const g = registerWithApi(api, win as never, d, 'left', 300, {
        toPhysical: (dip) => dock.windowDipToPhysical(dip, s),
        scaleFactor: s,
        log: () => {},
      });
      expect(g.reservePx).toBe(Math.round(300 * s));
    });
  }

  it('slider path: thickness change re-reserves exactly the new window size', () => {
    const s = 1.25;
    const d = displayDip(s);
    const win = new FakeWin(dock.computeDockBounds(d, 'right', 420)!, s);
    const { api, getSetpos } = makeFakeApi(win, d);
    for (const t of [400, 333, 201, 140]) {
      win.setBounds(dock.computeDockBounds(d, 'right', t)!);
      registerWithApi(api, win as never, d, 'right', t, {
        toPhysical: (dip) => dock.windowDipToPhysical(dip, s), scaleFactor: s, log: () => {},
      });
      expect(dock.winRectThickness(getSetpos()!, 'right')).toBe(Math.round(t * s));
      expect(getSetpos()!.right).toBe(PHYS_DISPLAY.w);
    }
  });

  it('measures the window itself even if the caller did not setBounds yet', () => {
    const s = 1.5;
    const d = displayDip(s);
    const win = new FakeWin({ x: 10, y: 10, width: 900, height: 500 }, s);
    const { api, getSetpos } = makeFakeApi(win, d);
    registerWithApi(api, win as never, d, 'left', 200, {
      toPhysical: (dip) => dock.windowDipToPhysical(dip, s), scaleFactor: s, log: () => {},
    });
    expect(win.getBounds().width).toBe(200);
    expect(dock.winRectThickness(getSetpos()!, 'left')).toBe(300);
  });

  it('taskbar on the same edge is baseline, not counted as over-reservation', () => {
    const s = 1;
    const d = displayDip(s);
    const win = new FakeWin(dock.computeDockBounds(d, 'bottom', 180)!, s);
    const { api, getSetpos } = makeFakeApi(win, d, { taskbarInsetSameEdge: 48 });
    registerWithApi(api, win as never, d, 'bottom', 180, {
      toPhysical: (dip) => dock.windowDipToPhysical(dip, s), scaleFactor: s, log: () => {},
    });
    vi.advanceTimersByTime(1500);
    expect(getWindowsAppBarDpiCorrection()).toBe(1);
    expect(dock.winRectThickness(getSetpos()!, 'bottom')).toBe(180);
  });

  it('shell DPI-virtualizes the rect (x1.5): verify detects and corrects so effective == window', () => {
    const s = 1.5;
    const d = displayDip(s);
    const win = new FakeWin(dock.computeDockBounds(d, 'left', 180)!, s);
    const { api, getSetpos } = makeFakeApi(win, d, { virtualizeFactor: 1.5 });
    const logs: string[] = [];
    const opts = { toPhysical: (dip: dock.Rect) => dock.windowDipToPhysical(dip, s), scaleFactor: s, log: (l: string) => logs.push(l) };
    registerWithApi(api, win as never, d, 'left', 180, opts);
    vi.advanceTimersByTime(1500);
    expect(getWindowsAppBarDpiCorrection()).toBeCloseTo(1.5, 2);
    const effective = Math.round(dock.winRectThickness(getSetpos()!, 'left') * 1.5);
    expect(Math.abs(effective - 270)).toBeLessThanOrEqual(1);
    // subsequent shrink stays corrected immediately
    win.setBounds(dock.computeDockBounds(d, 'left', 140)!);
    registerWithApi(api, win as never, d, 'left', 140, opts);
    const eff2 = Math.round(dock.winRectThickness(getSetpos()!, 'left') * 1.5);
    expect(Math.abs(eff2 - 210)).toBeLessThanOrEqual(1);
    vi.advanceTimersByTime(1500);
    expect(logs.some((l) => l.includes('corrected over-reservation'))).toBe(true);
  });

  it('edge change removes the old AppBar before registering the new edge; remove clears', () => {
    const s = 1;
    const d = displayDip(s);
    const win = new FakeWin(dock.computeDockBounds(d, 'left', 200)!, s);
    const { api, calls, getSetpos } = makeFakeApi(win, d);
    const opts = { toPhysical: (dip: dock.Rect) => dock.windowDipToPhysical(dip, s), scaleFactor: s, log: () => {} };
    registerWithApi(api, win as never, d, 'left', 200, opts);
    win.setBounds(dock.computeDockBounds(d, 'top', 200)!);
    registerWithApi(api, win as never, d, 'top', 200, opts);
    const msgs = calls.map((c) => c.msg);
    const removeIdx = msgs.indexOf(1);
    expect(removeIdx).toBeGreaterThan(0);
    expect(msgs.slice(removeIdx + 1)).toContain(0);
    expect(dock.winRectThickness(getSetpos()!, 'top')).toBe(200);
    const r = removeWindowsAppBar(win as never);
    expect(r.ok).toBe(true);
    expect(getSetpos()).toBeNull();
  });
});

describe('Linux strut from actual window', () => {
  it('single monitor: strut == window thickness at every scale', () => {
    for (const s of SCALES) {
      for (const t of THICKNESSES) {
        const d = displayDip(s);
        for (const pos of POSITIONS) {
          const w = dock.computeDockBounds(d, pos, t)!;
          const st = dock.computeStrutFromWindow(w, d, pos, s)!;
          const v = pos === 'left' ? st.left : pos === 'right' ? st.right : pos === 'top' ? st.top : st.bottom;
          expect(v).toBe(Math.round(t * s));
        }
      }
    }
  });

  it('right dock on the left monitor of two: measured from root right edge', () => {
    const root = { x: 0, y: 0, width: 3840, height: 1080 };
    const leftMon = { x: 0, y: 0, width: 1920, height: 1080 };
    const w = dock.computeDockBounds(leftMon, 'right', 200)!;
    const st = dock.computeStrutFromWindow(w, root, 'right', 1)!;
    expect(st.right).toBe(3840 - (1920 - 200));
    expect(st.right_start_y).toBe(0);
    expect(st.right_end_y).toBe(1079);
  });
});
