import React from 'react';
import { useAppStore } from '../store/appStore';
import type { RefreshInterval, Theme, LayoutMode, DisplayCurrency, DockPosition } from '../../shared/types';
import {
  MIN_DOCK_THICKNESS,
  MAX_DOCK_THICKNESS,
  COMPACT_DOCK_THRESHOLD,
  MEDIUM_DOCK_THRESHOLD,
} from '../../shared/dockBounds';
import { refreshLabel } from '../utils/format';
import { scheduleRefresh } from '../services/marketService';

const REFRESH_OPTIONS: RefreshInterval[] = [5, 10, 30, 60, 300, 900, 0];
const DOCK_OPTIONS: { value: DockPosition; label: string }[] = [
  { value: 'floating', label: 'Floating' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
];

export function SettingsPanel() {
  const setPanel = useAppStore((s) => s.setPanel);
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);
  const watchlists = useAppStore((s) => s.watchlists);
  const createWatchlist = useAppStore((s) => s.createWatchlist);

  return (
    <div className="side-panel settings-panel">
      <div className="panel-header">
        <h3>Settings</h3>
        <button type="button" className="icon-btn" onClick={() => setPanel('none')}>×</button>
      </div>

      <label className="setting">
        <span>Transparency ({settings.transparency}%)</span>
        <input
          type="range" min={20} max={100} value={settings.transparency}
          onChange={(e) => update({ transparency: Number(e.target.value) })}
        />
      </label>

      <label className="setting row">
        <span>Always on top</span>
        <input type="checkbox" checked={settings.alwaysOnTop}
          onChange={(e) => update({ alwaysOnTop: e.target.checked })} />
      </label>

      <label className="setting">
        <span>Refresh interval</span>
        <select
          value={settings.refreshInterval}
          onChange={(e) => {
            update({ refreshInterval: Number(e.target.value) as RefreshInterval });
            setTimeout(scheduleRefresh, 0);
          }}
        >
          {REFRESH_OPTIONS.map((v) => (
            <option key={v} value={v}>{refreshLabel(v)}</option>
          ))}
        </select>
      </label>

      <label className="setting row">
        <span>Show charts</span>
        <input type="checkbox" checked={settings.showCharts}
          onChange={(e) => update({ showCharts: e.target.checked })} />
      </label>

      <label className="setting">
        <span>Layout</span>
        <select value={settings.layout}
          onChange={(e) => update({ layout: e.target.value as LayoutMode })}>
          <option value="compact">Compact</option>
          <option value="detailed">Detailed</option>
        </select>
      </label>

      <label className="setting">
        <span>Theme</span>
        <select value={settings.theme}
          onChange={(e) => update({ theme: e.target.value as Theme })}>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="transparent">Transparent</option>
        </select>
      </label>

      <label className="setting">
        <span>Display currency</span>
        <select value={settings.displayCurrency}
          onChange={(e) => update({ displayCurrency: e.target.value as DisplayCurrency })}>
          <option value="native">Native</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
        </select>
      </label>

      <h4 style={{ margin: '12px 0 6px', fontSize: 12 }}>Dock / snap</h4>
      <label className="setting">
        <span>Dock position</span>
        <select
          value={settings.dockPosition}
          onChange={(e) => update({ dockPosition: e.target.value as DockPosition })}
        >
          {DOCK_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className="setting row">
        <span>Reserve screen space (maximize stops at overlay)</span>
        <input
          type="checkbox"
          checked={settings.reserveWorkArea}
          disabled={settings.dockPosition === 'floating'}
          onChange={(e) => update({ reserveWorkArea: e.target.checked })}
        />
      </label>
      <p className="hint">
        When enabled and docked, other windows maximize only up to the overlay edge
        (system work area shrinks like a taskbar). Linux/X11: EWMH struts. Windows: AppBar
        (SHAppBarMessage). macOS: edge snap only — OS does not allow third-party reservation.
      </p>

      <label className="setting">
        <span>Dock thickness ({settings.dockThickness}px)</span>
        <input
          type="range"
          min={MIN_DOCK_THICKNESS}
          max={MAX_DOCK_THICKNESS}
          step={10}
          value={settings.dockThickness}
          disabled={settings.dockPosition === 'floating'}
          onChange={(e) => update({ dockThickness: Number(e.target.value) })}
        />
      </label>
      <div className="thickness-controls no-drag">
        <button
          type="button"
          title="Smaller (Ctrl+Alt+[)"
          disabled={settings.dockPosition === 'floating' || settings.dockThickness <= MIN_DOCK_THICKNESS}
          onClick={() => update({ dockThickness: Math.max(MIN_DOCK_THICKNESS, settings.dockThickness - 10) })}
        >
          −
        </button>
        <input
          type="number"
          aria-label="Dock thickness in px"
          min={MIN_DOCK_THICKNESS}
          max={MAX_DOCK_THICKNESS}
          step={10}
          key={settings.dockThickness}
          defaultValue={settings.dockThickness}
          disabled={settings.dockPosition === 'floating'}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v !== settings.dockThickness) {
              update({ dockThickness: Math.min(MAX_DOCK_THICKNESS, Math.max(MIN_DOCK_THICKNESS, Math.round(v))) });
            }
          }}
        />
        <span>px</span>
        <button
          type="button"
          title="Larger (Ctrl+Alt+])"
          disabled={settings.dockPosition === 'floating' || settings.dockThickness >= MAX_DOCK_THICKNESS}
          onClick={() => update({ dockThickness: Math.min(MAX_DOCK_THICKNESS, settings.dockThickness + 10) })}
        >
          +
        </button>
        <button type="button" title="Open folder with dock.log" onClick={() => void window.marketOverlay.openLogFolder?.()}>
          Log
        </button>
      </div>
      <p className="hint">
        Width when docked left/right, height when top/bottom. Drag the inner edge of the
        docked window to resize, use −/+ or type a value, tray “Dock smaller/larger”, or
        Ctrl+Alt+[ / Ctrl+Alt+]. From {COMPACT_DOCK_THRESHOLD}px: ticker + price + %; below that ticker + price only;
        from {MEDIUM_DOCK_THRESHOLD}px also the absolute change and name.
        Disabled while floating.
      </p>

      <h4 style={{ margin: '12px 0 6px', fontSize: 12 }}>Crypto</h4>
      <label className="setting row">
        <span>Live crypto streaming</span>
        <input
          type="checkbox"
          checked={settings.cryptoStreaming}
          onChange={(e) => update({ cryptoStreaming: e.target.checked })}
        />
      </label>
      <p className="hint">Binance public WebSocket for crypto mids; stocks still poll Yahoo.</p>

      <h4 style={{ margin: '12px 0 6px', fontSize: 12 }}>Watchlists</h4>
      <div className="btn-row">
        <button type="button" className="btn" onClick={() => void window.marketOverlay.exportWatchlists('json')}>
          Export JSON
        </button>
        <button type="button" className="btn" onClick={() => void window.marketOverlay.exportWatchlists('csv')}>
          Export CSV
        </button>
        <button type="button" className="btn ghost" onClick={() => void window.marketOverlay.importWatchlists('merge')}>
          Import merge…
        </button>
        <button type="button" className="btn ghost" onClick={() => void window.marketOverlay.importWatchlists('replace')}>
          Import replace…
        </button>
        <button type="button" className="btn ghost" onClick={() => createWatchlist(`List ${watchlists.length + 1}`)}>
          New list
        </button>
      </div>

      <label className="setting row">
        <span>Minimize to tray on close</span>
        <input type="checkbox" checked={settings.minimizeToTray}
          onChange={(e) => update({ minimizeToTray: e.target.checked })} />
      </label>
      <label className="setting row">
        <span>Start with OS</span>
        <input type="checkbox" checked={settings.startWithOS}
          onChange={(e) => update({ startWithOS: e.target.checked })} />
      </label>
    </div>
  );
}
