# Changelog

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
