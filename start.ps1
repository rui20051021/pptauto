$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiPath = Join-Path $repoRoot "apps\api"
$webPath = Join-Path $repoRoot "apps\web"

Write-Host "Starting PPT Master SaaS backend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$apiPath'; uvicorn app.main:app --reload"

Write-Host "Starting PPT Master SaaS frontend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$webPath'; npm run dev"

Write-Host "Backend and frontend launch commands have been started." -ForegroundColor Green
