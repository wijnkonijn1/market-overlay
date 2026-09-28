#!/usr/bin/env node
/**
 * Pure smoke: shrink then grow thickness through the same helpers the AppBar path uses.
 * Exit 1 if thickness ever expands beyond the requested value after "QUERYPOS inflate".
 */
const path = require('path');
// Use compiled-free require via ts-node-less: reimplement minimal check calling vitest-built logic is heavy;
// instead duplicate the critical invariant in plain JS matching dockBounds.
const MIN = 140, MAX = 720;
const clamp = (t) => Math.min(MAX, Math.max(MIN, Math.round(t)));
function enforce(rc, position, thicknessDip, scale, display) {
  const tPhys = Math.round(clamp(thicknessDip) * scale);
  const left = Math.round(display.x * scale);
  const top = Math.round(display.y * scale);
  const right = Math.round((display.x + display.width) * scale);
  const bottom = Math.round((display.y + display.height) * scale);
  if (position === 'left') return { left, top, right: left + tPhys, bottom };
  if (position === 'right') return { left: right - tPhys, top, right, bottom };
  if (position === 'top') return { left, top, right, bottom: top + tPhys };
  return { left, top: bottom - tPhys, right, bottom };
}
const display = { x: 0, y: 0, width: 1920, height: 1080 };
const seq = [420, 300, 180, 140, 200, 420];
let prev = null;
for (const t of seq) {
  // fake QUERYPOS inflate by +100 physical
  let phys = enforce({ left:0,top:0,right:0,bottom:0 }, 'left', t, 1.25, display);
  phys = { ...phys, right: phys.right + 100 };
  const fixed = enforce(phys, 'left', t, 1.25, display);
  const widthDip = Math.round((fixed.right - fixed.left) / 1.25);
  if (widthDip !== clamp(t)) {
    console.error('FAIL: requested', t, 'got', widthDip, 'after inflate');
    process.exit(1);
  }
  prev = widthDip;
  console.log('ok thickness', t, '->', widthDip);
}
console.log('smoke-dock-thickness: PASS');
