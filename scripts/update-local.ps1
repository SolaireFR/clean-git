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
$vsix = "clean-git-$version.vsix"

Invoke-Step 'Clean old packages' { Remove-Item *.vsix -ErrorAction SilentlyContinue; $global:LASTEXITCODE = 0 }
Invoke-Step 'Build' { pnpm run build:esbuild --production }
Invoke-Step "Package $vsix" { pnpm dlx @vscode/vsce package --no-dependencies --out $vsix }

# The original extension (monkeykjy) and this one under its previous ID would add a duplicate view next to this one
$installed = code --list-extensions
foreach ($old in 'monkeykjy.git-branch-pruner', 'SolaireFR.clean-git-branch') {
  if ($installed | Select-String -SimpleMatch -Quiet $old) {
    Invoke-Step "Uninstall $old" { code --uninstall-extension $old }
  }
}
Invoke-Step "Install $vsix" { code --install-extension $vsix --force }

Write-Host "Done: v$version installed. Run 'Developer: Reload Window' (Ctrl+Shift+P) in VS Code to load it." -ForegroundColor Green
