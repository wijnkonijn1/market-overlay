# Code signing & notarization

Market Overlay **1.1.0** ships unsigned by default (`forceCodeSigning: false` / no publish credentials). That is enough for local testing and Linux AppImage/deb distribution. Signed store-ready builds need your own certificates.

## Windows (Authenticode)

Environment variables consumed by electron-builder:

| Variable | Purpose |
|----------|---------|
| `CSC_LINK` | Path or URL to `.pfx` / `.p12` certificate |
| `CSC_KEY_PASSWORD` | Certificate password |

Optional: `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` for Windows-only overrides.

```bash
export CSC_LINK=/secure/market-overlay.pfx
export CSC_KEY_PASSWORD='…'
npm run dist:win
```

Without these, NSIS/portable builds succeed but SmartScreen will warn until reputation accumulates or a cert is used.

## macOS (Developer ID + notarization)

| Variable | Purpose |
|----------|---------|
| `APPLE_ID` | Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password |
| `APPLE_TEAM_ID` | Team ID |
| `CSC_LINK` | Developer ID Application `.p12` (or keychain identity) |
| `CSC_KEY_PASSWORD` | Cert password |

electron-builder hardened runtime is enabled in `package.json`. Notarization runs when Apple credentials are present.

```bash
export APPLE_ID=you@example.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=TEAMID
npm run dist:mac
```

**Note:** macOS `.icns` can be produced from `build/icons` with `electron-icon-builder` / `png2icons` if you need a dedicated ICNS beyond the PNG icon path.

## Linux

No code signing is required for AppImage/deb. Optional: GPG-sign the release artifacts for distribution trust.

## CI

Leave signing env vars unset for unsigned PR/CI artifacts. Gate signed releases on a protected pipeline with secrets.
