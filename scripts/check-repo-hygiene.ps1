$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RepoRoot

Write-Host "== Git status =="
git status --short

Write-Host "`n== Untracked non-ignored files =="
$untracked = git ls-files --others --exclude-standard
if ($untracked) {
  $untracked | ForEach-Object { Write-Host $_ }
} else {
  Write-Host "None"
}

Write-Host "`n== Suspicious temporary artifacts =="
$trackedOrUntracked = git ls-files --cached --others --exclude-standard
$excludedPrefixes = @(
  ".git/",
  "node_modules/",
  "dist/",
  "output/",
  "doc/.obsidian/",
  ".tmp/",
  ".codex-scratch/",
  "scratch/"
)
$suspiciousPatterns = @("*.tmp", "*.bak", "*.scratch.*", "*.debug.*", "*draft*", "*backup*")

$suspicious = @()
foreach ($path in $trackedOrUntracked) {
  $normalized = $path -replace "\\", "/"
  $excluded = $false
  foreach ($prefix in $excludedPrefixes) {
    if ($normalized.StartsWith($prefix)) {
      $excluded = $true
      break
    }
  }
  if ($excluded) { continue }

  $name = Split-Path $normalized -Leaf
  foreach ($pattern in $suspiciousPatterns) {
    if ($name -like $pattern) {
      $suspicious += $normalized
      break
    }
  }
}

if ($suspicious.Count -gt 0) {
  $suspicious | ForEach-Object { Write-Host $_ }
  throw "Suspicious temporary artifacts found."
}

Write-Host "Repo hygiene check passed."
