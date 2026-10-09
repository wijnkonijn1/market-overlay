/**
 * Windows: detect other Market Overlay main processes (e.g. a pre-1.1.6 copy
 * still running in the tray, or an old portable). Those builds had no
 * single-instance lock, so they keep their own docked window + AppBar, which
 * looks like "the dock grows back" / "too much space reserved".
 * We never kill silently: the user is asked first.
 */
import { execFile } from 'child_process';
import { dialog, type BrowserWindow } from 'electron';

export interface ProcInfo {
  pid: number;
  name: string;
  sessionId: number;
  commandLine: string;
  path: string;
}

const NAMES = ['MarketOverlay.exe', 'Market Overlay.exe'];

/** Pure filter (unit-tested): other main (non --type=) processes in our session. */
export function findOtherMainInstances(procs: ProcInfo[], selfPid: number): ProcInfo[] {
  const self = procs.find((p) => p.pid === selfPid);
  return procs.filter(
    (p) =>
      p.pid !== selfPid &&
      NAMES.some((n) => n.toLowerCase() === p.name.toLowerCase()) &&
      !/--type=/.test(p.commandLine || '') &&
      (self == null || p.sessionId === self.sessionId)
  );
}

function listProcesses(): Promise<ProcInfo[]> {
  const ps =
    "Get-CimInstance Win32_Process -Filter \"Name='MarketOverlay.exe' OR Name='Market Overlay.exe' OR ProcessId=" +
    process.pid +
    "\" | Select-Object ProcessId,Name,SessionId,CommandLine,ExecutablePath | ConvertTo-Json -Compress";
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', ps],
      { timeout: 10000, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout.trim()) return resolve([]);
        try {
          const raw = JSON.parse(stdout);
          const arr = Array.isArray(raw) ? raw : [raw];
          resolve(
            arr.map((r: Record<string, unknown>) => ({
              pid: Number(r.ProcessId),
              name: String(r.Name ?? ''),
              sessionId: Number(r.SessionId ?? 0),
              commandLine: String(r.CommandLine ?? ''),
              path: String(r.ExecutablePath ?? ''),
            }))
          );
        } catch {
          resolve([]);
        }
      }
    );
  });
}

export async function warnAboutOtherInstances(
  getWin: () => BrowserWindow | null,
  onClosed?: () => void
): Promise<void> {
  if (process.platform !== 'win32') return;
  const others = findOtherMainInstances(await listProcesses(), process.pid);
  if (!others.length) return;
  const list = others.map((p) => `• PID ${p.pid}: ${p.path || p.name}`).join('\n');
  console.warn(`[instances] other Market Overlay processes running:\n${list}`);
  const win = getWin();
  const opts = {
    type: 'warning' as const,
    title: 'Market Overlay',
    message: 'An older Market Overlay is still running',
    detail:
      `${list}\n\nIt keeps its own docked window and reserved screen space, ` +
      'so the dock can look like it grows back. Close it now?',
    buttons: ['Close old version', 'Ignore'],
    defaultId: 0,
    cancelId: 1,
  };
  const res = win && !win.isDestroyed() ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
  if (res.response !== 0) return;
  for (const p of others) {
    try {
      process.kill(p.pid);
    } catch (err) {
      console.warn(`[instances] could not close PID ${p.pid}:`, err);
    }
  }
  onClosed?.();
}
