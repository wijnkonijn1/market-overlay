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
});
