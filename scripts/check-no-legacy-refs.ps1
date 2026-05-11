$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RepoRoot

$ForbiddenPatterns = @(
  "StoreSafeDriver",
  "BrowserCoreV2ToolFacade",
  "BrowserCoreV2ToolInputSchema",
  "__browserCoreV2Bridge",
  "EXTRACT_CURRENT_PAGE",
  "ManualExtraction",
  "src/content/core",
  "src/shared/browser-core",
  "background/browser/facade",
  "background/browser/drivers"
)

$Targets = @("src", "tests", "public", "package.json", "vite.config.ts")

foreach ($pattern in $ForbiddenPatterns) {
  $matches = & git grep -n --fixed-strings -- $pattern -- $Targets 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Forbidden legacy reference found: $pattern"
    $matches | ForEach-Object { Write-Host $_ }
    exit 1
  }
  if ($LASTEXITCODE -gt 1) {
    throw "git grep failed for pattern: $pattern"
  }
}

Write-Host "No forbidden legacy references found."
