# Windows AppBar / dock thickness

Market Overlay reserves the system work area on Windows via `SHAppBarMessage`
(AppBar), not `SPI_SETWORKAREA` (ignored by Explorer on Windows 10+).

## Apply order (must not auto-grow)

When the user changes dock thickness (drag handle or Settings slider):

1. **Persist** `settings.dockThickness` first.
2. Lower Electron `setMinimumSize` so thickness can reach `MIN_DOCK_THICKNESS` (140).
   Default floating mins (280×200) must not clamp a docked strip.
3. **`setBounds`** to the exact DIP dock rect from `computeDockBounds`.
4. **Register / update AppBar** (`ABM_NEW` if needed → `ABM_QUERYPOS` → force user
   thickness → `ABM_SETPOS`) using the **same** rect.
5. Deferred ~150ms re-assert runs **only if** the OS moved the window away from
   that user rect, and always re-asserts **to the user thickness** — never a
   larger QUERYPOS or default size. A generation counter cancels stale re-asserts
   from an earlier (larger) resize still in flight.

`ABM_QUERYPOS` may adjust the proposed `RECT`. We call
`enforceAppBarUserThickness` after QUERYPOS so the thickness axis never expands
past the user’s choice. Reserved work area therefore tracks the slider/drag.

## Clear paths

- Dock position **floating**, or **Reserve screen space** off → `ABM_REMOVE`.
- App quit / `before-quit` / `will-quit` → `clearDockReservation` → `ABM_REMOVE`.
- HWND destroy also drops the AppBar (shell behavior).

## Concurrent applies

`applyDockFromSettings` serializes IPC thickness updates and skips superseded
sequences so a shrink cannot be overwritten by an in-flight larger apply.

## Verify on Windows

1. Dock Left, enable Reserve screen space.
2. Drag the inner edge smaller (e.g. 420 → 180) and release — size must stay;
   maximized windows must stop at the new edge.
3. Settings slider down then up — same stickiness; no bounce after ~150ms.
4. Switch to Floating — work area restores; quit while docked — work area restores.


## v1.1.6: reserve == actual window

The reservation is no longer computed from the persisted thickness and display
bounds. After `setBounds`, the AppBar rect is the window's own OS rect
(`GetWindowRect`), falling back to `screen.dipToScreenRect(win, win.getBounds())`.
Both are already physical pixels in the calling thread's DPI context, so the
scale factor is never applied twice and secondary monitors with a different DPI
map correctly. `ABM_SETPOS` always receives exactly that rect.

About 0.4s and 1.2s after each apply, `GetMonitorInfoW` is used to read the real
work area. The inset on the dock edge minus a baseline (captured before
`ABM_NEW`, e.g. a taskbar on the same edge) must equal the window thickness.
Log lines:

    [dock] reserve=<px> window=<px> scale=<s> dip=<dip> src=GetWindowRect
    [dock] verify reserve=<px> window=<px> scale=<s> baseline=<px>

If both samples agree and the shell reserved >= 1.1x the window, the ratio is
stored and later rects are divided by it (`corrected over-reservation`).
