#!/usr/bin/env node
/**
 * Make sure @koromix/koffi-win32-x64 (Windows native koffi.node) is present in
 * node_modules before packaging for Windows. On Linux build hosts npm skips the
 * optional dependency (os mismatch), which would silently ship a build where
 * the AppBar (work-area reservation) cannot load. Fetch via `npm pack` instead.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const VERSION = '3.3.2';
const root = path.resolve(__dirname, '..');
const dest = path.join(root, 'node_modules', '@koromix', 'koffi-win32-x64');
const nodeFile = path.join(dest, 'win32_x64', 'koffi.node');

function ok() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf8'));
    return pkg.version === VERSION && fs.existsSync(nodeFile);
  } catch {
    return false;
  }
}

if (ok()) {
  console.log(`[ensure-koffi-win] OK: ${nodeFile}`);
  process.exit(0);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'koffi-win-'));
execFileSync('npm', ['pack', `@koromix/koffi-win32-x64@${VERSION}`, '--silent'], { cwd: tmp, stdio: 'inherit' });
const tgz = fs.readdirSync(tmp).find((f) => f.endsWith('.tgz'));
if (!tgz) throw new Error('npm pack produced no tarball');
execFileSync('tar', ['xzf', tgz], { cwd: tmp });
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.cpSync(path.join(tmp, 'package'), dest, { recursive: true });
fs.rmSync(tmp, { recursive: true, force: true });
if (!ok()) {
  console.error('[ensure-koffi-win] FAILED: win32 koffi.node missing');
  process.exit(1);
}
console.log(`[ensure-koffi-win] installed ${nodeFile}`);
