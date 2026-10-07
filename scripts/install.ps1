# Candy - Trader Companion: builds the app from this folder's source and
# installs it. Nothing prebuilt is downloaded from this project: what you
# install is compiled on your PC from the code you can read here.
#
#   Double-click install.cmd (next to README.md), or in PowerShell:
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1 [-CheckOnly]
#
# 1. Checks for Node.js 20+, Rust with its MSVC toolchain, and Microsoft's C++
#    build tools, and offers to install what is missing (winget, rustup). It
#    asks before installing anything.
# 2. Builds Candy: npm ci, then npm run pack (10-20 minutes the first time).
# 3. Runs the installer it just built: release\Candy-Windows-<version>-setup.exe.
#
# -CheckOnly: only says what is there and what is missing.
#
# ASCII only: Windows PowerShell 5.1 misreads anything else in a file
# without a byte order mark.

param([switch]$CheckOnly)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$Toolchain = "stable-x86_64-pc-windows-msvc"
$VsWhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"

function Say($text) { Write-Host "  $text" }
function Step($text) { Write-Host ""; Write-Host "== $text" -ForegroundColor Cyan }
function Good($text) { Write-Host "  OK  $text" -ForegroundColor Green }
function Fail($text) { Write-Host ""; Write-Host "  $text" -ForegroundColor Red; exit 1 }
function Ask($question) {
  $answer = Read-Host "  $question [Y/n]"
  return ($answer -eq "" -or $answer -match "^[yYsS]")
}
function Has($command) { return [bool](Get-Command $command -ErrorAction SilentlyContinue) }

# What winget installs during this run is only on the PATH of new windows.
function Update-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
    [Environment]::GetEnvironmentVariable("Path", "User") + ";" +
    (Join-Path $env:USERPROFILE ".cargo\bin")
}

# Offers to install a missing tool with winget. Returns once it is installed,
# or stops the script.
function Install-Missing($label, $wingetId, $extra) {
  if ($CheckOnly) { Say "MISSING  $label"; $script:missing = $true; return }
  if (-not (Has "winget")) { Fail "$label is missing, and winget isn't here to install it. Install it by hand (README, Install), then run this again." }
  if (-not (Ask "$label is missing. Install it now with winget?")) { Fail "Install $label, then run this again." }
  $wingetArgs = @("install", "-e", "--id", $wingetId, "--accept-source-agreements", "--accept-package-agreements") + $extra
  & winget @wingetArgs
  Update-Path
}

function Node-Ok {
  if (-not (Has "node")) { return $false }
  $v = (& node --version) -replace "^v", "" -replace "-.*$", ""
  return ([version]$v).Major -ge 20
}

function VcTools-Ok {
  if (-not (Test-Path $VsWhere)) { return $false }
  $found = & $VsWhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  return [bool]$found
}

function Toolchain-Ok {
  if (-not (Has "rustup")) { return $false }
  return [bool]((& rustup toolchain list) -match [regex]::Escape($Toolchain))
}

$script:missing = $false
Update-Path
Write-Host ""
Write-Host "  Candy - Trader Companion: build from source and install" -ForegroundColor White

Step "Node.js 20 or newer"
if (Node-Ok) { Good "Node.js $(& node --version)" }
else {
  Install-Missing "Node.js (LTS)" "OpenJS.NodeJS.LTS" @()
  if (-not $CheckOnly -and -not (Node-Ok)) { Fail "Node.js still isn't found. Open a new window and run this again." }
}

Step "Microsoft C++ build tools"
if (VcTools-Ok) { Good "Visual Studio C++ build tools" }
else {
  Say "Rust needs them to make a Windows app: a few GB, and Windows asks for permission."
  Install-Missing "Visual Studio 2022 C++ build tools" "Microsoft.VisualStudio.2022.BuildTools" @(
    "--override", "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
  )
  if (-not $CheckOnly -and -not (VcTools-Ok)) {
    Fail "The C++ build tools still aren't found. In the Visual Studio Installer, add 'Desktop development with C++', then run this again."
  }
}

Step "Rust, with its MSVC toolchain"
if (-not (Has "rustup")) {
  Install-Missing "Rust (rustup)" "Rustlang.Rustup" @()
  if (-not $CheckOnly -and -not (Has "rustup")) { Fail "rustup still isn't found. Open a new window and run this again." }
}
if (Has "rustup") {
  if (Toolchain-Ok) { Good "Rust $Toolchain" }
  elseif ($CheckOnly) { Say "MISSING  Rust toolchain $Toolchain"; $script:missing = $true }
  else {
    if (-not (Ask "Rust's MSVC toolchain ($Toolchain) is missing. Install it now with rustup?")) { Fail "Install it with: rustup toolchain install $Toolchain" }
    & rustup toolchain install $Toolchain --profile minimal
    if (-not (Toolchain-Ok)) { Fail "rustup couldn't install $Toolchain." }
  }
}
# Build with it, whatever the default toolchain is.
$env:RUSTUP_TOOLCHAIN = $Toolchain

if ($CheckOnly) {
  Write-Host ""
  if ($script:missing) { Say "Something is missing: run install.cmd to install it and build Candy." }
  else { Say "Everything is here: install.cmd builds and installs Candy." }
  exit 0
}

Step "Building Candy from this source (10-20 minutes the first time)"
# What Rust compiles is kept outside this folder, so an update from a new ZIP
# only rebuilds what changed (a few minutes). Delete it to free a few GB.
$env:CARGO_TARGET_DIR = Join-Path $env:LOCALAPPDATA "Candy-build"
Say "Build cache: $env:CARGO_TARGET_DIR"
& npm.cmd ci
if ($LASTEXITCODE -ne 0) { Fail "npm ci failed: the messages above say why." }
& npm.cmd run pack
if ($LASTEXITCODE -ne 0) { Fail "The build failed: the messages above say why." }

Step "Installing"
$version = (Get-Content (Join-Path $root "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json).version
$setup = Join-Path $root "release\Candy-Windows-$version-setup.exe"
if (-not (Test-Path $setup)) { Fail "No installer at $setup." }
Say "Running $setup"
Start-Process -FilePath $setup -Wait
Write-Host ""
Good "Done. Candy is in your Start menu."
