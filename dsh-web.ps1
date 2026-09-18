<#
.SYNOPSIS
Starts the DSH Web UI from this checkout without opening a browser.

.DESCRIPTION
Runs `pnpm dsh web --no-open` from the repository root, so the script behaves the
same however it is launched. The exit code from pnpm is propagated to the caller.

Windows does not run .ps1 files on double-click, so launch this through the Start
Menu shortcut created by install-dsh-web-shortcut.ps1, or right-click the file and
choose "Run with PowerShell".

.EXAMPLE
pwsh -File dsh-web.ps1

Serves the Web UI without opening a browser.
#>
#Requires -Version 5.1
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    throw 'pnpm is not on PATH; install it from https://pnpm.io/installation'
}

$exitCode = 0
Push-Location -LiteralPath $PSScriptRoot
try {
    # Windows PowerShell turns a native command's stderr into a terminating error
    # under ErrorActionPreference Stop. This script proxies pnpm, so it must let
    # pnpm's own output and exit code through untouched instead.
    $ErrorActionPreference = 'Continue'
    & pnpm dsh web --no-open
    $exitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}

exit $exitCode
