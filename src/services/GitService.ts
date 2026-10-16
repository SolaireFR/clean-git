import { execFile } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { Branch } from '../types';
import { parseBranches, REF_FORMAT } from './branchParser';

const execFileAsync = promisify(execFile);

/** Subset of the built-in Git extension API (extensions/git/src/api/git.d.ts) */
interface GitExtension {
  getAPI(version: 1): {
    git: { path: string };
    state: 'uninitialized' | 'initialized';
    onDidChangeState: vscode.Event<string>;
    repositories: { rootUri: vscode.Uri }[];
  };
}

const FETCH_TIMEOUT_MS = 60_000;

/**
 * Git operations service class
 * Runs git directly (no shell): arguments are never interpreted, so branch names cannot inject commands
 */
export class GitService {
  private readonly outputChannel = vscode.window.createOutputChannel('Git Branch Pruner');
  /** Git executable used by VS Code (honors the `git.path` setting), resolved with the repositories */
  private gitPath = 'git';

  /**
   * List Git repositories of the workspace (multi-root folders and nested repositories)
   * Relies on the built-in Git extension, falls back to the workspace folders
   */
  public async getRepositories(): Promise<string[]> {
    let repositories: string[] = [];

    try {
      const api = (await vscode.extensions.getExtension<GitExtension>('vscode.git')?.activate())?.getAPI(1);
      if (api) {
        if (api.state !== 'initialized') {
          await new Promise<void>((resolve) => {
            const listener = api.onDidChangeState(() => {
              listener.dispose();
              resolve();
            });
          });
        }
        this.gitPath = api.git.path;
        repositories = api.repositories.map((repository) => repository.rootUri.fsPath);
      }
    } catch (error) {
      this.outputChannel.appendLine(`Git extension unavailable: ${error}`);
    }

    if (!repositories.length) {
      const roots = await Promise.all(
        (vscode.workspace.workspaceFolders ?? []).map((folder) =>
          this.git(['rev-parse', '--show-toplevel'], folder.uri.fsPath).then(
            (stdout) => stdout.trim(),
            (error) => {
              // Git missing must surface; a folder that is not a repository is just skipped
              if (isGitNotFound(error)) {
                throw error;
              }
              return '';
            }
          )
        )
      );
      repositories = roots.filter((root) => root);
    }

    return [...new Set(repositories)].sort();
  }

  /**
   * Get local branches with their remote status, from local refs only (one git process, no network)
   */
  public async getBranches(workingDir: string): Promise<Branch[]> {
    const stdout = await this.git(['for-each-ref', `--format=${REF_FORMAT}`, 'refs/heads', 'refs/remotes'], workingDir);
    return parseBranches(stdout);
  }

  /**
   * Update remote-tracking branches and drop the ones deleted on the remote
   */
  public async fetch(workingDir: string): Promise<void> {
    try {
      await this.git(['fetch', '--prune'], workingDir, FETCH_TIMEOUT_MS);
    } catch (error) {
      this.outputChannel.appendLine(`Fetch error: ${error}`);
      vscode.window.showWarningMessage('Failed to fetch from remote. Branch information might be outdated.');
    }
  }

  /**
   * Delete local branches in a single git call
   * `--` ends options parsing so a name starting with "-" stays a branch name
   */
  public async deleteBranches(workingDir: string, branchNames: string[]): Promise<void> {
    try {
      await this.git(['branch', '-D', '--', ...branchNames], workingDir);
      vscode.window.showInformationMessage(`Deleted ${branchNames.length} branch(es).`);
    } catch (error) {
      // git deletes what it can and reports the others: the refreshed list shows the outcome
      this.outputChannel.appendLine(`Delete error: ${error}`);
      vscode.window.showErrorMessage(`Some branches could not be deleted: ${(error as { stderr?: string }).stderr ?? error}`);
    }
  }

  private async git(args: string[], cwd: string, timeout = 0): Promise<string> {
    const { stdout } = await execFileAsync(this.gitPath, args, {
      cwd,
      timeout,
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0', // never block waiting for credentials
        GIT_OPTIONAL_LOCKS: '0', // do not contend with VS Code's own git operations
      },
    });
    return stdout;
  }
}

/** Spawn failed because the git executable does not exist */
export function isGitNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}
