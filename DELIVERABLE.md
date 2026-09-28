# DELIVERABLE — Market Overlay 1.1.2

## APPLICATION
- **Path:** `/workspace/market-overlay`
- **Version:** 1.1.2
- **Stack:** Electron + Vite + React + TypeScript, Zustand, electron-store, yahoo-finance2, ws, koffi, Vitest, electron-builder

## FIX (1.1.2)
Windows dock “Reserve screen space” now registers a real AppBar via `SHAppBarMessage` (koffi FFI) so maximized apps stop at the overlay edge. Restores on undock/quit; HWND destroy drops the AppBar after a crash.

## PLATFORM LIMITATIONS (dock reservation)
- Linux/X11: strut reservation supported
- Windows: AppBar via SHAppBarMessage when reserve is on (edge snap always)
- macOS: snap only — no third-party work-area reservation API

## TESTING
- Framework: Vitest
- Run: `npm test`
- Coverage: dock geometry (incl. AppBar DIP↔physical + reserved work area), watchlist IO, crypto map/stream, market hours, composite fallback

## BUILD / RELEASE
- `npm run dist:win` — NSIS Setup + Portable
- `npm run dist:linux` — AppImage + deb
- Signing: unsigned by default; `docs/SIGNING.md`

## MANUAL WINDOWS VERIFICATION
1. Install/run Setup or Portable on Windows 10/11.
2. Settings → Dock position = Left (or Right/Top/Bottom).
3. Ensure “Reserve screen space (maximize stops at overlay)” is checked.
4. Maximize Notepad/Explorer — should stop at the overlay edge.
5. Switch to Floating or uncheck reserve — work area should restore.
6. Quit the app — work area should restore (no permanent desktop corruption).
