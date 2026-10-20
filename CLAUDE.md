# Clean Git Branch

VS Code extension (fork of monkeykjy/git-branch-pruner, published as `SolaireFR.clean-git-branch`) that lists the local branches of the workspace repositories in a sidebar webview and deletes the selected ones.

Commands, project structure and conventions are in the development guide, imported here:

@DEVELOPMENT.md

## Rules

- **Keep the documentation in sync with every user-visible change**, in the same change:
  - `README.md`: for extension users (it is the Marketplace page): what it does, installation, how to use, tags, requirements, notes, origin. No developer commands.
  - `DEVELOPMENT.md`: for developers: setup, commands, Project Structure (update it when files are added, moved or change role), conventions.
  - `CHANGELOG.md`: a new entry in Keep a Changelog format (Added / Changed / Fixed / Security).
- **Bump the version yourself** in `package.json` for every change that ships, following SemVer: patch for fixes and docs, minor for features, major for breaking changes. The changelog entry uses the same version and today's date. The view reads the version from `package.json`.
- Follow the Conventions section of `DEVELOPMENT.md` (security, performance, UI).
