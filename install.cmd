@echo off
rem Builds Candy from this folder's source and installs it (README.md, Install).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1" %*
echo.
pause
