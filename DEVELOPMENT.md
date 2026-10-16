# Development Guide

How to build, run and change Git Branch Pruner. For what the extension does, see the [README](README.md).

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- Git
- VS Code 1.80.0 or higher

## Setup

```bash
git clone https://github.com/SolaireFR/git-branch-pruner.git
cd git-branch-pruner
pnpm install
```

> pnpm 10+ blocks dependency build scripts by default. If it warns about `esbuild` or `sharp`, run `pnpm approve-builds` (or set them to `true` under `allowBuilds` in `pnpm-workspace.yaml`).

## Commands

| Command | What it does |
|---|---|
| `pnpm run build:esbuild` | Bundle `src/extension.ts` into `dist/extension.js` (add `--production` to minify) |
| `pnpm run watch` | Rebuild on every change (used by `F5`) |
| `npx tsc --noEmit -p .` | Typecheck |
| `pnpm run test:unit` | Branch parser check on a temporary Git repository (plain Node, no VS Code) |
| `scripts/update-local.ps1` / `scripts/update-local.sh` | Build, package and install the dev version in your VS Code |

## Project Structure

```
src/
  extension.ts                           Entry point: registers the webview view provider
  providers/BranchPrunerViewProvider.ts  View logic: messages from the webview, refresh/fetch, delete,
                                         auto-sync on Git events (debounced, skipped if the list is unchanged)
  services/GitService.ts                 Git access: repositories and git path via the built-in `vscode.git` API,
                                         git commands via execFile (no shell), watch() on Git events
  services/branchParser.ts               Pure parser of `git for-each-ref` output (no vscode import, testable)
  views/webview.ts                       HTML/CSS/JS of the view as strings (CSP + nonce, theme variables)
  types/index.ts                         Branch interface
  test/branchParser.check.ts             Runnable check on a temporary git repo (`pnpm run test:unit`)
scripts/update-local.ps1|.sh             Build, package and install the dev version in the local VS Code
media/                                   Activity bar icon
package.json                             Manifest: version, view contributions, capabilities (no untrusted workspaces)
```

Communication between the webview and the extension:

- webview → extension: `postMessage` with `refresh`, `selectRepository` or `confirmDelete`
- extension → webview: the whole `webview.html` is replaced, plus a `setControlsState` message to enable or disable the controls

## Run the Extension in VS Code

1. Open the project folder in VS Code.
2. Press `F5` (or **Run and Debug** → **Run Extension**).
   - This starts the `watch` task and opens a new **Extension Development Host** window.
3. In that new window, open a folder that is a Git repository, then click the Git Branch Pruner icon in the activity bar.
4. After editing the code, esbuild rebuilds automatically; reload the host window with `Ctrl+R` (`Cmd+R` on macOS) or **Developer: Reload Window**.

Breakpoints in `src/` work directly in the original VS Code window. To inspect the webview UI, run **Developer: Open Webview Developer Tools** from the Command Palette of the host window.

## Install the Dev Build in Your VS Code

One command cleans old `.vsix` files, builds, packages, uninstalls the original `monkeykjy` extension if present, and installs the new package:

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
code --install-extension git-branch-pruner-<version>.vsix --force
```

`--force` is required when the version in `package.json` has not changed. Use the exact `.vsix` file name: PowerShell does not expand `*`.

> **Still seeing the old UI after reloading?** The original extension (publisher `monkeykjy`) may be installed alongside this fork (publisher `SolaireFR`). Both register the same view IDs, so VS Code only shows the first one:
>
> ```bash
> code --list-extensions --show-versions | grep -i pruner
> code --uninstall-extension monkeykjy.git-branch-pruner
> ```
>
> Then reload the window again. (In PowerShell, use `Select-String pruner` instead of `grep -i pruner`.)

## Conventions

- **Security**: never run git through a shell (`execFile` with an argument array, `--` before branch names); HTML-escape every value coming from Git; no inline event handlers (the CSP only allows the nonce'd script); validate every webview message.
- **Performance**: no polling; prefer one git call over several; never fetch in the background.
- **UI**: text in English; colors only from `--vscode-*` theme variables.
- **Docs and version**: every user-visible change updates `README.md` (for users), this file (for developers), `CHANGELOG.md`, and bumps the version in `package.json` following SemVer.
