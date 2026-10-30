import type { Quote } from '../../shared/types';
import { useAppStore } from '../store/appStore';

let refreshTimer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;

function api() {
  return window.marketOverlay;
}

export async function refreshQuotes(force = false): Promise<void> {
  const store = useAppStore.getState();
  const wl = store.activeWatchlist();
  if (!wl || !wl.tickers.length) {
    store.setRefreshing(false);
    return;
  }
  if (inFlight && !force) return;
  inFlight = true;
  store.setRefreshing(true);
  const symbols = wl.tickers.map((t) => t.symbol);
  try {
    const quotes = (await api().quotes(symbols)) as Quote[];
    store.setQuotes(quotes, { unavailable: quotes.length === 0 && symbols.length > 0 });
    // History/sparklines are not rendered anywhere yet; fetching up to 20 charts
    // on every refresh only cost bandwidth and Yahoo rate-limit budget (429s
    // then slowed the quotes themselves). Fetch on demand once a chart exists.
  } catch (err) {
    console.warn('refresh failed', err);
    store.setQuotes([], { unavailable: true });
  } finally {
    inFlight = false;
  }
}

export function scheduleRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  const interval = useAppStore.getState().settings.refreshInterval;
  if (interval > 0) {
    refreshTimer = setInterval(() => { void refreshQuotes(); }, interval * 1000);
  }
}
