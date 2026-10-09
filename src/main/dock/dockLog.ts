/**
 * Persistent dock diagnostics: <userData>/logs/dock.log
 * (Windows: %APPDATA%\market-overlay\logs\dock.log). Rotates at 1 MB to dock.log.1.
 * Every thickness request, setBounds requested vs getBounds, AppBar rects and
 * re-apply triggers are written here with a source tag so field failures can be
 * diagnosed from a log the user sends us.
 */
import fs from 'fs';
import path from 'path';

const MAX_BYTES = 1024 * 1024;
let dir: string | null | undefined;

function resolveDir(): string | null {
  if (dir !== undefined) return dir;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron');
    const base = app?.getPath?.('userData');
    dir = base ? path.join(base, 'logs') : null;
  } catch {
    dir = null;
  }
  return dir;
}

export function getDockLogDir(): string | null {
  return resolveDir();
}

export function getDockLogPath(): string | null {
  const d = resolveDir();
  return d ? path.join(d, 'dock.log') : null;
}

export function dockLog(tag: string, msg: string): void {
  const line = `${new Date().toISOString()} [${tag}] ${msg}`;
  console.log(`[dock] ${tag}: ${msg}`);
  const file = getDockLogPath();
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      if (fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, `${file}.1`);
    } catch { /* no file yet */ }
    fs.appendFileSync(file, line + '\n');
  } catch { /* never let logging break docking */ }
}

/** Test helper. */
export function _setDockLogDirForTests(d: string | null): void {
  dir = d;
}
