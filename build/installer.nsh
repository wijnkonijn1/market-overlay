; Market Overlay custom NSIS hooks (auto-included by electron-builder from build/).
;
; Upgrades from older builds:
;  - <= 1.1.3 shipped "Market Overlay.exe"; >= 1.1.4 ships "MarketOverlay.exe".
;    electron-builder's CHECK_APP_RUNNING only looks for the NEW exe name, so a
;    running old copy (often hidden in the tray) was not closed and kept its
;    own docked window + AppBar.
;  - Pre-1.1.6 builds had no single-instance lock.

!macro customInit
  ; Close any running Market Overlay (old or new exe name) before installing.
  nsExec::Exec 'taskkill /F /T /IM "Market Overlay.exe"'
  Pop $0
  nsExec::Exec 'taskkill /F /T /IM "MarketOverlay.exe"'
  Pop $0
  Sleep 500
!macroend

!macro customInstall
  ; Remove a leftover old-name exe if the old uninstaller could not.
  Delete "$INSTDIR\Market Overlay.exe"
  ; Re-point existing shortcuts at the current exe (they could still target
  ; the old "Market Overlay.exe" when shortcuts were kept across upgrades).
  ${if} ${FileExists} "$newDesktopLink"
    Delete "$newDesktopLink"
    CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
  ${endIf}
  ${if} ${FileExists} "$newStartMenuLink"
    Delete "$newStartMenuLink"
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  ${endIf}
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
