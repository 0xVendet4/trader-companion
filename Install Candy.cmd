@echo off
rem Candy - Trader Companion: double-click to build Candy from the code in
rem this folder and install it. Nothing prebuilt is downloaded: it compiles here.
rem
rem It asks before installing the tools a build needs (Node.js, Rust and
rem Microsoft's C++ build tools) with winget, Windows' own app installer, by
rem their official package ids. The build itself is "npm run setup"
rem (scripts\setup.mjs), which you can read too.

setlocal
title Install Candy
cd /d "%~dp0"
rem Where winget puts Node.js and Rust, for this window too.
set "PATH=%PATH%;%ProgramFiles%\nodejs;%USERPROFILE%\.cargo\bin"
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"

echo.
echo   Candy - Trader Companion
echo   Builds Candy from the code in this folder and installs it on this PC.
echo   The first time takes a while: the tools are a few GB, the build some minutes.
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
if not defined NODE winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
if not defined RUST winget install -e --id Rustlang.Rustup --accept-source-agreements --accept-package-agreements
if not defined VC winget install -e --id Microsoft.VisualStudio.2022.BuildTools --accept-source-agreements --accept-package-agreements --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
goto check

:toolchain
rem A Windows app needs Rust's MSVC toolchain.
rustup toolchain list 2>nul | findstr /c:"stable-x86_64-pc-windows-msvc" >nul || rustup toolchain install stable-x86_64-pc-windows-msvc --profile minimal

echo.
echo   Building Candy (some minutes the first time, seconds after)...
call npm.cmd ci || goto failed
call npm.cmd run setup -- %* || goto failed
echo.
echo   Done.
goto end

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
echo.
echo   Something went wrong: the messages above say what.

:end
echo.
rem CI runs this with --build-only and nobody to press a key.
echo %* | findstr /c:"--build-only" >nul || pause
