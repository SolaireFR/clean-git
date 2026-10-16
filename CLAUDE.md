# Git Branch Pruner

VS Code extension (fork of monkeykjy/git-branch-pruner, published as `SolaireFR.git-branch-pruner`) that lists the local branches of the workspace repositories in a sidebar webview and deletes the selected ones.

## Structure

```
src/
  extension.ts                        Entry point: registers the webview view provider
  providers/BranchPrunerViewProvider.ts  View logic: messages from the webview, refresh/fetch, delete,
                                         auto-sync on Git events (debounced, skipped if the list is unchanged)
  services/GitService.ts              Git access: repositories and git path via the built-in `vscode.git` API,
                                      git commands via execFile (no shell), watch() on Git events
  services/branchParser.ts            Pure parser of `git for-each-ref` output (no vscode import, testable)
  views/webview.ts                    HTML/CSS/JS of the view as strings (CSP + nonce, theme variables)
  types/index.ts                      Branch interface
  test/branchParser.check.ts          Runnable check on a temporary git repo (`pnpm run test:unit`)
scripts/update-local.ps1|.sh          Build, package and install the dev version in the local VS Code
media/                                Activity bar icon
package.json                          Manifest: version, view contributions, capabilities (no untrusted workspaces)
```

Communication: webview → extension with `postMessage` (`refresh`, `selectRepository`, `confirmDelete`); extension → webview by replacing `webview.html`, plus a `setControlsState` message.

## Commands

- `pnpm run build:esbuild`: bundle `src/extension.ts` into `dist/extension.js`
- `npx tsc --noEmit -p .`: typecheck
- `pnpm run test:unit`: parser check (plain Node, no VS Code)
- `scripts/update-local.ps1` (Windows) / `scripts/update-local.sh`: install the dev build, then **Developer: Reload Window**
- `F5`: run in an Extension Development Host

## Rules

- **Keep the documentation in sync with every user-visible change**, in the same change:
  - `README.md`: Features, How to Use, Branch Tags, Requirements, Important Notes, Local Development. It is the Marketplace page, written for extension users.
  - `CHANGELOG.md`: a new entry in Keep a Changelog format (Added / Changed / Fixed / Security).
  - This file: the Structure section when files are added, moved or change role.
- **Bump the version yourself** in `package.json` for every change that ships, following SemVer: patch for fixes, minor for features, major for breaking changes. The changelog entry uses the same version and today's date. The view reads the version from `package.json`.
- Security: never run git through a shell (`execFile` with an argument array, `--` before branch names); HTML-escape every value coming from Git; no inline event handlers (the CSP only allows the nonce'd script); validate every webview message.
- Performance: no polling; prefer one git call over several; never fetch in the background.
- UI text is in English; colors only come from `--vscode-*` theme variables.
