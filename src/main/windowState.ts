import { BrowserWindow, screen } from 'electron';
import { get, set } from './store';
import type { WindowState } from '../shared/types';

export function loadWindowState(): WindowState {
  return get('window');
}

export function saveWindowState(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  const bounds = win.getBounds();
  set('window', {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized: win.isMaximized(),
  });
}

export function attachWindowStateListeners(win: BrowserWindow): void {
  const save = () => saveWindowState(win);
  win.on('resize', save);
  win.on('move', save);
  win.on('maximize', save);
  win.on('unmaximize', save);
}

export function applyAlwaysOnTop(win: BrowserWindow, value: boolean): boolean {
  win.setAlwaysOnTop(Boolean(value), 'floating');
  return win.isAlwaysOnTop();
}

export function applyOpacity(win: BrowserWindow, percent: number): number {
  const opacity = Math.min(1, Math.max(0.2, Number(percent) / 100));
  win.setOpacity(opacity);
  return opacity;
}

export function getDisplayBoundsForWindow(win: BrowserWindow) {
  const bounds = win.getBounds();
  return screen.getDisplayMatching(bounds).bounds;
}
