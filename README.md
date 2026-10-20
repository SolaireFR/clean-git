# Git Branch Cleaner

Clean up the local Git branches you no longer need, right from the VS Code sidebar.

Over time, local branches pile up: merged features, branches deleted on the server, experiments. Git Branch Cleaner lists them with their status, shows which ones no longer exist on the remote, and deletes the ones you pick in one click.

## Features

- 📊 List all local branches with their status
- 🔄 Show which branches still exist on the remote (`git fetch --prune` on refresh)
- 🗂️ Repository selector for multi-root workspaces and nested repositories
- ⚡ Automatic update when Git changes (checkout, new or deleted branch, fetch…), without polling
- 🗑️ Delete several local branches at once, with confirmation
- 🔒 Current and main branches are protected from deletion
- 🎨 Follows your VS Code theme

## Installation

Download the `.vsix` file from the [GitHub releases](https://github.com/SolaireFR/git-branch-cleaner/releases), then in VS Code run **Extensions: Install from VSIX...** from the Command Palette (`Ctrl+Shift+P`).

> If the original extension by monkeykjy is installed, uninstall it first to avoid two similar views.

## How to Use

1. Open a folder or workspace containing one or more Git repositories
2. Click the Git Branch Cleaner icon in the activity bar
3. Pick a repository in the selector (shown when there are several)
4. Check the branches to delete and click **Delete N branches**

Click the refresh icon to fetch the remote and update the remote status. Enable VS Code's `git.autofetch` setting to keep it up to date automatically.

Branches are sorted by last commit, newest first. The date of the last commit (`MM-DD`) is shown on the right of the tags; hover it for the full date and time.

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

## Origin

This project is a fork of [git-branch-pruner](https://github.com/monkeykjy/git-branch-pruner) by [monkeykjy](https://github.com/monkeykjy), forked on 2026-09-24 from version 0.1.1. Since then it gained multi-repository support, automatic updates, a redesigned interface, and security and performance fixes. See the [changelog](CHANGELOG.md) for details.

## Feedback

Found a bug or have a suggestion? Open an issue on [GitHub](https://github.com/SolaireFR/git-branch-cleaner/issues).

Want to contribute or run it locally? See the [development guide](DEVELOPMENT.md).

## License

[MIT](LICENSE)
