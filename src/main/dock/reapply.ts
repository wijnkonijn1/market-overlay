/**
 * Re-apply the dock after OS-driven window/display changes.
 *
 * Always re-applies the PERSISTED thickness (main-owned), never the current
 * window size, so an OS/AppBar nudge can't change the user's choice. Skipped
 * while our own apply is in flight (its setBounds would otherwise recurse).
 */
export interface ReapplyDeps {
  isApplying: () => boolean;
  isDocked: () => boolean;
  apply: () => Promise<void> | void;
  log?: (msg: string) => void;
}

export interface EventSource {
  on(event: string, cb: (...args: unknown[]) => void): unknown;
}

export function attachDockReapply(win: EventSource, screenLike: EventSource, deps: ReapplyDeps): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const reapply = (source: string) => {
    if (deps.isApplying()) return;
    if (!deps.isDocked()) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (deps.isApplying()) return;
      deps.log?.(`[dock] reapply from ${source}`);
      void deps.apply();
    }, source === 'display-metrics-changed' ? 50 : 180);
  };
  win.on('moved', () => reapply('moved'));
  win.on('resized', () => reapply('resized'));
  screenLike.on('display-metrics-changed', () => reapply('display-metrics-changed'));
  return () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
}
