# Market Overlay v1.1.2

Desktop always-on-top market data overlay for stocks, ETFs, indices, and crypto.

## Stack
Electron · Vite · React · TypeScript · Zustand · electron-store · yahoo-finance2 · Vitest · electron-builder

## Quick start
```bash
cd /workspace/market-overlay
npm install
npm run icons          # generate brand PNGs + ICO
npm run dev            # Vite + Electron
npm test
npm run build
npm run dist:linux     # → release/ AppImage + deb (+ dir fallback)
```

## v1.1 highlights
1. **yahoo-finance2 → HTTP → CoinGecko** provider stack  
2. **Multi-region calendars** + next open when closed  
3. **Live crypto streaming** (Binance public WS; toggle in Settings)  
4. **Brand icons + installers** for Linux/Windows/macOS  
5. **Watchlist JSON/CSV import/export**  
6. **Dock / snap** with optional work-area reservation (platform-dependent)

## Dock / work-area reservation (honest per-OS)

| OS | Edge snap | Reserve work area |
|----|-----------|-------------------|
| **Linux/X11** | Yes | Yes — EWMH `_NET_WM_STRUT` / `_NET_WM_STRUT_PARTIAL` via `xprop` when “Reserve screen space” is on |
| **Linux/Wayland** | Best-effort snap | Struts often unavailable (compositor-dependent) |
| **Windows** | Yes | Yes — `SHAppBarMessage` AppBar via koffi when “Reserve screen space” is on (restored on undock/quit) |
| **macOS** | Yes | **Not available** to third-party apps — Settings still offer the toggle but reservation is a no-op |

## Sharing builds
- **Linux:** run the AppImage or install the `.deb` from `release/`  
- **Windows / macOS:** unsigned artifacts for testing; signed release needs certs — see `docs/SIGNING.md`

## Keyboard
| Shortcut | Action |
|----------|--------|
| Ctrl+K | Add ticker |
| Ctrl+W | Close panel / hide |
| Ctrl+R | Refresh |
| Ctrl+, | Settings |
| Esc | Close popup |
| Ctrl+Shift+K | Global show + add |

## License
MIT
