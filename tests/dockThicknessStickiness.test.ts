/**
 * Regression: dock thickness must stick after shrink + re-apply.
 * Pure helpers simulate the Windows AppBar / Electron ordering without FFI.
 */
import { describe, it, expect } from 'vitest';
import * as dock from '../src/shared/dockBounds';

const display = { x: 0, y: 0, width: 1920, height: 1080 };

/**
 * Simulate the apply sequence used on Windows after a user shrink:
 * persist thickness → compute exact dock rect → QUERYPOS may inflate →
 * enforce user thickness → reserved work area must match.
 */
function simulateApplySequence(
  position: 'left' | 'right' | 'top' | 'bottom',
  thicknessDip: number,
  scaleFactor: number,
  /** Fake shell QUERYPOS expansion along the thickness axis (physical px). */
  queryPosInflatePhys = 0
) {
  const t = dock.clampThickness(thicknessDip);
  const intended = dock.computeDockBounds(display, position, t)!;
  let physical = dock.dipRectToPhysical(intended, scaleFactor);

  // Shell QUERYPOS may expand the free edge (the bounce bug).
  if (queryPosInflatePhys > 0) {
    switch (position) {
      case 'left':
        physical = { ...physical, right: physical.right + queryPosInflatePhys };
        break;
      case 'right':
        physical = { ...physical, left: physical.left - queryPosInflatePhys };
        break;
      case 'top':
        physical = { ...physical, bottom: physical.bottom + queryPosInflatePhys };
        break;
      case 'bottom':
        physical = { ...physical, top: physical.top - queryPosInflatePhys };
        break;
    }
  }

  const enforced = dock.enforceAppBarUserThickness(
    physical,
    position,
    t,
    scaleFactor,
    display
  );
  const windowDip = dock.physicalRectToDip(enforced, scaleFactor);
  const reserved = dock.computeReservedWorkArea(
    { x: 0, y: 0, width: 1920, height: 1040 },
    position,
    t
  )!;

  return { t, intended, physical, enforced, windowDip, reserved };
}

describe('dock thickness stickiness (shrink bounce regression)', () => {
  it('enforceAppBarUserThickness undoes QUERYPOS inflation on left dock', () => {
    const { t, intended, windowDip, enforced } = simulateApplySequence(
      'left',
      200,
      1.25,
      150 // shell tried to grow by 150 physical px
    );
    expect(t).toBe(200);
    expect(windowDip.width).toBe(intended.width);
    expect(windowDip.width).toBe(200);
    // physical thickness axis = 200 * 1.25
    expect(enforced.right - enforced.left).toBe(250);
  });

  it('shrinking then re-applying keeps the same thickness (left)', () => {
    const first = simulateApplySequence('left', 420, 1, 0);
    const shrunk = simulateApplySequence('left', 180, 1, 80); // inflate attempt
    expect(first.windowDip.width).toBe(420);
    expect(shrunk.windowDip.width).toBe(180);
    expect(shrunk.reserved.x).toBe(180);
    expect(shrunk.reserved.width).toBe(1920 - 180);
  });

  it('shrinking then re-applying keeps the same thickness (right @ 150%)', () => {
    const shrunk = simulateApplySequence('right', 160, 1.5, 120);
    expect(shrunk.windowDip.width).toBe(160);
    expect(shrunk.enforced.right - shrunk.enforced.left).toBe(240); // 160 * 1.5
    expect(shrunk.reserved.width).toBe(1920 - 160);
  });

  it('top/bottom thickness sticks after QUERYPOS inflate', () => {
    const top = simulateApplySequence('top', 140, 1, 100);
    expect(top.windowDip.height).toBe(140);
    expect(top.reserved.y).toBe(140);

    const bottom = simulateApplySequence('bottom', 220, 1.25, 90);
    expect(bottom.windowDip.height).toBe(220);
    expect(bottom.reserved.height).toBe(1040 - 220);
  });

  it('boundsMatchDockThickness true only for exact user strip', () => {
    const bounds = dock.computeDockBounds(display, 'left', 200)!;
    expect(dock.boundsMatchDockThickness(bounds, 'left', 200, display)).toBe(true);
    expect(
      dock.boundsMatchDockThickness(
        { ...bounds, width: 280 },
        'left',
        200,
        display
      )
    ).toBe(false);
  });

  it('dockMinimumWindowSize allows MIN_DOCK_THICKNESS when docked', () => {
    expect(dock.dockMinimumWindowSize('left').minWidth).toBe(dock.MIN_DOCK_THICKNESS);
    expect(dock.dockMinimumWindowSize('bottom').minHeight).toBe(dock.MIN_DOCK_THICKNESS);
    expect(dock.dockMinimumWindowSize('floating').minWidth).toBe(280);
  });

  it('re-apply with same thickness is idempotent (no auto-grow)', () => {
    const a = simulateApplySequence('left', 240, 1, 50);
    const b = simulateApplySequence('left', 240, 1, 50);
    expect(a.windowDip).toEqual(b.windowDip);
    expect(a.windowDip.width).toBe(240);
  });

  it('reserved work area always tracks chosen thickness, not inflated QUERYPOS', () => {
    for (const t of [140, 200, 340, 420, 720]) {
      const seq = simulateApplySequence('left', t, 1.25, 200);
      expect(seq.reserved.x).toBe(t);
      expect(seq.windowDip.width).toBe(t);
    }
  });
});

describe('AppBar clear / floating paths (pure geometry)', () => {
  it('floating yields null dock bounds and null reserved work area', () => {
    expect(dock.computeDockBounds(display, 'floating', 420)).toBeNull();
    expect(dock.computeReservedWorkArea(display, 'floating', 420)).toBeNull();
    expect(dock.dockPositionToAppBarEdge('floating')).toBeNull();
    expect(dock.computeAppBarPhysicalRect(display, 'floating', 420, 1)).toBeNull();
  });

  it('enforceAppBarUserThickness is a no-op copy for floating', () => {
    const rc = { left: 1, top: 2, right: 3, bottom: 4 };
    const out = dock.enforceAppBarUserThickness(rc, 'floating', 200, 1, display);
    expect(out).toEqual(rc);
    expect(out).not.toBe(rc);
  });
});
