/**
 * React to OS-driven window/display changes while docked.
 *
 * Two cases:
 *  - The USER resized the window natively (Windows gives frameless resizable
 *    windows an invisible resize border on every edge — on a right dock the
 *    native left-edge border sits exactly where our 6px HTML handle is, so the
 *    OS resize wins and the renderer never sees the pointer). That new size is
 *    ADOPTED as the dock thickness (and the AppBar follows) instead of being
 *    reverted. Before v1.1.8 it was reverted → "I can't make it narrower".
 *  - Anything else (move, display change, OS nudge): re-apply the persisted
 *    thickness/edge.
 * While a native resize is in progress (will-resize … resized) nothing is
 * re-applied, so we never fight the user's drag mid-gesture.
 */
export interface DockMeasure {
  persisted: number;
  actual: number;
}

export interface ReapplyDeps {
  isApplying: () => boolean;
  isDocked: () => boolean;
  apply: (source: string) => Promise<void> | void;
  /** Persisted vs actual thickness of the docked window (null if floating). */
  measure?: () => DockMeasure | null;
  /** Adopt a user-made native resize as the new thickness. */
  adopt?: (thickness: number, source: string) => Promise<void> | void;
  log?: (tag: string, msg: string) => void;
}

export interface EventSource {
  on(event: string, cb: (...args: unknown[]) => void): unknown;
}

const ADOPT_TOLERANCE = 2;

export function attachDockReapply(win: EventSource, screenLike: EventSource, deps: ReapplyDeps): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let userResizing = false;
  let userResizeTimer: ReturnType<typeof setTimeout> | null = null;
  const log = (tag: string, msg: string) => deps.log?.(tag, msg);

  const endUserResizeSoon = () => {
    if (userResizeTimer) clearTimeout(userResizeTimer);
    // Safety: if 'resized' never arrives, end the gesture after 1.5s of quiet.
    userResizeTimer = setTimeout(() => {
      userResizeTimer = null;
      if (userResizing) {
        userResizing = false;
        schedule('native-resize-timeout');
      }
    }, 1500);
  };

  const run = (source: string) => {
    if (deps.isApplying() || !deps.isDocked()) return;
    const m = deps.measure?.();
    if (m && deps.adopt && Math.abs(m.actual - m.persisted) > ADOPT_TOLERANCE && source !== 'display-metrics-changed') {
      log('reapply', `${source}: window thickness ${m.actual} != persisted ${m.persisted} → adopt as user resize`);
      void deps.adopt(m.actual, `native:${source}`);
      return;
    }
    log('reapply', `${source}: re-apply persisted thickness${m ? ` ${m.persisted} (actual ${m.actual})` : ''}`);
    void deps.apply(source);
  };

  const schedule = (source: string) => {
    if (userResizing) return; // never fight an in-progress native drag
    if (deps.isApplying()) return;
    if (!deps.isDocked()) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      run(source);
    }, source === 'display-metrics-changed' ? 50 : 180);
  };

  win.on('will-resize', (...args: unknown[]) => {
    if (!deps.isDocked()) return;
    if (!userResizing) {
      const details = args[2] as { edge?: string } | undefined;
      log('native', `user native resize started (edge=${details?.edge ?? '?'})`);
    }
    userResizing = true;
    if (timer) { clearTimeout(timer); timer = null; }
    endUserResizeSoon();
  });
  win.on('resized', () => {
    if (userResizing) {
      userResizing = false;
      if (userResizeTimer) { clearTimeout(userResizeTimer); userResizeTimer = null; }
      log('native', 'user native resize ended');
    }
    schedule('resized');
  });
  win.on('moved', () => schedule('moved'));
  screenLike.on('display-metrics-changed', () => schedule('display-metrics-changed'));
  return () => {
    if (timer) clearTimeout(timer);
    if (userResizeTimer) clearTimeout(userResizeTimer);
    timer = null;
  };
}
