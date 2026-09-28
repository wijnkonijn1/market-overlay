import Store from 'electron-store';
import {
  PersistedState,
  createDefaultState,
  DEFAULT_SETTINGS,
  DEFAULT_WINDOW,
} from '../shared/types';

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

export function get<K extends keyof PersistedState>(key: K): PersistedState[K] {
  return getAll()[key];
}

export function set<K extends keyof PersistedState>(key: K, value: PersistedState[K]): void {
  store.set(key, value as any);
}

export { store };
