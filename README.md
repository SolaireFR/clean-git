# Clean Git

Clean up the local Git branches and stashes you no longer need, right from the VS Code sidebar.

Over time, local branches and stashes pile up: merged features, branches deleted on the server, experiments, forgotten work in progress. Clean Git lists them, shows which branches no longer exist on the remote, and deletes the ones you pick in one click.

## Features

- 📊 List all local branches with their status
- 🔄 Show which branches still exist on the remote (`git fetch --prune` on refresh)
- 📦 **Stashes** tab: list stashes with their date, browse their changes file by file, and drop several at once
- 🗂️ Repository selector for multi-root workspaces and nested repositories
- ⚡ Automatic update when Git changes (checkout, new or deleted branch, stash, fetch…), without polling
- 🔀 Switch branch by clicking its name, browse its changes against the main branch file by file
- 🗑️ Delete several local branches at once, with confirmation
- 🔒 Current and main branches are protected from deletion
- 🎨 Follows your VS Code theme

## Installation

Download the `.vsix` file from the [GitHub releases](https://github.com/SolaireFR/clean-git-branch/releases), then in VS Code run **Extensions: Install from VSIX...** from the Command Palette (`Ctrl+Shift+P`).

> If the original extension by monkeykjy, or this extension under its previous name "Clean Git Branch", is installed, uninstall it first to avoid two similar views.

## How to Use

1. Open a folder or workspace containing one or more Git repositories
2. Click the Clean Git icon in the activity bar
3. Pick the **Branches** or **Stashes** tab
4. Pick a repository in the selector (shown when there are several)
5. Check the branches to delete and click **Delete N branches**, or the stashes to drop and click **Drop N stashes**

On the Branches tab, click the refresh icon to fetch the remote and update the remote status. Enable VS Code's `git.autofetch` setting to keep it up to date automatically.

Branches are sorted by last commit, newest first. The date of the last commit (`MM-DD`) is shown on the right of the tags; hover it for the full date and time.

Click a branch name to switch to it (`git switch`; Git refuses if your local changes would be overwritten). If an interrupted cherry-pick or revert blocks the switch, Clean Git offers to quit it first (`git cherry-pick --quit` / `git revert --quit`): the changes already applied are kept, only the interrupted operation is forgotten.

Click the ⓘ button on the right of a branch to see the changes it made since it left the main branch (compared from their common ancestor, so later commits on the main branch are not counted). The view shows the list of changed files, collapsed, with their added and deleted lines; open a file to load its diff. Click the back arrow to return to the list.

Stashes are listed newest first as `stash@{N}: message`, with their creation date. Click the ⓘ button on the right of a stash to see its changes the same way. Untracked files saved with `git stash -u` are not included. Very long diffs are cut after 5000 lines.

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
- Stashes are dropped with `git stash drop`: a dropped stash no longer appears in Git and is hard to recover
- Nested repositories are discovered up to `git.repositoryScanMaxDepth` levels (VS Code setting, default 1)

## Origin

This project is a fork of [git-branch-pruner](https://github.com/monkeykjy/git-branch-pruner) by [monkeykjy](https://github.com/monkeykjy), forked on 2026-09-24 from version 0.1.1. Since then it gained multi-repository support, automatic updates, a redesigned interface, and security and performance fixes. See the [changelog](CHANGELOG.md) for details.

## Feedback

Found a bug or have a suggestion? Open an issue on [GitHub](https://github.com/SolaireFR/clean-git-branch/issues).

Want to contribute or run it locally? See the [development guide](DEVELOPMENT.md).

## License

[MIT](LICENSE)
