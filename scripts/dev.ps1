param([string]$AdminEmail = 'admin@aegitasks.local')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$dataPath = Join-Path (Get-Location) 'server/AegiTasks.Api/.local-data'
New-Item -ItemType Directory -Force $dataPath | Out-Null
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:DatabaseProvider = 'Sqlite'
$env:ConnectionStrings__Default = "Data Source=$(Join-Path $dataPath 'aegitasks.db')"
$env:SEED_ADMIN_EMAIL = $AdminEmail
if (-not (Test-Path (Join-Path $dataPath 'aegitasks.db'))) {
    $secret = Read-Host 'Initial admin password (12+ characters)' -AsSecureString
    $env:SEED_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $secret).Password
}
try { dotnet run --project server/AegiTasks.Api --urls http://localhost:5213 }
finally { Remove-Item Env:SEED_ADMIN_PASSWORD -ErrorAction SilentlyContinue }
