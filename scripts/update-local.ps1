# Build, package and install the extension in the local VS Code (Windows)
# Usage: powershell -ExecutionPolicy Bypass -File scripts/update-local.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot)

# Native commands do not throw on failure: stop on a non-zero exit code
function Invoke-Step([string]$label, [scriptblock]$command) {
  Write-Host "==> $label" -ForegroundColor Cyan
  & $command
  if ($LASTEXITCODE) { throw "$label failed (exit code $LASTEXITCODE)" }
}

$version = node -p "require('./package.json').version"
$vsix = "git-branch-pruner-$version.vsix"

Invoke-Step 'Clean old packages' { Remove-Item *.vsix -ErrorAction SilentlyContinue; $global:LASTEXITCODE = 0 }
Invoke-Step 'Build' { pnpm run build:esbuild --production }
Invoke-Step "Package $vsix" { pnpm dlx @vscode/vsce package --no-dependencies --out $vsix }

# The original extension registers the same view IDs and would hide this one
if (code --list-extensions | Select-String -SimpleMatch -Quiet 'monkeykjy.git-branch-pruner') {
  Invoke-Step 'Uninstall original extension (monkeykjy)' { code --uninstall-extension monkeykjy.git-branch-pruner }
}
Invoke-Step "Install $vsix" { code --install-extension $vsix --force }

Write-Host "Done: v$version installed. Run 'Developer: Reload Window' (Ctrl+Shift+P) in VS Code to load it." -ForegroundColor Green
