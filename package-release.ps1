param(
  [string]$OutputDir = "release",
  [switch]$SkipValidation
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$releaseRoot = Join-Path $PSScriptRoot $OutputDir
$packageName = "ppt-master-saas-$timestamp"
$stageDir = Join-Path $releaseRoot $packageName
$zipPath = Join-Path $releaseRoot "$packageName.zip"

function Invoke-Robocopy {
  param(
    [string]$Source,
    [string]$Destination
  )

  $null = New-Item -ItemType Directory -Force -Path $Destination
  & robocopy $Source $Destination /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP `
    /XD node_modules .vite .git __pycache__ .pytest_cache var projects examples `
    /XF *.pyc *.pyo *.log .env

  if ($LASTEXITCODE -gt 7) {
    throw "robocopy failed with exit code $LASTEXITCODE while copying $Source"
  }
}

if (-not $SkipValidation) {
  Push-Location (Join-Path $PSScriptRoot "apps\api")
  python -m pytest tests
  Pop-Location

  Push-Location (Join-Path $PSScriptRoot "apps\web")
  npm run build
  Pop-Location
}

if (Test-Path $stageDir) {
  Remove-Item -Recurse -Force $stageDir
}
if (Test-Path $zipPath) {
  Remove-Item -Force $zipPath
}

$null = New-Item -ItemType Directory -Force -Path $stageDir

$rootFiles = @(
  ".dockerignore",
  ".gitignore",
  "README.md",
  "README_CN.md",
  "LICENSE",
  "docker-compose.yml",
  "docker-compose.env.example",
  "docker-up.ps1",
  "docker-down.ps1",
  "package-release.ps1"
)

foreach ($file in $rootFiles) {
  $sourcePath = Join-Path $PSScriptRoot $file
  if (Test-Path $sourcePath) {
    Copy-Item $sourcePath (Join-Path $stageDir $file)
  }
}

Invoke-Robocopy -Source (Join-Path $PSScriptRoot "apps") -Destination (Join-Path $stageDir "apps")
Invoke-Robocopy -Source (Join-Path $PSScriptRoot "docs") -Destination (Join-Path $stageDir "docs")
Invoke-Robocopy -Source (Join-Path $PSScriptRoot "skills") -Destination (Join-Path $stageDir "skills")

Compress-Archive -Path $stageDir -DestinationPath $zipPath -Force

Write-Host "Package created:"
Write-Host $zipPath
