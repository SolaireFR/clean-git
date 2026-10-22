# Development Guide

How to build, run and change Clean Git. For what the extension does, see the [README](README.md).

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- Git
- VS Code 1.80.0 or higher

## Setup

```bash
git clone https://github.com/SolaireFR/clean-git-branch.git
cd clean-git-branch
pnpm install
```

> pnpm 10+ blocks dependency build scripts by default. If it warns about `esbuild` or `sharp`, run `pnpm approve-builds` (or set them to `true` under `allowBuilds` in `pnpm-workspace.yaml`).

## Commands

| Command | What it does |
|---|---|
| `pnpm run build:esbuild` | Bundle `src/extension.ts` into `dist/extension.js` (add `--production` to minify) |
| `pnpm run watch` | Rebuild on every change (used by `F5`) |
| `npx tsc --noEmit -p .` | Typecheck |
| `pnpm run test:unit` | Parser checks plus the git calls (delete, drop, diff, switch blocked by a cherry-pick), on a temporary Git repository (plain Node, no VS Code) |
| `scripts/update-local.ps1` / `scripts/update-local.sh` | Build, package and install the dev version in your VS Code |

## Project Structure

```
src/
  extension.ts                           Entry point: registers the webview view provider
  providers/BranchPrunerViewProvider.ts  View logic: Branches/Stashes tabs, messages from the webview, refresh/fetch,
                                         delete/drop, auto-sync on Git events (debounced, skipped if the list is unchanged)
  services/GitService.ts                 Git access: repositories and git path via the built-in `vscode.git` API,
                                         git commands via execFile (no shell), watch() on Git events
  services/branchParser.ts               Pure parsers of `git for-each-ref` (sorted by last commit), `git stash list`
                                         `git diff --numstat -z` (changed files) and single-file `git diff` (hunks) output
                                         (no vscode import, testable)
  views/webview.ts                       HTML/CSS/JS of the view as strings (CSP + nonce, theme variables);
                                         one generic list renderer shared by both tabs
  types/index.ts                         Branch and Stash interfaces, Tab type
  test/branchParser.check.ts             Runnable check on a temporary git repo (`pnpm run test:unit`)
scripts/update-local.ps1|.sh             Build, package and install the dev version in the local VS Code
media/                                   Activity bar icon
package.json                             Manifest: version, view contributions, capabilities (no untrusted workspaces)
```

Communication between the webview and the extension:

- webview → extension: `postMessage` with `refresh`, `selectRepository`, `selectTab`, `confirmDelete` (`items`: branch names, or stash hashes on the Stashes tab, checked against the displayed list) `showInfo` (`item`: a displayed stash hash, or a displayed non-main branch; replaces the list with the changes page), `switchBranch` (`item`: a displayed branch other than the current one; offers `cherry-pick`/`revert --quit` when git refuses because one is in progress)
- Changes page → extension: `loadDiff` (`index` of a file of the page, checked against the stored list) and `back`; extension → page: a `diff` message with the lines (inserted with `textContent`), capped at 5000. While the page is shown, Git change syncs are skipped; going back re-reads the list
- Diffs use `diffRange` (`hash^1 hash` for a stash, `refs/heads/main...refs/heads/branch` for a branch) with `--no-ext-diff --no-textconv` (no command configured by the repository runs) and `--literal-pathspecs`
- Stashes are identified by commit hash, not by `stash@{N}` (indexes shift): `dropStashes` resolves the current refs and drops from the highest index
- extension → webview: the whole `webview.html` is replaced, plus a `setControlsState` message to enable or disable the controls

## Run the Extension in VS Code

1. Open the project folder in VS Code.
2. Press `F5` (or **Run and Debug** → **Run Extension**).
   - This starts the `watch` task and opens a new **Extension Development Host** window.
3. In that new window, open a folder that is a Git repository, then click the Clean Git icon in the activity bar.
4. After editing the code, esbuild rebuilds automatically; reload the host window with `Ctrl+R` (`Cmd+R` on macOS) or **Developer: Reload Window**.

Breakpoints in `src/` work directly in the original VS Code window. To inspect the webview UI, run **Developer: Open Webview Developer Tools** from the Command Palette of the host window.

## Install the Dev Build in Your VS Code

One command cleans old `.vsix` files, builds, packages, uninstalls the original `monkeykjy` extension and the previous `SolaireFR.clean-git-branch` ID if present, and installs the new package:

```bash
# Windows
powershell -ExecutionPolicy Bypass -File scripts/update-local.ps1
# Linux / macOS
./scripts/update-local.sh
```

Then run **Developer: Reload Window** in VS Code (the VS Code CLI cannot reload a window).

Manual equivalent:

```bash
pnpm run build:esbuild --production
pnpm dlx @vscode/vsce package --no-dependencies
code --install-extension clean-git-<version>.vsix --force
```

`--force` is required when the version in `package.json` has not changed. Use the exact `.vsix` file name: PowerShell does not expand `*`.

> **Still seeing the old UI after reloading?** The original extension (publisher `monkeykjy`) may be installed alongside this fork (publisher `SolaireFR`). Both add a similar view to the activity bar, so uninstall the original to avoid duplicates:
>
> ```bash
> code --list-extensions --show-versions | grep -i pruner
> code --uninstall-extension monkeykjy.git-branch-pruner
> code --uninstall-extension SolaireFR.clean-git-branch   # this fork under its previous ID
> ```
>
> Then reload the window again. (In PowerShell, use `Select-String pruner` instead of `grep -i pruner`.)

## Conventions

- **Security**: never run git through a shell (`execFile` with an argument array, `--` before branch names); HTML-escape every value coming from Git; no inline event handlers (the CSP only allows the nonce'd script); validate every webview message.
- **Performance**: no polling; prefer one git call over several; never fetch in the background.
- **UI**: text in English; colors only from `--vscode-*` theme variables.
- **Docs and version**: every user-visible change updates `README.md` (for users), this file (for developers), `CHANGELOG.md`, and bumps the version in `package.json` following SemVer.
