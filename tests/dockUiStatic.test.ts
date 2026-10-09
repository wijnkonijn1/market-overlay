/**
 * Static guards for Windows-only UI pitfalls that Wine/mocks can't exercise.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.join(__dirname, '../src/renderer/styles/app.css'), 'utf8');
const handleTsx = fs.readFileSync(path.join(__dirname, '../src/renderer/components/DockResizeHandle.tsx'), 'utf8');
const settingsTsx = fs.readFileSync(path.join(__dirname, '../src/renderer/components/SettingsPanel.tsx'), 'utf8');

function block(selector: string): string {
  const i = css.indexOf(selector + ' {');
  expect(i, `css block ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(i, css.indexOf('}', i));
}

describe('dock resize handle (Windows hit-testing)', () => {
  it('is no-drag, topmost and receives pointer events', () => {
    const b = block('.dock-resize-handle');
    expect(b).toMatch(/-webkit-app-region:\s*no-drag/);
    expect(b).toMatch(/pointer-events:\s*auto/);
    const z = Number(/z-index:\s*(\d+)/.exec(b)?.[1]);
    expect(z).toBeGreaterThanOrEqual(1000);
  });
  it('is at least 6px wide/high with a resize cursor', () => {
    const v = block('.dock-resize-handle.edge-right,\n.dock-resize-handle.edge-left');
    expect(Number(/width:\s*(\d+)px/.exec(v)?.[1])).toBeGreaterThanOrEqual(6);
    expect(v).toMatch(/cursor:\s*ew-resize/);
    const h = block('.dock-resize-handle.edge-bottom,\n.dock-resize-handle.edge-top');
    expect(Number(/height:\s*(\d+)px/.exec(h)?.[1])).toBeGreaterThanOrEqual(6);
    expect(h).toMatch(/cursor:\s*ns-resize/);
  });
  it('uses screen coordinates and no-drag class', () => {
    expect(handleTsx).toMatch(/e\.screenX/);
    expect(handleTsx).not.toMatch(/e\.clientX : e\.clientY;\s*\n\s*let delta/);
    expect(handleTsx).toMatch(/no-drag/);
  });
});

describe('settings thickness controls', () => {
  it('has slider, numeric input and -/+ buttons that call update({ dockThickness })', () => {
    expect(settingsTsx).toMatch(/type="range"/);
    expect(settingsTsx).toMatch(/type="number"/);
    expect((settingsTsx.match(/update\(\{ dockThickness:/g) || []).length).toBeGreaterThanOrEqual(4);
  });
});
