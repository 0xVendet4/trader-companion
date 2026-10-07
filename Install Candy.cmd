@echo off
rem Candy - Trader Companion: double-click to build Candy from the code in
rem this folder and install it. Nothing prebuilt is downloaded: it compiles here.
rem
rem It asks before installing the tools a build needs (Node.js, Rust and
rem Microsoft's C++ build tools) with winget, Windows' own app installer, by
rem their official package ids. The build itself is "npm run setup"
rem (scripts\setup.mjs), which you can read too. The details of each step go
rem to a log; if something goes wrong, this window says what, in a sentence.

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
rem CI passes --build-only: build, don't install, don't wait for a key.
rem Candy's own update (src-tauri/src/update.rs) passes --update: the same
rem install, said differently.
set "MODE="
echo %* | findstr /c:"--build-only" >nul && set "MODE=--build-only"
echo %* | findstr /c:"--update" >nul && set "MODE=--update"
set "ARGS="
if "%MODE%"=="--build-only" set "ARGS=--build-only"

echo.
echo   Candy - Trader Companion
echo.
rem Opened from inside the ZIP, Windows copies this file alone to a temporary
rem folder: there is nothing to build there.
if not exist "package.json" goto notextracted

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

echo   [2/3] Building Candy: some minutes the first time, about a minute after...
call npm.cmd ci >> "%LOG%" 2>&1 || goto npmfailed
call npm.cmd run setup -- %ARGS% >> "%LOG%" 2>&1 || goto failed
if "%MODE%"=="--build-only" echo   Built.& goto end

if "%MODE%"=="--update" (
  echo   [3/3] Installed. Candy starts again.
) else (
  echo   [3/3] Installed. Candy starts, and it's in your Start menu.
)
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

:notextracted
echo   Candy's code isn't next to this file: it was opened from inside the ZIP.
echo   Right-click the ZIP, choose Extract All, then double-click Install Candy
echo   in the folder that comes out.
set "FAILED=1"
goto end

:npmfailed
set "WHY=Couldn't download the packages the build needs. Is the internet on?"
goto failed

:failed
set "FAILED=1"
if "%MODE%"=="--build-only" type "%LOG%"& goto end
rem What went wrong, in a sentence: a full disk, or the reasons setup.mjs
rem gives (its lines that start with "Candy:"). The log has the rest.
findstr /c:"ENOSPC" /c:"os error 112" "%LOG%" >nul && set "WHY=The disk is full. Free a few GB, then double-click Install Candy again."
echo.
echo   Something went wrong.
if defined WHY echo   %WHY%
for /f "tokens=1* delims=:" %%a in ('findstr /b /c:"Candy:" "%LOG%"') do echo  %%b
echo.
echo   If you ask for help, send this file:
echo   %LOG%

:end
echo.
if not "%MODE%"=="--build-only" pause
if defined FAILED exit /b 1
exit /b 0
