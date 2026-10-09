import React, { useCallback, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { computeDragThickness } from '../../shared/dockBounds';
import type { DockPosition } from '../../shared/types';

function edgeClass(position: DockPosition): string {
  switch (position) {
    case 'left':
      return 'dock-resize-handle edge-right';
    case 'right':
      return 'dock-resize-handle edge-left';
    case 'top':
      return 'dock-resize-handle edge-bottom';
    case 'bottom':
      return 'dock-resize-handle edge-top';
    default:
      return 'dock-resize-handle';
  }
}

/**
 * Drag handle on the free (inner) edge of a docked window.
 * Updates dockThickness live and re-applies AppBar / strut via IPC.
 */
export function DockResizeHandle() {
  const position = useAppStore((s) => s.settings.dockPosition);
  const thickness = useAppStore((s) => s.settings.dockThickness);
  const dragging = useRef(false);
  const startRef = useRef({ axis: 0, thickness: 0 });
  const lastApplied = useRef(0);
  const pending = useRef<number | null>(null);
  const raf = useRef<number | null>(null);

  const flush = useCallback(() => {
    raf.current = null;
    const next = pending.current;
    if (next == null || next === lastApplied.current) return;
    lastApplied.current = next;
    useAppStore.setState((s) => ({
      settings: { ...s.settings, dockThickness: next },
    }));
    void window.marketOverlay.setDockThickness(next, 'drag').then((applied) => {
      // Main is authoritative; adopt what it actually applied.
      if (typeof applied === 'number' && applied !== next && pending.current === next) {
        useAppStore.setState((s) => ({ settings: { ...s.settings, dockThickness: applied } }));
      }
    });
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (position === 'floating') return;
      e.preventDefault();
      e.stopPropagation();
      dragging.current = true;
      startRef.current = {
        // SCREEN coords: the window moves under the pointer while a right/bottom
        // dock shrinks, so client coords would make the dock grow back.
        axis: position === 'left' || position === 'right' ? e.screenX : e.screenY,
        thickness,
      };
      lastApplied.current = thickness;
      pending.current = thickness;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* capture unsupported — moves still arrive while over the handle */
      }
      window.marketOverlay.dockUiLog?.(
        `drag start position=${position} thickness=${thickness} screen=${e.screenX},${e.screenY} client=${e.clientX},${e.clientY} dpr=${window.devicePixelRatio}`
      );
      document.body.classList.add('dock-resizing');
    },
    [position, thickness]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current || position === 'floating') return;
      const cur = position === 'left' || position === 'right' ? e.screenX : e.screenY;
      const next = computeDragThickness(position, startRef.current.axis, cur, startRef.current.thickness);
      pending.current = next;
      // Optimistic UI update every move
      useAppStore.setState((s) => ({
        settings: { ...s.settings, dockThickness: next },
      }));
      if (raf.current == null) {
        raf.current = window.requestAnimationFrame(flush);
      }
    },
    [position, flush]
  );

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.classList.remove('dock-resizing');
      window.marketOverlay.dockUiLog?.(`drag end pending=${pending.current} lastApplied=${lastApplied.current}`);
      if (raf.current != null) {
        window.cancelAnimationFrame(raf.current);
        raf.current = null;
      }
      flush();
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      // Thickness already applied via setDockThickness during drag; only persist
      // settings here so we do not race a second applyDock with a stale size.
      void useAppStore.getState().persist();
    },
    [flush]
  );

  if (position === 'floating') return null;

  return (
    <div
      className={`${edgeClass(position)} no-drag`}
      role="separator"
      aria-orientation={position === 'left' || position === 'right' ? 'vertical' : 'horizontal'}
      aria-label="Resize dock thickness"
      title="Drag to resize dock"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    />
  );
}
