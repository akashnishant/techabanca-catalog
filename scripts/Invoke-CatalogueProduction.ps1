[CmdletBinding()]
param(
    [ValidateSet('Plan', 'Build', 'Verify', 'Check')]
    [string]$Action = 'Plan',
    [string]$RepositoryPath = (Join-Path $env:USERPROFILE 'Techabanca\techabanca-catalogue')
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$productionScript = Join-Path $RepositoryPath 'scripts\production.mjs'
if (-not (Test-Path -LiteralPath $productionScript -PathType Leaf)) {
    throw "Catalogue production script was not found at $productionScript"
}
$nodeCommand = Get-Command node -ErrorAction Stop
& $nodeCommand.Source $productionScript ($Action.ToLowerInvariant())
if ($LASTEXITCODE -ne 0) {
    throw "Catalogue production preparation '$Action' failed with exit code $LASTEXITCODE."
}
