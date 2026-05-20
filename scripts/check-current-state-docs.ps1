$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RepoRoot

$Targets = @("AGENTS.md", "README.md", "doc/spec.md", "doc/constraints.md", "doc/checkpoint.md", "doc/acceptance.md")
$ForbiddenPhrases = @(
  "previous architecture",
  "deprecated architecture",
  "migrated from",
  "do not use old"
)

$ForbiddenCurrentStateRefs = @(
  "src/background/browser/capability/types.ts",
  "src/content/index.ts",
  "src/content/actions.ts",
  "scanner/actions/research/extractor",
  "tests/runtime.test.ts",
  "tests/runtime-bootstrap.test.ts",
  "tests/runtime-tools.test.ts",
  "tests/sidepanel.test.ts",
  "tests/result-filter.test.ts",
  "runtime-tools"
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

  foreach ($ref in $ForbiddenCurrentStateRefs) {
    $matches = & git grep -n --fixed-strings -- $ref -- $target 2>$null
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Stale current-state reference found in ${target}: $ref"
      $matches | ForEach-Object { Write-Host $_ }
      exit 1
    }
    if ($LASTEXITCODE -gt 1) {
      throw "git grep failed for stale reference: $ref"
    }
  }
}

Write-Host "Current-state docs check passed."
