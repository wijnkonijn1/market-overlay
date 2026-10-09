import Store from 'electron-store';
import {
  PersistedState,
  createDefaultState,
  DEFAULT_SETTINGS,
  DEFAULT_WINDOW,
} from '../shared/types';
import { MAIN_OWNED_DOCK_KEYS, migrateDockSettings } from '../shared/dockBounds';

const store = new Store<PersistedState>({
  name: 'market-overlay',
  defaults: createDefaultState(),
});

export function getAll(): PersistedState {
  const raw = store.store as PersistedState;
  const defaults = createDefaultState();
  return {
    version: raw.version ?? 1,
    watchlists:
      Array.isArray(raw.watchlists) && raw.watchlists.length
        ? raw.watchlists
        : defaults.watchlists,
    activeWatchlistId: raw.activeWatchlistId || 'main',
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
    alerts: Array.isArray(raw.alerts) ? raw.alerts : [],
    window: { ...DEFAULT_WINDOW, ...(raw.window || {}) },
    quoteCache: raw.quoteCache || {},
  };
}

export function setAll(state: PersistedState): void {
  store.store = state;
}

/**
 * Full-state save coming from the renderer. The renderer's copy of the dock
 * fields and window bounds can be stale (it is a debounced snapshot), so the
 * main process stays authoritative for them: dock changes only go through the
 * dock:* IPC handlers. Prevents a stale snapshot re-growing a shrunk dock.
 */
export function setAllFromRenderer(state: PersistedState): PersistedState {
  const current = getAll();
  const settings = { ...DEFAULT_SETTINGS, ...(state.settings || {}) } as Record<string, unknown>;
  for (const k of MAIN_OWNED_DOCK_KEYS) {
    settings[k] = (current.settings as unknown as Record<string, unknown>)[k];
  }
  const next: PersistedState = {
    ...state,
    settings: settings as unknown as PersistedState['settings'],
    window: current.window,
  };
  store.store = next;
  return next;
}

/** Same rule for a single-key `settings` save from the renderer. */
export function mergeSettingsFromRenderer(value: PersistedState['settings']): PersistedState['settings'] {
  const current = getAll().settings as unknown as Record<string, unknown>;
  const merged = { ...DEFAULT_SETTINGS, ...(value || {}) } as Record<string, unknown>;
  for (const k of MAIN_OWNED_DOCK_KEYS) merged[k] = current[k];
  store.set('settings', merged as any);
  return merged as unknown as PersistedState['settings'];
}

/** Run once at startup: migrate the RAW stored settings (before defaults merge). */
export function migrateStore(): void {
  const raw = (store.store as PersistedState).settings as unknown as
    | (Record<string, unknown> & { dockThickness?: number; dockThicknessUserSet?: boolean; settingsSchema?: number })
    | undefined;
  if (!raw) return;
  const { settings, changed } = migrateDockSettings(raw);
  if (changed) {
    store.set('settings', settings as any);
    console.log(`[store] migrated settings → schema 2 (dockThickness=${settings.dockThickness})`);
  }
}

export function get<K extends keyof PersistedState>(key: K): PersistedState[K] {
  return getAll()[key];
}

export function set<K extends keyof PersistedState>(key: K, value: PersistedState[K]): void {
  store.set(key, value as any);
}

export { store };
