<#
.SYNOPSIS
Installs the "DSH Web" Start Menu shortcut for this checkout.

.DESCRIPTION
Creates the shortcut that launches dsh-web.ps1 with `pnpm dsh web --no-open`, then
places it in the current user's Start Menu Programs folder.

The shortcut targets a PowerShell host with the script as its argument, because
Windows never runs a .ps1 file on double-click and refuses to pin one to the
taskbar directly. A multi-size icon is rendered from the repository's favicon into
%LOCALAPPDATA%\DSH so the pinned entry does not show the generic console icon.
Re-running the script overwrites the shortcut; pass -ForceIcon to re-render the
icon as well.

.PARAMETER ForceIcon
Re-renders the icon even when one is already present.

.EXAMPLE
pwsh -File install-dsh-web-shortcut.ps1

Creates the shortcut using the default paths.
#>
#Requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$ForceIcon
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = $PSScriptRoot
$launcher = Join-Path $repoRoot 'dsh-web.ps1'
if (-not (Test-Path -LiteralPath $launcher)) {
    throw "dsh-web.ps1 not found next to this script: $launcher"
}

# Prefer the current PowerShell 7 host, falling back to the Windows PowerShell that
# ships with Windows. Both are recorded as absolute paths so the shortcut still
# launches when PATH changes between sessions.
$powerShellHost = $null
$pwshCommand = Get-Command pwsh -ErrorAction SilentlyContinue
if ($pwshCommand) { $powerShellHost = $pwshCommand.Source }
if (-not $powerShellHost) {
    $powerShellHost = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
}

$iconDirectory = Join-Path $env:LOCALAPPDATA 'DSH'
$iconPath = Join-Path $iconDirectory 'dsh-web.ico'
$shortcutName = 'DSH Web.lnk'
$shortcutPath = Join-Path (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs') $shortcutName

function Get-MagickPath {
    <#
    .SYNOPSIS
    Returns the ImageMagick executable path, or $null when it is not installed.
    #>
    $command = Get-Command magick -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $installRoot = Join-Path $env:ProgramFiles 'ImageMagick*'
    $found = Get-ChildItem -Path $installRoot -Filter 'magick.exe' -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($found) { return $found.FullName }
    return $null
}

function New-DshIcon {
    <#
    .SYNOPSIS
    Renders dsh-web.ico from a repository SVG, returning $true on success.
    #>
    param(
        [Parameter(Mandatory)][string]$Magick,
        [Parameter(Mandatory)][string]$Svg,
        [Parameter(Mandatory)][string]$OutFile
    )

    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutFile) | Out-Null
    $png = Join-Path (Split-Path -Parent $OutFile) 'dsh-web-icon.png'
    Remove-Item -LiteralPath $png, $OutFile -Force -ErrorAction SilentlyContinue

    # ImageMagick's RSVG delegate rejects this SVG's dimensions, so the internal
    # renderer (MSVG) is the fallback that actually produces pixels.
    $errors = & $Magick -background none -density 600 $Svg -resize 256x256 $png 2>&1
    if (-not (Test-Path -LiteralPath $png)) {
        $errors = & $Magick -background none -density 600 "MSVG:$Svg" -resize 256x256 $png 2>&1
    }
    if (-not (Test-Path -LiteralPath $png)) {
        Write-Warning "icon render failed: $errors"
        return $false
    }

    $null = & $Magick $png -define icon:auto-resize=256,128,64,48,32,16 $OutFile 2>&1
    Remove-Item -LiteralPath $png -Force -ErrorAction SilentlyContinue
    if (-not (Test-Path -LiteralPath $OutFile)) {
        Write-Warning 'icon packaging failed'
        return $false
    }
    return $true
}

$iconReady = (Test-Path -LiteralPath $iconPath) -and -not $ForceIcon
if (-not $iconReady) {
    $svgSources = @(
        (Join-Path $repoRoot 'website\public\favicon.svg')
    ) | Where-Object { Test-Path -LiteralPath $_ }

    $magick = Get-MagickPath
    if (-not $magick) {
        Write-Warning 'ImageMagick not found; installing without a custom icon'
        Write-Warning 'install it from https://imagemagick.org, then re-run this script with -ForceIcon'
    }
    elseif (-not $svgSources) {
        Write-Warning 'no favicon.svg found under website\public; installing without a custom icon'
    }
    else {
        $iconReady = New-DshIcon -Magick $magick -Svg $svgSources[0] -OutFile $iconPath
        if ($iconReady) { Write-Host "icon:     $iconPath" }
    }
}

$shortcutArguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $launcher + '"'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powerShellHost
$shortcut.Arguments = $shortcutArguments
$shortcut.WorkingDirectory = $repoRoot
$shortcut.Description = 'Start the DSH Web UI without opening a browser'
$shortcut.WindowStyle = 1
if ($iconReady) { $shortcut.IconLocation = $iconPath + ',0' }
$shortcut.Save()

Write-Host "shortcut: $shortcutPath"
Write-Host "target:   $powerShellHost $shortcutArguments"

# Pinning copies the shortcut, so an entry pinned before this script changed target
# keeps launching the old launcher. Refresh that copy in place when it exists;
# creating a pin programmatically stays blocked by Windows.
$pinnedPath = Join-Path (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar') $shortcutName
if (Test-Path -LiteralPath $pinnedPath) {
    $pinned = $shell.CreateShortcut($pinnedPath)
    $pinned.TargetPath = $powerShellHost
    $pinned.Arguments = $shortcutArguments
    $pinned.WorkingDirectory = $repoRoot
    $pinned.Description = 'Start the DSH Web UI without opening a browser'
    $pinned.WindowStyle = 1
    if ($iconReady) { $pinned.IconLocation = $iconPath + ',0' }
    $pinned.Save()
    Write-Host "taskbar:  $pinnedPath (existing pin refreshed)"
}
Write-Host ''
Write-Host 'Windows cannot pin a script directly, so pin this shortcut instead:'
Write-Host '  1. Start menu search "DSH Web" -> right-click -> Pin to Start'
Write-Host '  2. All apps -> DSH Web -> right-click -> Show more options -> Pin to taskbar'
Write-Host 'If the taskbar shows a console icon, run "ie4uinit.exe -show" to refresh the icon cache.'
