# Git Branch Pruner

A VS Code extension to help you manage and clean up Git branches.

Fork of [monkeykjy/git-branch-pruner](https://github.com/monkeykjy/git-branch-pruner) by monkeykjy.

English | [Chinese](README_EN.md)

## Features

- 📊 Visually display all local branch statuses
- 🔄 Show branch synchronization status with remote repository
- 🗑️ Easily delete merged or remotely deleted branches
- 🔍 Clearly identify current and main branches
- 🌏 Support for English interface

## How to Use

1. Open a Git repository in VS Code
2. Click the Git Branch Pruner icon in the activity bar
3. View branch list and status
4. Select branches to delete and click "Delete Selected" button

## Branch Status Indicators

- ✓ Remote: Branch exists in remote repository
- ✗ Remote: Branch does not exist in remote repository
- Current: Currently checked out branch
- Main: main or master branch

## Requirements

- VS Code 1.80.0 or higher
- Git 2.0.0 or higher

## Important Notes

- Delete operations only affect local branches, not remote branches
- Ensure changes are merged before deleting branches
- Main branches (main/master) are protected from deletion by default

## Local Development

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- Git
- VS Code 1.80.0 or higher

### Setup

```bash
git clone https://github.com/SolaireFR/git-branch-pruner.git
cd git-branch-pruner
pnpm install
```

> pnpm 10+ blocks dependency build scripts by default. If it warns about `esbuild` or `sharp`, run `pnpm approve-builds` (or set them to `true` under `allowBuilds` in `pnpm-workspace.yaml`).

### Run the extension in VS Code

1. Open the project folder in VS Code.
2. Press `F5` (or **Run and Debug** → **Run Extension**).
   - This starts the `watch` task (esbuild bundles `src/extension.ts` into `dist/extension.js`) and opens a new **Extension Development Host** window.
3. In that new window, open a folder that is a Git repository, then click the Git Branch Pruner icon in the activity bar.
4. After editing the code, esbuild rebuilds automatically; reload the host window with `Ctrl+R` (`Cmd+R` on macOS) or **Developer: Reload Window**.

Breakpoints in `src/` work directly in the original VS Code window. To inspect the webview UI, run **Developer: Open Webview Developer Tools** from the Command Palette of the host window.

### Build and install a local package

```bash
pnpm run build:esbuild
pnpm dlx @vscode/vsce package
code --install-extension git-branch-pruner-*.vsix
```

### Update the installed extension after a local change

One command does it all: clean old `.vsix` files, build, package, uninstall the original `monkeykjy` extension if present, and install the new package.

```bash
# Windows
powershell -ExecutionPolicy Bypass -File scripts/update-local.ps1
# Linux / macOS
./scripts/update-local.sh
```

Then run **Developer: Reload Window** in VS Code (the VS Code CLI cannot reload a window).

The manual steps below do the same thing.

1. Rebuild and repackage:

   ```bash
   pnpm run build:esbuild
   pnpm dlx @vscode/vsce package
   ```

2. Reinstall over the existing version. `--force` is required when the version in `package.json` has not changed:

   ```bash
   code --install-extension git-branch-pruner-<version>.vsix --force
   ```

3. Run **Developer: Reload Window** (or restart VS Code) to load the new build.

Optionally, bump the version first with `pnpm version patch --no-git-tag-version` so the installed version shows the change in the Extensions view.

> Use the exact `.vsix` file name: PowerShell does not expand `*`, and old packages pile up in the project folder (they are ignored by git).

> **Still seeing the old UI after reloading?** Check that the original extension (publisher `monkeykjy`) is not installed alongside this fork (publisher `SolaireFR`). Both register the same view IDs, so VS Code only shows the first one. List and remove it with:
>
> ```bash
> code --list-extensions --show-versions | grep -i pruner
> code --uninstall-extension monkeykjy.git-branch-pruner
> ```
>
> Then reload the window again. (In PowerShell, use `Select-String pruner` instead of `grep -i pruner`.)

## Feedback

If you encounter any issues or have suggestions, please raise them in [GitHub Issues](https://github.com/SolaireFR/git-branch-pruner/issues).

## Changelog

See [CHANGELOG.md](CHANGELOG.md)

## License

[MIT](LICENSE)
