[CmdletBinding()]
param(
    [ValidateSet('Plan', 'Build', 'Verify', 'Check', 'Provision', 'Bootstrap', 'Deploy', 'Smoke', 'ConfigureSecurity')]
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
if ($Action -eq 'ConfigureSecurity') {
    $siteKey = Read-Host 'Catalogue-only production Turnstile site key'
    $secureSecret = Read-Host 'Catalogue-only production Turnstile secret key' -AsSecureString
    $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret)
    try {
        $turnstileSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
        $payload = @{ TURNSTILE_SITE_KEY = $siteKey; TURNSTILE_SECRET_KEY = $turnstileSecret } | ConvertTo-Json -Compress
        $payload | & $nodeCommand.Source $productionScript 'configure-security'
        $configureExitCode = $LASTEXITCODE
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
        $turnstileSecret = $null
        $payload = $null
        $secureSecret.Dispose()
    }
    if ($configureExitCode -ne 0) { throw "Production security configuration failed." }
} else {
    & $nodeCommand.Source $productionScript ($Action.ToLowerInvariant())
    if ($LASTEXITCODE -ne 0) {
        throw "Catalogue production action '$Action' failed with exit code $LASTEXITCODE."
    }
}
