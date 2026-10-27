<#
.SYNOPSIS
  Common developer operations. Usage: ./mp.ps1 <command> [args]   (./mp.ps1 help lists them)
#>
param(
  [string]$Command = 'help',
  [switch]$Full,
  [Parameter(ValueFromRemainingArguments)] [string[]]$Rest = @()
)

$ErrorActionPreference = 'Stop'
$venvBin = Join-Path $PSScriptRoot 'tools/.venv/Scripts'
$venvPython = Join-Path $venvBin 'python.exe'
$py = if (Test-Path $venvPython) { $venvPython } else { 'python' }

# Run a native command; stop the script on the first non-zero exit code.
function Step {
  param([string]$Exe, [string[]]$Arguments)
  Write-Host "> $Exe $Arguments" -ForegroundColor Cyan
  & $Exe @Arguments
  if ($LASTEXITCODE -ne 0) { throw "failed (exit $LASTEXITCODE): $Exe $Arguments" }
}

# Put mise's tool dirs (node, python, ffmpeg from mise.toml) in front of PATH, if mise is installed.
function Set-Path {
  $dirs = @()
  if (Get-Command mise -ErrorAction SilentlyContinue) { $dirs = @(& mise bin-paths 2>$null) }
  $env:PATH = (@($venvBin) + $dirs + @($oldPath)) -join [IO.Path]::PathSeparator
}

# One doctor line per check: the script block returns a detail, or throws 'MISSING ...' / 'WRONG VERSION ...'.
$script:problems = 0
function Check {
  param([string]$Name, [scriptblock]$Test)
  try { $status = 'OK'; $detail = "$(& $Test)" }
  catch {
    $m = $_.Exception.Message
    if ($m -match '^(MISSING|WRONG VERSION) (.*)') { $status, $detail = $Matches[1], $Matches[2] } else { $status, $detail = 'MISSING', $m }
    $script:problems++
  }
  Write-Host ('{0,-14} {1,-14} {2}' -f $Name, $status, $detail) -ForegroundColor $(if ($status -eq 'OK') { 'Green' } else { 'Red' })
}

function Doctor {
  Check 'mise' { (Get-Command mise -ErrorAction SilentlyContinue) ? (& mise --version) : (throw 'MISSING scoop install mise (https://mise.jdx.dev)') }
  Check 'node' {
    $v = (& node -v) -replace '^v'
    if ($v -notmatch '^22\.') { throw "WRONG VERSION $v, want 22.x (./mp.ps1 setup)" }
    $v
  }
  Check 'venv' {
    if (-not (Test-Path $venvPython)) { throw 'MISSING tools/.venv (./mp.ps1 setup)' }
    $v = & $venvPython -c 'import sys; print("%d.%d" % sys.version_info[:2])'
    if ($v -ne '3.12') { throw "WRONG VERSION $v, want 3.12 (delete tools/.venv, ./mp.ps1 setup)" }
    "python $v"
  }
  Check 'requirements' {
    if (-not (Test-Path $venvPython)) { throw 'MISSING no venv' }
    $have = (& $venvPython -m pip freeze) | ForEach-Object { $_.ToLower().Replace('_', '-') }
    $want = Get-Content tools/requirements-dev.txt | Where-Object { $_ -match '==' } | ForEach-Object { $_.Trim().ToLower().Replace('_', '-') }
    $bad = @($want | Where-Object { $_ -notin $have })
    if ($bad) { throw "MISSING $($bad -join ', ') (./mp.ps1 setup)" }
    "$($want.Count) pinned packages"
  }
  Check 'node_modules' {
    & npm ls --depth=0 *> $null
    if ($LASTEXITCODE -ne 0) { throw 'MISSING or out of sync with package-lock (./mp.ps1 setup)' }
    'npm ls ok'
  }
  Check 'ffmpeg' {
    $c = Get-Command ffmpeg -ErrorAction SilentlyContinue
    if (-not $c) { throw 'MISSING ffmpeg (mise install, or scoop install ffmpeg)' }
    $c.Source
  }
  Check 'chromium' {
    $p = & node -p "require('@playwright/test').chromium.executablePath()"
    if (-not $p -or -not (Test-Path $p)) { throw 'MISSING Playwright chromium (./mp.ps1 setup)' }
    'playwright chromium'
  }
  if ($script:problems) { throw "doctor: $($script:problems) problem(s)" }
}

# Idempotent: install mise if possible, the pinned tools, the venv, npm deps, chromium; then doctor.
function Setup {
  if (-not (Get-Command mise -ErrorAction SilentlyContinue)) {
    if (Get-Command scoop -ErrorAction SilentlyContinue) { Step scoop @('install', 'mise') }
    else { Write-Host 'mise not found and no scoop. Install mise (https://mise.jdx.dev); continuing with node/python from PATH.' -ForegroundColor Yellow }
  }
  if (Get-Command mise -ErrorAction SilentlyContinue) {
    Step mise @('trust')
    Step mise @('install')
    Set-Path
  }
  if (-not (Test-Path $venvPython)) { Step python @('-m', 'venv', 'tools/.venv') }
  Step $venvPython @('-m', 'pip', 'install', '-r', 'tools/requirements-dev.txt')
  Step npm @('ci')
  Step npx @('playwright', 'install', 'chromium')
  Doctor
}

function Lint {
  Step npx @('biome', 'check')
  Step ruff @('check', '.')
  Step ruff @('format', '--check', '.')
}

function Pack {
  $own = -not $env:PITCH_PASSWORD
  if ($own) {
    $secure = Read-Host 'PITCH_PASSWORD' -AsSecureString
    $env:PITCH_PASSWORD = [System.Net.NetworkCredential]::new('', $secure).Password
  }
  try {
    if (-not $env:PITCH_PASSWORD) { throw 'PITCH_PASSWORD is empty' }
    Step $py (@('tools/pack.py') + $Rest)
  }
  finally {
    if ($own) { Remove-Item Env:PITCH_PASSWORD -ErrorAction SilentlyContinue }
  }
}

function Help {
  @'
Usage: ./mp.ps1 <command> [args]

  setup       install mise + pinned tools, tools/.venv, npm ci, Playwright chromium, then doctor
  doctor      check prerequisites (one line each, exit 1 on any problem)
  dev         Vite dev server
  build       tsc --noEmit + vite build (to dist/)
  preview     serve the build output (vite preview)
  test        vitest
  pytest      Python tests (tools/tests)
  e2e         Playwright tests
  lint        Biome check + Ruff check + Ruff format --check
  format      Biome check --write + Ruff check --fix + Ruff format
  precommit   lint, tsc, vitest, pytest (add -Full to also run e2e)
  pack [args] tools/pack.py, args passed through, e.g. --root work/pack-root --out content --strict
              prompts for PITCH_PASSWORD if it is not set (never printed or stored)
'@
}

Push-Location $PSScriptRoot
$oldPath = $env:PATH
Set-Path

try {
  switch ($Command) {
    'help' { Help }
    'setup' { Setup }
    'doctor' { Doctor }
    'dev' { Step npm @('run', 'dev') }
    'build' { Step npm @('run', 'build') }
    'preview' { Step npx @('vite', 'preview') }
    'test' { Step npx @('vitest', 'run') }
    'pytest' { Step $py (@('-m', 'pytest', 'tools/tests') + $Rest) }
    'e2e' { Step npm @('run', 'e2e') }
    'lint' { Lint }
    'format' {
      Step npx @('biome', 'check', '--write')
      Step ruff @('check', '--fix', '.')
      Step ruff @('format', '.')
    }
    'precommit' {
      Lint
      Step npx @('tsc', '--noEmit')
      Step npx @('vitest', 'run')
      Step $py @('-m', 'pytest', 'tools/tests', '-q')
      if ($Full) { Step npm @('run', 'e2e') }
    }
    'pack' { Pack }
    default { Help; throw "unknown command: $Command" }
  }
}
catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
finally {
  $env:PATH = $oldPath
  Pop-Location
}
