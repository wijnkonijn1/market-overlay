import React, { useCallback, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { clampThickness } from '../../shared/dockBounds';
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
    void window.marketOverlay.setDockThickness(next);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (position === 'floating') return;
      e.preventDefault();
      e.stopPropagation();
      dragging.current = true;
      startRef.current = {
        axis: position === 'left' || position === 'right' ? e.clientX : e.clientY,
        thickness,
      };
      lastApplied.current = thickness;
      pending.current = thickness;
      e.currentTarget.setPointerCapture(e.pointerId);
      document.body.classList.add('dock-resizing');
    },
    [position, thickness]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current || position === 'floating') return;
      const cur = position === 'left' || position === 'right' ? e.clientX : e.clientY;
      let delta = cur - startRef.current.axis;
      if (position === 'right' || position === 'bottom') delta = -delta;
      const next = clampThickness(startRef.current.thickness + delta);
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
