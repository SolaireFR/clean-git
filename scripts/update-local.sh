#!/usr/bin/env bash
# Build, package and install the extension in the local VS Code (Linux/macOS)
# Usage: ./scripts/update-local.sh
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\033[36m==> %s\033[0m\n' "$1"; }

version=$(node -p "require('./package.json').version")
vsix="clean-git-branch-$version.vsix"

step 'Clean old packages'
rm -f ./*.vsix

step 'Build'
pnpm run build:esbuild --production

step "Package $vsix"
pnpm dlx @vscode/vsce package --no-dependencies --out "$vsix"

# The original extension (monkeykjy) would add a duplicate view next to this one
if code --list-extensions | grep -qx 'monkeykjy.git-branch-pruner'; then
  step 'Uninstall original extension (monkeykjy)'
  code --uninstall-extension monkeykjy.git-branch-pruner
fi

step "Install $vsix"
code --install-extension "$vsix" --force

printf "\033[32mDone: v%s installed. Run 'Developer: Reload Window' (Ctrl+Shift+P) in VS Code to load it.\033[0m\n" "$version"
