param(
  [switch]$NoBuild
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".env")) {
  Copy-Item "docker-compose.env.example" ".env"
  Write-Host "Created .env from docker-compose.env.example. Update the secrets before exposing this publicly."
}

$arguments = @("compose", "up", "-d")
if (-not $NoBuild) {
  $arguments += "--build"
}

docker @arguments
