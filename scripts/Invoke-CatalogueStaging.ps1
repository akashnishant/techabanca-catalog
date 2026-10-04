[CmdletBinding()]
param(
    [ValidateSet('Plan', 'Build', 'Verify', 'Provision', 'Deploy', 'Smoke')]
    [string]$Action = 'Plan',
    [string]$RepositoryPath = (Join-Path $env:USERPROFILE 'Techabanca\techabanca-catalogue')
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$stagingScript = Join-Path $RepositoryPath 'scripts\staging.mjs'
if (-not (Test-Path -LiteralPath $stagingScript -PathType Leaf)) {
    throw "Catalogue staging script was not found at $stagingScript"
}
$nodeCommand = Get-Command node -ErrorAction Stop
& $nodeCommand.Source $stagingScript ($Action.ToLowerInvariant())
if ($LASTEXITCODE -ne 0) {
    throw "Catalogue staging action '$Action' failed with exit code $LASTEXITCODE."
}
