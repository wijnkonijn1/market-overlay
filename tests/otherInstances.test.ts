import { describe, it, expect, vi } from 'vitest';
vi.mock('electron', () => ({ dialog: {} }));
import { findOtherMainInstances } from '../src/main/otherInstances';

describe('findOtherMainInstances', () => {
  const procs = [
    { pid: 10, name: 'MarketOverlay.exe', sessionId: 1, commandLine: '"C:\\a\\MarketOverlay.exe"', path: 'C:\\a\\MarketOverlay.exe' },
    { pid: 11, name: 'MarketOverlay.exe', sessionId: 1, commandLine: 'MarketOverlay.exe --type=renderer', path: '' },
    { pid: 20, name: 'Market Overlay.exe', sessionId: 1, commandLine: '"C:\\old\\Market Overlay.exe"', path: 'C:\\old\\Market Overlay.exe' },
    { pid: 21, name: 'Market Overlay.exe', sessionId: 1, commandLine: '"Market Overlay.exe" --type=gpu-process', path: '' },
    { pid: 30, name: 'MarketOverlay.exe', sessionId: 2, commandLine: 'MarketOverlay.exe', path: '' },
  ];
  it('finds the old-name main process in our session, ignores self/children/other sessions', () => {
    expect(findOtherMainInstances(procs, 10).map((p) => p.pid)).toEqual([20]);
  });
  it('nothing else running → empty', () => {
    expect(findOtherMainInstances(procs.slice(0, 2), 10)).toEqual([]);
  });
});
