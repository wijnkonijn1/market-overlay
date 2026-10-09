# Changelog

## 1.1.9 — 2026-10-09

### New
- **Decimals per ticker.** You can set how many decimals each ticker shows (0–8), or leave it on Auto.
  - **Right-click a row:** native menu with **Decimals ▸ Auto / 0–8**, **Details**, and **Remove from watchlist**. Before this, right-click removed the ticker straight away.
  - **Detail view** (click a row): **Decimals** dropdown.
  - **Auto:** forex (`…=X` / currency) 4; stocks, ETFs and indices 2; crypto and other prices below 1 keep up to 6.
  - Applies to the price and the absolute change in every row layout, including compact, and in the detail view (which now also shows Change). Percent change stays at 2 decimals.
  - Saved with the watchlist and included in JSON/CSV export and import. CSV has a new `decimals` column; an empty value means Auto. Older files without the column import as Auto. CSV import now reads columns by header name.
- **% change from 150px.** A docked strip now shows ticker + price + % change from **150px** thickness (previously 200px).
  - **Below 150px:** ticker + price only.
  - **150–299px:** ticker + price + % change in a tighter font and padding. Hover the % to see the absolute change.
  - **300px and up:** full rows with the absolute change, % change and name.
  - The price and % never wrap or get cut off; only a long ticker name can be shortened with "…". The scrollbar is thinner in narrow docks.

## 1.1.8 — 2026-10-09

### Fixes
- **The dock can now be made narrower on Windows (right dock in particular).**
  - On Windows, Electron gives a resizable frameless window a native ~5 px resize border inside every edge. On a right dock that border sits on the 6 px HTML drag handle at the inner (left) edge, so Windows started a *native* resize and the renderer never saw the pointer. When the native resize ended, the `resized` listener re-applied the *persisted* (old) thickness and the dock snapped back.
  - Native resizes are now **adopted** as the new thickness, and the AppBar follows. Nothing is re-applied while a native resize is still in progress (`will-resize` … `resized`).
  - Fixed a leak in the "applying" guard: overlapping applies (drag bursts, rapid clicks) could leave `isApplyingDock()` stuck at true.
  - The drag handle is now 10 px, explicitly `-webkit-app-region: no-drag`, z-index 1000, with a visible grip and resize cursor.
  - `setBounds` is checked against `getBounds`. On a mismatch it logs, unmaximizes if needed, drops the minimum size and retries once.
- **More ways to resize:**
  - Settings: numeric input plus −/+ buttons (10 px steps) next to the slider.
  - Tray: “Dock smaller (−10px)” and “Dock larger (+10px)”.
  - Keyboard: Ctrl+Alt+[ / Ctrl+Alt+] (in the app, and globally when the shortcut is free).
  - All of these go through one main-process entry point (`requestDockThickness`), and the renderer is kept in sync.
- **Diagnostics:** `dock.log` in `<userData>/logs`. On Windows that is `%APPDATA%\market-overlay\logs\dock.log`, and it rotates at 1 MB. It records every thickness request with its source, `setBounds` requested vs got, AppBar QUERYPOS/SETPOS rects, the reserve verify, re-apply/adopt decisions, native resize start/end, and drag start/end from the UI. Open it from the tray (“Open log folder”) or the Settings “Log” button.

## 1.1.7 — 2026-10-09

### Fixes
- **Header showed "v1.1.3" in every build**: the badge was hardcoded. It now shows `app.getVersion()` (via the `app:getVersion` IPC / preload), so it always matches package.json.
- **Dock grew back after shrinking**:
  - Right/bottom docks: the drag handle used `clientX/clientY`. The window moves under the pointer while a right/bottom dock shrinks, so the delta collapsed and the dock bounced back toward its start size. Now uses `screenX/screenY` (`computeDragThickness`).
  - The renderer's debounced full-state save (`store:setAll`, also fired on every quote refresh) could write a stale `dockThickness` back and re-apply it. Dock fields (`dockPosition`, `dockThickness`, `reserveWorkArea`) and window bounds are now owned by the main process; they only change through the `dock:*` IPC.
  - `dock:set` no longer resets the thickness to the current (floating) window width.
  - Reapply-on-move/resize is now a separate module (`dock/reapply.ts`), and it always re-applies the persisted thickness.
- **Default dock thickness 420 → 210 px.** A one-time migration moves stored settings still at the old default (never user-changed) to 210. Values the user set are kept. Row-density thresholds moved to compact < 200 px and medium < 300 px, so 210 shows symbol + price + change.
- **Clean upgrades on Windows** (`build/installer.nsh`):
  - Before installing, the installer closes both `Market Overlay.exe` (≤ 1.1.3) and `MarketOverlay.exe`.
  - It removes a leftover old-name exe and re-points existing desktop/Start-menu shortcuts at the current exe.
  - On start, the app detects other running Market Overlay main processes (e.g. a pre-1.1.6 copy in the tray, or an old portable) and offers to close them.
- Tests: an integration test (mocked Electron, Windows AppBar path) covers a drag shrink with a stale renderer save and OS events, then runs all timers. Also new: drag-math, migration and instance-detection tests.

## 1.1.6 — 2026-10-09

### Fixes
- **Reserved screen space now always equals the dock's actual width/height** (Windows AppBar + Linux strut):
  - The AppBar rect is taken from the dock window's **actual** OS rect (`GetWindowRect`, same coordinate space as `SHAppBarMessage`), after `setBounds`. Fallback: `screen.dipToScreenRect(getBounds())` — scale applied exactly once. No more re-deriving from display bounds × scaleFactor (wrong on secondary/mixed-DPI monitors).
  - `ABM_SETPOS` always gets exactly the window rect (shell QUERYPOS adjustments ignored); deferred re-assert re-measures the window and re-reserves.
  - Changing dock edge removes the old AppBar before registering the new one.
  - Post-SETPOS verification reads the real work area (`GetMonitorInfoW`, minus taskbar baseline). If the shell consistently reserves a scale-like multiple more than the window (DPI virtualization), the ratio is learned and the reservation corrected so the effective reserve equals the dock.
  - Single-instance lock: a second Market Overlay process (e.g. installed + portable) can no longer register a second AppBar that stacks the reservation.
  - Linux strut derived from the actual window rect, measured from the X root edges (correct for right/bottom on multi-monitor).
  - Debug log: `[dock] reserve=<px> window=<px> scale=<s>` and `[dock] verify reserve=<px> window=<px> …`.
- Tests: reserve == dock at 100/125/150/200% × 140/260/420 for all edges, shrink → reserve shrinks, fake-shell AppBar path (QUERYPOS inflation, slider, edge change, taskbar baseline, DPI-virtualization correction), mixed-DPI secondary monitor, Linux strut.

## 1.1.5 — 2026-09-28

### Fixes
- **Dock thickness no longer auto-grows after shrink** (drag handle or Settings slider):
  - Persist thickness → `setBounds` to the exact dock rect → register AppBar to that same rect.
  - After `ABM_QUERYPOS`, force the thickness axis back to the user size (`enforceAppBarUserThickness`); never apply an expanded shell rect.
  - Deferred ~150ms re-assert only if the OS drifted the window, and only to the **user** thickness (generation counter cancels stale larger re-asserts).
  - Serialize concurrent `applyDockFromSettings` so in-flight larger applies cannot overwrite a shrink.
  - Lower Electron minimum size while docked so thickness can reach 140px (was clamped by minWidth 280 / minHeight 200).
  - Skip `moved`/`resized` re-apply while a dock apply is in progress.
- Document Windows AppBar ordering in `docs/WINDOWS_APPBAR.md`; add stickiness regression tests.

## 1.1.4 — 2026-09-28

### Fixes
- **Windows missing `ffmpeg.dll` on launch** (“De code-uitvoering kan niet worden voortgezet omdat ffmpeg.dll niet is gevonden”):
  - Pack NSIS/portable app archives with `ELECTRON_BUILDER_7Z_FILTER=BCJ` so install-time Nsis7z reliably extracts PE files (`MarketOverlay.exe`, `ffmpeg.dll`, and other Chromium DLLs) instead of BCJ2 streams that some Nsis7z builds skip.
  - Set `win.executableName` to `MarketOverlay` (no spaces) while keeping display `productName` “Market Overlay”.
  - Add `afterPack` + `verify:win-dlls` gate that fails the Windows build if `ffmpeg.dll` (and sibling Electron DLLs) are missing from `release/win-unpacked/`.

## 1.1.3 — 2026-09-28

### Features
- **Resizable dock thickness**: Settings slider (140–720px) plus drag handle on the free/inner edge of a docked window. Persists `dockThickness` and re-applies Linux strut / Windows AppBar so the reserved work area tracks the new size.
- **Auto compact rows**: when docked strip is narrower than 260px (L/R width or T/B height), rows show **symbol + price only**; 260–339px is medium (symbol + price + change); ≥340px is full (name + change). Floating mode stays full density.

## 1.1.2 — 2026-09-28

### Fixes
- **Windows work-area reservation**: when docked with “Reserve screen space”, register a real AppBar via `SHAppBarMessage` (koffi) so maximized apps stop at the overlay edge. Restores cleanly on undock / quit; HWND destroy also drops the AppBar after a crash.
- Settings label/hint clarify that maximize stops at the overlay (Linux struts / Windows AppBar / macOS snap-only).

## 1.1.1

### Fixes
- Windows crash when crypto WebSocket closes while CONNECTING

## 1.1.0 — 2026-09-25

### Features
- **yahoo-finance2 primary + HTTP fallback** with CoinGecko crypto fallback and debug backend logging
- **Multi-region market calendars** (US, London, Euronext, Xetra, Tokyo, Hong Kong) with next-open labels
- **Optional Binance crypto WebSocket streaming** (setting `cryptoStreaming`, default on)
- **Custom brand icons** + shareable installers (AppImage/deb, NSIS/portable, dmg/zip configs)
- **Watchlist JSON/CSV import/export** (merge or replace) via Settings
- **Dock / snap + reserved work area**: Left/Right/Top/Bottom/Floating; Linux/X11 EWMH struts; Windows edge snap (+ AppBar best-effort); macOS snap-only

### Fixes / notes
- Unsigned builds by default — see `docs/SIGNING.md`
- macOS cannot reserve the system work area for third-party apps (documented honestly)

## 1.0.0
- Initial Electron + Vite + React overlay with Yahoo HTTP quotes, watchlists, alerts, tray
