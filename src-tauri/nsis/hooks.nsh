; Install and uninstall hooks for the NSIS installer.

; 0.1.1 renamed the app from Trader Companion to Candy, and an install is known
; by its name (its folder, its entry in Installed apps): one under the old name
; would stay next to Candy. Its own uninstaller removes it first, quietly — it
; closes the old app, keeps the preferences in %APPDATA%\TraderCompanion and
; takes its shortcuts with it. Its "Start with Windows" entry goes too; Candy
; registers its own on its first start.
!macro NSIS_HOOK_PREINSTALL
  ${If} ${FileExists} "$LOCALAPPDATA\Trader Companion\uninstall.exe"
    ExecWait '"$LOCALAPPDATA\Trader Companion\uninstall.exe" /S _?=$LOCALAPPDATA\Trader Companion'
    Delete "$LOCALAPPDATA\Trader Companion\uninstall.exe"
    RMDir "$LOCALAPPDATA\Trader Companion"
  ${EndIf}
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Trader Companion"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "Trader Companion"
!macroend

; The log lives in %LOCALAPPDATA%\TraderCompanion and was never recorded by the
; installer, so the default uninstaller would leave it behind. Preferences in
; %APPDATA%\TraderCompanion (watchlist, alerts) are kept on purpose, so a
; reinstall picks up where the user left off.
!macro NSIS_HOOK_PREUNINSTALL
  Delete "$LOCALAPPDATA\TraderCompanion\companion.log"
  RMDir "$LOCALAPPDATA\TraderCompanion"
!macroend
