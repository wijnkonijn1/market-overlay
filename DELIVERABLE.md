# DELIVERABLE — Market Overlay 1.1.4

## APPLICATION
- **Path:** `/workspace/market-overlay`
- **Version:** 1.1.4
- **Stack:** Electron + Vite + React + TypeScript, Zustand, electron-store, yahoo-finance2, ws, koffi, Vitest, electron-builder

## FIX (1.1.4)
Windows launch error “ffmpeg.dll niet is gevonden”: harden packaging so Electron PE/DLL files always ship and extract with NSIS/portable.
- `ELECTRON_BUILDER_7Z_FILTER=BCJ` for Windows archives
- `win.executableName`: `MarketOverlay`
- `afterPack` / `verify:win-dlls` requires `ffmpeg.dll` (+ other Chromium DLLs) beside the exe in `release/win-unpacked/`

## TESTING
- Framework: Vitest
- Run: `npm test`
- Post-pack: `npm run verify:win-dlls`

## BUILD / RELEASE
- `npm run dist:win` — NSIS Setup + Portable (BCJ filter + DLL gate)
- `npm run dist:linux` — AppImage + deb
- Signing: unsigned by default; `docs/SIGNING.md`
