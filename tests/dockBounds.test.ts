import { describe, it, expect } from 'vitest';
import * as dock from '../src/shared/dockBounds';

const display = { x: 0, y: 0, width: 1920, height: 1080 };

describe('dockBounds', () => {
  it('clamps thickness', () => {
    expect(dock.clampThickness(50)).toBeGreaterThanOrEqual(200);
    expect(dock.clampThickness(9999)).toBeLessThanOrEqual(800);
  });

  it('left/right strips', () => {
    const left = dock.computeDockBounds(display, 'left', 420)!;
    expect(left.width).toBe(420);
    expect(left.height).toBe(1080);
    const right = dock.computeDockBounds(display, 'right', 420)!;
    expect(right.x).toBe(1920 - 420);
  });

  it('top/bottom strips', () => {
    const top = dock.computeDockBounds(display, 'top', 300)!;
    expect(top.height).toBe(300);
    const bottom = dock.computeDockBounds(display, 'bottom', 300)!;
    expect(bottom.y).toBe(1080 - 300);
  });

  it('floating null', () => {
    expect(dock.computeDockBounds(display, 'floating', 420)).toBeNull();
  });

  it('thicknessFromBounds', () => {
    expect(dock.thicknessFromBounds('left', { x: 0, y: 0, width: 400, height: 1080 })).toBe(400);
  });

  it('strut partial', () => {
    const strut = dock.computeStrutPartial(display, 'right', 420)!;
    expect(strut.right).toBeGreaterThan(0);
  });

  it('platform support', () => {
    expect(dock.platformDockSupport('linux')).toBe('strut');
    expect(dock.platformDockSupport('darwin')).toBe('snap-only');
    expect(dock.platformDockSupport('win32')).toBe('appbar');
  });

  it('appbar edge mapping', () => {
    expect(dock.dockPositionToAppBarEdge('left')).toBe(0);
    expect(dock.dockPositionToAppBarEdge('top')).toBe(1);
    expect(dock.dockPositionToAppBarEdge('right')).toBe(2);
    expect(dock.dockPositionToAppBarEdge('bottom')).toBe(3);
    expect(dock.dockPositionToAppBarEdge('floating')).toBeNull();
  });

  it('dip <-> physical rect conversion', () => {
    const dip = { x: 100, y: 200, width: 420, height: 1080 };
    const phys = dock.dipRectToPhysical(dip, 1.5);
    expect(phys).toEqual({ left: 150, top: 300, right: 780, bottom: 1920 });
    const back = dock.physicalRectToDip(phys, 1.5);
    expect(back).toEqual(dip);
  });

  it('computeAppBarPhysicalRect left @ 125%', () => {
    const rc = dock.computeAppBarPhysicalRect(display, 'left', 400, 1.25)!;
    expect(rc.left).toBe(0);
    expect(rc.top).toBe(0);
    expect(rc.right).toBe(500); // 400 * 1.25
    expect(rc.bottom).toBe(1350); // 1080 * 1.25
  });

  it('computeReservedWorkArea shrinks correctly', () => {
    const wa = { x: 0, y: 0, width: 1920, height: 1040 }; // taskbar already excluded
    const left = dock.computeReservedWorkArea(wa, 'left', 420)!;
    expect(left.x).toBe(420);
    expect(left.width).toBe(1500);
    const right = dock.computeReservedWorkArea(wa, 'right', 420)!;
    expect(right.width).toBe(1500);
    expect(right.x).toBe(0);
    const top = dock.computeReservedWorkArea(wa, 'top', 300)!;
    expect(top.y).toBe(300);
    expect(top.height).toBe(740);
    const bottom = dock.computeReservedWorkArea(wa, 'bottom', 300)!;
    expect(bottom.height).toBe(740);
    expect(dock.computeReservedWorkArea(wa, 'floating', 420)).toBeNull();
  });

});
