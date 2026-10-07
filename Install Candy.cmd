@echo off
rem Candy - Trader Companion: double-click to build Candy from the code in
rem this folder and install it. Nothing prebuilt is downloaded: it compiles here.
rem
rem It asks before installing the tools a build needs (Node.js, Rust and
rem Microsoft's C++ build tools) with winget, Windows' own app installer, by
rem their official package ids. The build itself is "npm run setup"
rem (scripts\setup.mjs), which you can read too. The details of each step go
rem to a log; it opens in Notepad if something goes wrong.

setlocal
title Install Candy
cd /d "%~dp0"
rem Where winget puts Node.js and Rust, for this window too.
set "PATH=%PATH%;%ProgramFiles%\nodejs;%USERPROFILE%\.cargo\bin"
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
set "LOGDIR=%LOCALAPPDATA%\Candy-build"
set "LOG=%LOGDIR%\install.log"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
echo Install Candy, %DATE% %TIME% > "%LOG%"
rem CI passes --build-only: build, don't open the installer, don't wait for a key.
set "MODE=--no-wait"
echo %* | findstr /c:"--build-only" >nul && set "MODE=--build-only"

echo.
echo   Candy - Trader Companion
echo.

:check
set "NODE=1"
where node >nul 2>nul || set "NODE="
set "RUST=1"
where cargo >nul 2>nul || set "RUST="
set "VC="
if exist "%VSWHERE%" for /f "usebackq delims=" %%i in (`"%VSWHERE%" -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VC=1"
if defined NODE if defined RUST if defined VC goto toolchain
if defined ASKED goto stillmissing

echo   To build Candy, this PC needs:
if not defined NODE echo     - Node.js
if not defined RUST echo     - Rust
if not defined VC echo     - Microsoft C++ build tools (a few GB; Windows asks for permission)
echo.
where winget >nul 2>nul || goto nowinget
choice /c YN /m "  Install them now with winget"
if errorlevel 2 goto declined
set "ASKED=1"
echo.
if not defined NODE call :install "Node.js" OpenJS.NodeJS.LTS
if not defined RUST call :install "Rust" Rustlang.Rustup
if not defined VC call :install "C++ build tools (a few GB, this one takes a while)" Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
goto check

:toolchain
rem A Windows app needs Rust's MSVC toolchain.
rustup toolchain list 2>nul | findstr /c:"stable-x86_64-pc-windows-msvc" >nul || rustup toolchain install stable-x86_64-pc-windows-msvc --profile minimal >> "%LOG%" 2>&1
echo   [1/3] Tools ................ ok

echo   [2/3] Building Candy, some minutes the first time, seconds after...
call npm.cmd ci >> "%LOG%" 2>&1 || goto failed
call npm.cmd run setup -- %MODE% >> "%LOG%" 2>&1 || goto failed
if "%MODE%"=="--build-only" echo   Built.& goto end

echo   [3/3] Opening the installer
echo.
echo   Done. This window closes by itself.
timeout /t 4 /nobreak >nul
exit /b 0

rem Installs one tool with winget, quietly: call :install "label" id [args]
:install
set "LABEL=%~1"
shift
echo   Installing %LABEL%...
winget install -e --id %1 %2 %3 %4 --accept-source-agreements --accept-package-agreements >> "%LOG%" 2>&1
exit /b 0

:nowinget
echo   winget, Windows' app installer, isn't here. Install the tools listed above
echo   by hand (README, Install), then double-click this again.
goto end

:declined
echo   Nothing was installed. Install the tools, then double-click this again.
goto end

:stillmissing
echo   Some tools still aren't found. Close this window, then double-click
echo   Install Candy again: a new window sees what was just installed.
goto end

:failed
set "FAILED=1"
echo.
echo   Something went wrong. The details are in:
echo   %LOG%
if not "%MODE%"=="--build-only" start "" notepad "%LOG%"
if "%MODE%"=="--build-only" type "%LOG%"

:end
echo.
if not "%MODE%"=="--build-only" pause
if defined FAILED exit /b 1
exit /b 0
