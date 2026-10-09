#!/usr/bin/env node
/**
 * Pure smoke (no Electron): mirrors src/shared/dockBounds.ts reserve rules.
 * 1. Thickness never expands beyond the requested value after a fake QUERYPOS inflate.
 * 2. v1.1.6: reserved rect == dock window rect in physical px at 100/125/150/200%,
 *    and the reserve shrinks on shrink.
 */
const MIN = 140, MAX = 720;
const clamp = (t) => Math.min(MAX, Math.max(MIN, Math.round(t)));
function dockDip(display, position, t) {
  t = clamp(t);
  const { x, y, width, height } = display;
  if (position === 'left') return { x, y, width: Math.min(t, width), height };
  if (position === 'right') return { x: x + Math.max(0, width - t), y, width: Math.min(t, width), height };
  if (position === 'top') return { x, y, width, height: Math.min(t, height) };
  return { x, y: y + Math.max(0, height - t), width, height: Math.min(t, height) };
}
function toPhys(r, s) {
  const left = Math.round(r.x * s), top = Math.round(r.y * s);
  return { left, top, right: left + Math.round(r.width * s), bottom: top + Math.round(r.height * s) };
}
const thick = (rc, p) => (p === 'top' || p === 'bottom' ? rc.bottom - rc.top : rc.right - rc.left);
let fail = 0;
for (const s of [1, 1.25, 1.5, 2]) {
  const display = { x: 0, y: 0, width: Math.round(2560 / s), height: Math.round(1440 / s) };
  for (const p of ['left', 'right', 'top', 'bottom']) {
    let prev = Infinity;
    for (const t of [420, 300, 260, 180, 140]) {
      const win = toPhys(dockDip(display, p, t), s);
      // fake QUERYPOS inflate: must be ignored; reserve = window rect
      const reserve = { ...win };
      const r = thick(reserve, p), w = thick(win, p);
      if (r !== w || r !== Math.round(clamp(t) * s) || r >= prev) {
        console.error(`FAIL scale=${s} ${p} t=${t}: reserve=${r} window=${w} prev=${prev}`);
        fail++;
      }
      prev = r;
    }
    console.log(`ok scale=${s} ${p}: [dock] reserve=${prev} window=${prev} scale=${s} (after shrink to 140)`);
  }
}
if (fail) process.exit(1);
console.log('smoke-dock-thickness: PASS');
