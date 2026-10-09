import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { useAppStore } from './store/appStore';
import { SettingsPanel } from './components/SettingsPanel';
import { AddTickerModal } from './components/AddTickerModal';
import { DockResizeHandle } from './components/DockResizeHandle';
import { formatPrice, formatChange } from './utils/format';
import { refreshQuotes, scheduleRefresh } from './services/marketService';
import { dockRowDensity } from '../shared/dockBounds';

export function App() {
  // Version comes from the main process (app.getVersion() = package.json), never hardcoded.
  const [appVersion, setAppVersion] = useState<string>('');
  useEffect(() => {
    void window.marketOverlay?.getVersion?.().then((v) => setAppVersion(String(v || ''))).catch(() => {});
  }, []);
  const hydrated = useAppStore((s) => s.hydrated);
  const hydrate = useAppStore((s) => s.hydrate);
  const watchlists = useAppStore((s) => s.watchlists);
  const activeWatchlistId = useAppStore((s) => s.activeWatchlistId);
  const setActiveWatchlist = useAppStore((s) => s.setActiveWatchlist);
  const settings = useAppStore((s) => s.settings);
  const quotes = useAppStore((s) => s.quotes);
  const panel = useAppStore((s) => s.panel);
  const setPanel = useAppStore((s) => s.setPanel);
  const selectedSymbol = useAppStore((s) => s.selectedSymbol);
  const setSelectedSymbol = useAppStore((s) => s.setSelectedSymbol);
  const removeTicker = useAppStore((s) => s.removeTicker);
  const refreshing = useAppStore((s) => s.refreshing);
  const lastUpdated = useAppStore((s) => s.lastUpdated);
  const dataUnavailable = useAppStore((s) => s.dataUnavailable);
  const cryptoStream = useAppStore((s) => s.cryptoStream);
  const applyQuotePartial = useAppStore((s) => s.applyQuotePartial);
  const setCryptoStream = useAppStore((s) => s.setCryptoStream);
  const active = useAppStore((s) => s.activeWatchlist());

  const density = useMemo(
    () => dockRowDensity(settings.dockPosition, settings.dockThickness),
    [settings.dockPosition, settings.dockThickness]
  );
  const isCompact = density === 'compact';
  // compact: symbol + price only; medium: + change %; full: + name (unless layout=compact)
  const showChange = density !== 'compact';
  const showName = density === 'full' && settings.layout !== 'compact';

  useEffect(() => {
    const api = window.marketOverlay;
    if (!api) return;
    void api.getState().then((state) => {
      hydrate(state);
      document.documentElement.dataset.theme = state.settings.theme;
      void refreshQuotes(true);
      scheduleRefresh();
    });
    const unsubShortcut = api.onShortcut((action) => {
      if (action === 'add-ticker') setPanel('add');
      else if (action === 'settings') setPanel('settings');
      else if (action === 'refresh') void refreshQuotes(true);
      else if (action === 'close-hide') {
        if (panel !== 'none') setPanel('none');
        else void api.hide();
      } else if (action === 'escape') setPanel('none');
    });
    const unsubTray = api.onTrayAction((action) => {
      if (action === 'refresh') void refreshQuotes(true);
      else if (action === 'settings') setPanel('settings');
      else if (typeof action === 'object' && action.type === 'watchlist') {
        setActiveWatchlist(action.id);
        void refreshQuotes(true);
      }
    });
    const unsubQuote = api.onQuoteUpdate((u) => applyQuotePartial(u));
    const unsubStream = api.onCryptoStreamStatus((s) => setCryptoStream(s));
    // Main applied a thickness (tray, shortcut, native resize, other UI): mirror it.
    const unsubDock = api.onDockChanged?.((d) => {
      useAppStore.setState((s) =>
        s.settings.dockThickness === d.thickness
          ? s
          : { settings: { ...s.settings, dockThickness: d.thickness } }
      );
    });
    const unsubReload = api.onStateReload(() => {
      void api.getState().then((state) => {
        hydrate(state);
        void refreshQuotes(true);
      });
    });
    return () => {
      unsubShortcut();
      unsubTray();
      unsubQuote();
      unsubStream();
      unsubDock?.();
      unsubReload();
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.setProperty('--font-size', `${settings.fontSize}px`);
  }, [settings.theme, settings.fontSize]);

  useEffect(() => {
    if (hydrated) {
      void refreshQuotes(true);
      scheduleRefresh();
    }
  }, [hydrated, activeWatchlistId, settings.refreshInterval]);

  const marketLabel = useMemo(() => {
    const tickers = active?.tickers ?? [];
    const stock = tickers.find((t) => quotes[t.symbol]?.type !== 'crypto');
    const q = stock ? quotes[stock.symbol] : tickers[0] ? quotes[tickers[0].symbol] : null;
    if (!q) return { state: 'UNKNOWN' as const, label: 'Status unknown', next: '' };
    const state = q.marketState;
    const labels: Record<string, string> = {
      REGULAR: 'Market open',
      PRE: 'Pre-market',
      POST: 'After hours',
      CLOSED: 'Market closed',
      CRYPTO_24_7: 'Crypto 24/7',
      UNKNOWN: 'Status unknown',
    };
    return {
      state,
      label: labels[state] || state,
      next: state === 'CLOSED' || state === 'POST' ? q.nextOpenLabel || '' : '',
    };
  }, [active, quotes]);

  const onRefresh = useCallback(() => void refreshQuotes(true), []);

  if (!hydrated) {
    return <div className="app"><div className="empty">Loading…</div></div>;
  }

  const rowClass =
    density === 'compact' ? 'row row-compact' : density === 'medium' ? 'row row-medium' : 'row';

  return (
    <div
      className={`app density-${density}`}
      style={{ fontSize: settings.fontSize }}
      data-dock={settings.dockPosition}
      data-density={density}
    >
      <DockResizeHandle />
      <div className="titlebar">
        <span>Market Overlay</span>
        {appVersion && <span className="badge" title="Installed version">v{appVersion}</span>}
        <div className="win-btns no-drag">
          <button type="button" className="icon-btn" title="Add (Ctrl+K)" onClick={() => setPanel('add')}>+</button>
          <button type="button" className="icon-btn" title="Refresh" onClick={onRefresh}>{refreshing ? '…' : '↻'}</button>
          <button type="button" className="icon-btn" title="Settings" onClick={() => setPanel('settings')}>⚙</button>
          <button type="button" onClick={() => void window.marketOverlay.minimize()}>—</button>
          <button type="button" onClick={() => void window.marketOverlay.close()}>×</button>
        </div>
      </div>

      {!isCompact && (
        <div className="status-bar">
          <span className={`dot ${marketLabel.state.toLowerCase()}`} />
          <span>{marketLabel.label}</span>
          {marketLabel.next && <span title={marketLabel.next}>· {marketLabel.next}</span>}
          {settings.cryptoStreaming && (
            <span className={cryptoStream.connected ? 'stream-on' : ''} title="Crypto stream">
              · WS {cryptoStream.connected ? 'live' : 'off'}
            </span>
          )}
          {dataUnavailable && <span>· Data unavailable</span>}
          <span style={{ marginLeft: 'auto' }}>
            {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '—'}
          </span>
        </div>
      )}

      {!isCompact && (
        <div className="tabs no-drag">
          {watchlists.map((w) => (
            <button
              key={w.id}
              type="button"
              className={`tab ${w.id === activeWatchlistId ? 'active' : ''}`}
              onClick={() => setActiveWatchlist(w.id)}
            >
              {w.name}
            </button>
          ))}
        </div>
      )}

      <div className="list">
        {!active?.tickers.length && (
          <div className="empty">
            Empty watchlist. Press <kbd>Ctrl+K</kbd> to add tickers.
          </div>
        )}
        {active?.tickers.map((t) => {
          const q = quotes[t.symbol];
          const up = (q?.change ?? 0) >= 0;
          return (
            <div
              key={t.symbol}
              className={rowClass}
              onClick={() => setSelectedSymbol(t.symbol)}
              onContextMenu={(e) => {
                e.preventDefault();
                removeTicker(t.symbol);
              }}
            >
              <div className="sym-block">
                <div className="sym">{t.displaySymbol}</div>
                {showName && <div className="name">{q?.name || t.name || t.symbol}</div>}
              </div>
              <div className="price">{q ? formatPrice(q.price, q.currency) : '—'}</div>
              {showChange && (
                <div className={`chg ${up ? 'up' : 'down'}`}>
                  {q ? formatChange(q.change, q.changePercent) : '—'}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {panel === 'settings' && <SettingsPanel />}
      {panel === 'add' && <AddTickerModal />}
      {panel === 'detail' && selectedSymbol && (
        <div className="side-panel">
          <div className="panel-header">
            <h3>{selectedSymbol}</h3>
            <button type="button" className="icon-btn" onClick={() => setPanel('none')}>×</button>
          </div>
          {quotes[selectedSymbol] ? (
            <div className="hint">
              <div>Price: {formatPrice(quotes[selectedSymbol].price, quotes[selectedSymbol].currency)}</div>
              <div>State: {quotes[selectedSymbol].marketState}</div>
              {quotes[selectedSymbol].nextOpenLabel && (
                <div>Next open: {quotes[selectedSymbol].nextOpenLabel}</div>
              )}
              {quotes[selectedSymbol].exchange && <div>Exchange: {quotes[selectedSymbol].exchange}</div>}
              {quotes[selectedSymbol].delayed && <div>Delayed data</div>}
            </div>
          ) : (
            <div className="hint">No quote loaded.</div>
          )}
        </div>
      )}
    </div>
  );
}
