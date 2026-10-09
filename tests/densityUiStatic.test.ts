import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..');
const app = readFileSync(join(root, 'src/renderer/App.tsx'), 'utf8');
const css = readFileSync(join(root, 'src/renderer/styles/app.css'), 'utf8');

describe('medium density rows fit at 150px (v1.1.9)', () => {
  it('medium rows render % change only, compact hides change', () => {
    expect(app).toMatch(/showChange = density !== 'compact'/);
    expect(app).toMatch(/percentOnly = density === 'medium'/);
    expect(app).toMatch(/formatPercentChange\(q\.changePercent\)/);
  });
  it('price and % never wrap; only the ticker may ellipsis', () => {
    expect(css).toMatch(/\.row-medium \{ grid-template-columns: minmax\(0, 1fr\) auto auto/);
    expect(css).toMatch(/\.row-medium \.price \{[^}]*white-space: nowrap/);
    expect(css).toMatch(/\.row-medium \.chg \{[^}]*white-space: nowrap/);
    expect(css).not.toMatch(/\.price \{[^}]*text-overflow/);
  });
});
