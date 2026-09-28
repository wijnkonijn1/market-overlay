# Changelog

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
