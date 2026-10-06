; Uninstall hooks for the NSIS installer.
;
; The log lives in %LOCALAPPDATA%\TraderCompanion and was never recorded by the
; installer, so the default uninstaller would leave it behind. Preferences in
; %APPDATA%\TraderCompanion (watchlist, alerts) are kept on purpose, so a
; reinstall picks up where the user left off.

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$LOCALAPPDATA\TraderCompanion\companion.log"
  RMDir "$LOCALAPPDATA\TraderCompanion"
!macroend
