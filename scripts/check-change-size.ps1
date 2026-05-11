$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RepoRoot

$LineThreshold = 500
$FileThreshold = 8
$excludedPrefixes = @("node_modules/", "dist/", "output/", "doc/.obsidian/")

$changedFiles = New-Object System.Collections.Generic.HashSet[string]
$changedLines = 0

$numstat = git diff --numstat HEAD -- .
foreach ($line in $numstat) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  $parts = $line -split "`t"
  if ($parts.Count -lt 3) { continue }
  $path = $parts[2] -replace "\\", "/"
  $excluded = $false
  foreach ($prefix in $excludedPrefixes) {
    if ($path.StartsWith($prefix)) {
      $excluded = $true
      break
    }
  }
  if ($excluded) { continue }
  [void]$changedFiles.Add($path)
  if ($parts[0] -match "^\d+$") { $changedLines += [int]$parts[0] }
  if ($parts[1] -match "^\d+$") { $changedLines += [int]$parts[1] }
}

$untracked = git ls-files --others --exclude-standard
foreach ($path in $untracked) {
  $normalized = $path -replace "\\", "/"
  $excluded = $false
  foreach ($prefix in $excludedPrefixes) {
    if ($normalized.StartsWith($prefix)) {
      $excluded = $true
      break
    }
  }
  if ($excluded) { continue }
  [void]$changedFiles.Add($normalized)
  if (Test-Path -LiteralPath $normalized -PathType Leaf) {
    try {
      $changedLines += (Get-Content -LiteralPath $normalized | Measure-Object -Line).Lines
    } catch {
      Write-Host "Skipped line count for $normalized"
    }
  }
}

Write-Host "Changed files: $($changedFiles.Count)"
Write-Host "Changed lines: $changedLines"

if ($changedFiles.Count -ge $FileThreshold -or $changedLines -ge $LineThreshold) {
  Write-Host "Large-change threshold reached. Run npm run check:repo before final handoff."
} else {
  Write-Host "Large-change threshold not reached."
}
