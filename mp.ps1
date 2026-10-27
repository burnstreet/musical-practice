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

  setup       npm ci, create tools/.venv, install tools/requirements-dev.txt
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
$env:PATH = "$venvBin$([IO.Path]::PathSeparator)$oldPath"
try {
  switch ($Command) {
    'help' { Help }
    'setup' {
      Step npm @('ci')
      if (-not (Test-Path $venvPython)) { Step python @('-m', 'venv', 'tools/.venv') }
      Step $venvPython @('-m', 'pip', 'install', '-r', 'tools/requirements-dev.txt')
    }
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
