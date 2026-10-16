# Git Branch Pruner

A VS Code extension to help you manage and clean up Git branches.

Fork of [monkeykjy/git-branch-pruner](https://github.com/monkeykjy/git-branch-pruner) by monkeykjy.

## Features

- 📊 List all local branches with their status
- 🔄 Show which branches still exist on the remote (`git fetch --prune` on refresh)
- 🗂️ Repository selector for multi-root workspaces and nested repositories
- ⚡ Automatic update when Git changes (checkout, new or deleted branch, fetch…), without polling
- 🗑️ Delete several local branches at once, with confirmation
- 🔒 Current and main branches are protected from deletion
- 🎨 Follows your VS Code theme

## How to Use

1. Open a folder or workspace containing one or more Git repositories
2. Click the Git Branch Pruner icon in the activity bar
3. Pick a repository in the selector (shown when there are several)
4. Check the branches to delete and click **Delete N branches**

Click the refresh icon to fetch the remote and update the remote status. Enable VS Code's `git.autofetch` setting to keep it up to date automatically.

## Branch Tags

- `remote`: the branch exists on the remote
- `local only`: no matching branch on the remote (never pushed, or deleted remotely)
- `current`: the checked-out branch (cannot be deleted)
- `main`: the default branch from `origin/HEAD`, else `main` or `master` (cannot be deleted)

## Requirements

- VS Code 1.80.0 or higher
- Git installed (the one configured in VS Code's `git.path` setting is used)
- A trusted workspace: the extension is disabled in Restricted Mode

## Important Notes

- Delete operations only affect local branches, not remote branches
- Branches are deleted with `git branch -D` (force): make sure their changes are merged first
- Nested repositories are discovered up to `git.repositoryScanMaxDepth` levels (VS Code setting, default 1)

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
