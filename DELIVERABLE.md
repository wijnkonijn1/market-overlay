# DELIVERABLE — Market Overlay 1.1.0

## APPLICATION
- **Path:** `/workspace/market-overlay`
- **Version:** 1.1.0
- **Stack:** Electron + Vite + React + TypeScript, Zustand, electron-store, yahoo-finance2, ws, Vitest, electron-builder

## FEATURES COMPLETED
1. yahoo-finance2 primary + Yahoo HTTP fallback + CoinGecko crypto fallback (`CompositeProvider`)
2. Multi-region market calendars + next-open (`marketHours.ts`) wired into quotes/status UI
3. Optional Binance crypto WebSocket streaming (`CryptoStream.ts`, Settings toggle)
4. Brand icons (`scripts/generate-icons.mjs` → `build/icons`) + electron-builder targets
5. Watchlist JSON/CSV import/export (`watchlistIO.ts` + Settings + IPC dialogs)
6. Dock/snap + reserve work area (`dockBounds.ts`, `workAreaReserve.ts`, Settings)

## TESTING
- Framework: Vitest
- **Passed:** 23 / 23
- Run: `npm test`
- Coverage: dock geometry, watchlist IO merge/replace, crypto map + stream merge, multi-region hours, composite fallback mocks

## BUILD / RELEASE
- `npm run build` — typecheck + Vite/electron build  
- `npm run dist:linux` — AppImage, deb, dir → `release/`  
- Signing: unsigned by default; `docs/SIGNING.md`

## HOW A FRIEND INSTALLS
- **Linux:** download AppImage → `chmod +x` → run; or install `.deb`  
- **Windows:** run NSIS installer or portable exe (SmartScreen warning if unsigned)  
- **macOS:** open DMG / unzip (Gatekeeper warning if unsigned); drag to Applications

## PLATFORM LIMITATIONS (dock reservation)
- Linux/X11: strut reservation supported  
- Windows: snap always; AppBar reservation best-effort  
- macOS: snap only — no third-party work-area reservation API
