# Change Log

All notable changes to the "clean-git-branch" extension are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/) and versions follow [Semantic Versioning](https://semver.org/).

## [2.0.0] - 2026-10-22

### Added

- Improve docs and test valided.
- Screenshots in the README.

## [1.4.2] - 2026-10-20

### Changed

- Renamed the extension from "Git Branch Pruner" to "Clean Git Branch" in the interface, the output channel and the documentation. Mentions of the original `monkeykjy/git-branch-pruner` fork are kept in the origin sections.
- The extension identifier is now `SolaireFR.clean-git-branch` and the repository moved to `SolaireFR/clean-git-branch`: uninstall a previous `git-branch-cleaner` build to avoid two views.
- Activity bar icon made more visible.
- The webview view ID now matches the one contributed in `package.json` (`gitBranchCleanerView`), which was required for the view to appear after the manifest rename.

## [1.4.0] - 2026-10-19

### Added

- Date of the last commit (`MM-DD`) on the right of each branch, with the full date and time on hover.

### Changed

- Branches are sorted by last commit, newest first.

## [1.3.1] - 2026-10-16

### Changed

- README rewritten for users (installation, usage, origin of the project); developer documentation moved to `DEVELOPMENT.md`.

## [1.3.0] - 2026-10-16

### Added

- The branch list updates automatically when Git changes (checkout, branch created or deleted, fetch, pull…), using the file watchers of VS Code's built-in Git extension: no polling.
- The repository selector updates automatically when repositories are opened or closed in the workspace.
- Checked branches stay selected when the list is re-rendered or the view is hidden and shown again.

### Changed

- Deleting branches no longer shows a loading screen: the list stays visible and is updated right after.

## [1.2.0] - 2026-10-16

### Added

- Extension version shown at the top of the view.
- `scripts/update-local.ps1` (Windows) and `scripts/update-local.sh` (Linux/macOS) to build, package and install the local development version in one command.

### Changed

- Redesigned view following VS Code theme colors: native-looking dropdown, list rows with hover and selection highlight, compact tags (`current`, `main`, `remote`, `local only`), "select all" with partial state, delete button showing the selected count.
- Shorter description.

## [1.1.0] - 2026-10-16

### Security

- Git runs without a shell (`execFile`): branch names can no longer inject commands.
- Strict Content Security Policy with a nonce in the webview; every value coming from Git is HTML-escaped.
- Messages from the webview are validated: only listed repositories and deletable branches can be targeted.
- The extension is disabled in untrusted workspaces (Restricted Mode), since a repository configuration can run commands during `git fetch`.

### Changed

- Much faster loading: one `git for-each-ref` call instead of 7–8 sequential commands, each previously started twice through a failing `bash.exe` (WSL) then `cmd.exe`.
- Local branches are shown immediately; `git fetch --prune` then runs with a progress bar in the view, only on refresh or the first time a repository is opened.
- Branches are deleted with a single `git branch -D` call.

### Fixed

- Remote status: a tracked branch is checked against its upstream, other branches against any remote (not only `origin`).
- The main branch is read from `origin/HEAD`, falling back to `main` then `master`.
- The error screen now has a refresh button.

## [1.0.2] - 2026-10-16

### Added

- Repository selector for multi-root workspaces and nested repositories.
- Refresh icon next to the selector, replacing the "Refresh Branches" button.
- Local development documentation in the README.

### Changed

- Published as `SolaireFR.git-branch-pruner`, with repository links pointing to the fork.
- English-only interface.

## Fork - 2026-09-24

- Forked from [monkeykjy/git-branch-pruner](https://github.com/monkeykjy/git-branch-pruner) at version 0.1.1 (commit `3f44d71`).
- Documentation translated into English.

## [0.1.1] - 2025-04-21

- Original release by [monkeykjy](https://github.com/monkeykjy/git-branch-pruner).
