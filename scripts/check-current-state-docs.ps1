$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RepoRoot

$Targets = @("AGENTS.md", "doc/spec.md", "doc/constraints.md", "doc/checkpoint.md", "doc/acceptance.md")
$ForbiddenPhrases = @(
  "previous architecture",
  "deprecated architecture",
  "migrated from",
  "do not use old"
)

foreach ($target in $Targets) {
  if (!(Test-Path $target)) { continue }
  foreach ($phrase in $ForbiddenPhrases) {
    $matches = & git grep -n --fixed-strings -- $phrase -- $target 2>$null
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Possible migration-diary phrase found in ${target}: $phrase"
      $matches | ForEach-Object { Write-Host $_ }
      exit 1
    }
    if ($LASTEXITCODE -gt 1) {
      throw "git grep failed for phrase: $phrase"
    }
  }
}

Write-Host "Current-state docs check passed."
