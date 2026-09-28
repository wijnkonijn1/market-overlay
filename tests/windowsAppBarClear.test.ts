/**
 * AppBar clear paths without Windows FFI (runs on Linux CI).
 * On non-win32, loadApi is null — remove must still reset state cleanly.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  removeWindowsAppBar,
  isWindowsAppBarRegistered,
  cancelPendingAppBarReassert,
  _resetWindowsAppBarStateForTests,
} from '../src/main/dock/windowsAppBar';

describe('windowsAppBar clear paths (non-Windows)', () => {
  beforeEach(() => {
    _resetWindowsAppBarStateForTests();
  });

  it('removeWindowsAppBar is safe when never registered', () => {
    const result = removeWindowsAppBar(null);
    expect(isWindowsAppBarRegistered()).toBe(false);
    // On Linux: API unavailable; still must not throw and must clear state
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/unavailable|no AppBar/i);
  });

  it('cancelPendingAppBarReassert does not throw', () => {
    expect(() => cancelPendingAppBarReassert()).not.toThrow();
    expect(isWindowsAppBarRegistered()).toBe(false);
  });

  it('floating/quit clear path: repeated removes stay idempotent', () => {
    removeWindowsAppBar(null);
    const second = removeWindowsAppBar(null);
    expect(isWindowsAppBarRegistered()).toBe(false);
    expect(second).toBeTruthy();
  });
});
