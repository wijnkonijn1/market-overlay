import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import type { SearchResult } from '../../shared/types';
import { displaySymbol } from '../../shared/cryptoMap';
import { refreshQuotes } from '../services/marketService';

export function AddTickerModal() {
  const setPanel = useAppStore((s) => s.setPanel);
  const addTicker = useAppStore((s) => s.addTicker);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(() => {
      setLoading(true);
      void window.marketOverlay.search(query).then((r) => {
        setResults((r as SearchResult[]) || []);
        setLoading(false);
      }).catch(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const pick = (r: SearchResult) => {
    addTicker({
      symbol: r.symbol,
      displaySymbol: displaySymbol(r.symbol),
      name: r.name,
      type: r.type,
      exchange: r.exchange,
    });
    setPanel('none');
    void refreshQuotes(true);
  };

  return (
    <div className="modal-backdrop" onClick={() => setPanel('none')}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <h3>Add ticker</h3>
          <button type="button" className="icon-btn" onClick={() => setPanel('none')}>×</button>
        </div>
        <input
          autoFocus
          placeholder="Search AAPL, BTC, ASML.AS…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {loading && <div className="hint">Searching…</div>}
        <div>
          {results.map((r) => (
            <div key={r.symbol} className="search-hit" onClick={() => pick(r)}>
              <span><strong>{r.symbol}</strong> · {r.name}</span>
              <span className="badge">{r.type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
