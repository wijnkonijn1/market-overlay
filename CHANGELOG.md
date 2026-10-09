# Changelog

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
