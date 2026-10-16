import { exec, ExecOptions } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { Branch } from '../types';

const execAsync = promisify(exec);

/** Subset of the built-in Git extension API (extensions/git/src/api/git.d.ts) */
interface GitExtension {
  getAPI(version: 1): {
    state: 'uninitialized' | 'initialized';
    onDidChangeState: vscode.Event<string>;
    repositories: { rootUri: vscode.Uri }[];
  };
}

/**
 * Git operations service class
 * Handles all Git-related command line operations
 */
export class GitService {
  private outputChannel: vscode.OutputChannel;
  private readonly env: NodeJS.ProcessEnv;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('Git Branch Pruner');

    // Configure environment variables
    this.env = {
      ...process.env,
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
      GIT_TERMINAL_PROMPT: '0',
      // Windows system specific configuration
      ...(process.platform === 'win32'
        ? {
            FORCE_COLOR: '1',
            CHCP: '65001', // Set command prompt to use UTF-8 encoding
          }
        : {}),
    };
  }

  /**
   * Get all branch information
   * Includes local branches and remote branch status
   */
  public async getBranches(workingDir: string): Promise<Branch[]> {
    if (!(await this.checkGitInstallation())) {
      return [];
    }
    if (!(await this.isGitRepository(workingDir))) {
      return [];
    }

    await this.fetchRemote(workingDir);
    return await this.getAllBranches(workingDir);
  }

  /**
   * Delete specified local branches
   * @param branchNames List of branch names to delete
   */
  public async deleteBranches(workingDir: string, branchNames: string[]): Promise<void> {
    for (const branch of branchNames) {
      try {
        await this.execGit(`git branch -D "${branch}"`, workingDir);
        vscode.window.showInformationMessage(`Deleted branch: ${branch}`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to delete branch: ${branch}`);
      }
    }
  }

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
        repositories = api.repositories.map((repository) => repository.rootUri.fsPath);
      }
    } catch (error) {
      this.outputChannel.appendLine(`Git extension unavailable: ${error}`);
    }

    if (!repositories.length) {
      for (const folder of vscode.workspace.workspaceFolders ?? []) {
        if (await this.isGitRepository(folder.uri.fsPath)) {
          repositories.push(folder.uri.fsPath);
        }
      }
    }

    this.outputChannel.appendLine(`Found ${repositories.length} repositories`);
    return [...new Set(repositories)].sort();
  }

  public async checkGitInstallation(): Promise<boolean> {
    try {
      await this.execGit('git --version');
      return true;
    } catch (error) {
      return false;
    }
  }

  public async isGitRepository(workingDir: string): Promise<boolean> {
    try {
      await this.execGit('git rev-parse --git-dir', workingDir);
      return true;
    } catch (error) {
      return false;
    }
  }

  private getExecOptions(cwd?: string): ExecOptions {
    const baseOptions: ExecOptions = {
      env: this.env,
      shell: process.platform === 'win32' ? 'bash.exe' : '/bin/sh',
      windowsHide: true,
    };

    if (cwd) {
      return { ...baseOptions, cwd };
    }

    return baseOptions;
  }

  private async execGit(command: string, cwd?: string): Promise<{ stdout: string; stderr: string }> {
    try {
      const options = this.getExecOptions(cwd);
      const result = await execAsync(command, options);
      return result;
    } catch (error) {
      // If using bash.exe fails, try using cmd.exe
      if (process.platform === 'win32') {
        try {
          const fallbackOptions: ExecOptions = {
            ...this.getExecOptions(cwd),
            shell: 'cmd.exe',
          };
          const result = await execAsync(command, fallbackOptions);
          return result;
        } catch (fallbackError) {
          this.outputChannel.appendLine(
            `Git command failed (fallback): ${
              fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
            }`
          );
          throw fallbackError;
        }
      }
      throw error;
    }
  }

  private async fetchRemote(workingDir: string): Promise<void> {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Updating branch information...',
        cancellable: false,
      },
      async (progress) => {
        try {
          progress.report({ message: 'Fetching from remote...' });
          this.outputChannel.appendLine('Fetching from remote...');

          const { stdout: fetchOutput, stderr: fetchError } = await this.execGit('git fetch --prune', workingDir);

          if (fetchError) {
            this.outputChannel.appendLine(`Fetch warning: ${fetchError}`);
          }
          if (fetchOutput) {
            this.outputChannel.appendLine(`Fetch output: ${fetchOutput}`);
          }

          progress.report({ message: 'Fetch completed', increment: 100 });
        } catch (error) {
          this.outputChannel.appendLine(`Fetch error: ${error}`);
          vscode.window.showWarningMessage('Failed to fetch from remote. Branch information might be outdated.');
        }
      }
    );
  }

  private async getCurrentBranch(workingDir: string): Promise<string> {
    try {
      const { stdout } = await this.execGit('git rev-parse --abbrev-ref HEAD', workingDir);
      return stdout.trim();
    } catch (error) {
      this.outputChannel.appendLine(`Error getting current branch: ${error}`);
      return '';
    }
  }

  private async getMainBranch(workingDir: string): Promise<string> {
    try {
      // Check in order of common main branch names
      const commonMainBranches = ['main', 'master'];
      for (const branchName of commonMainBranches) {
        try {
          await this.execGit(`git rev-parse --verify ${branchName}`, workingDir);
          return branchName;
        } catch {
          continue;
        }
      }
      // If none found, return empty string
      return '';
    } catch (error) {
      this.outputChannel.appendLine(`Error getting main branch: ${error}`);
      return '';
    }
  }

  private async getAllBranches(workingDir: string): Promise<Branch[]> {
    try {
      const currentBranch = await this.getCurrentBranch(workingDir);
      const mainBranch = await this.getMainBranch(workingDir);

      // Get local branches
      const { stdout: localOutput } = await this.execGit('git branch --no-color', workingDir);

      // Get remote branches
      const { stdout: remoteOutput } = await this.execGit('git branch -r --no-color', workingDir);

      // Process local branches
      const localBranches = localOutput
        .split('\n')
        .map((b) => b.trim())
        .filter((b) => b)
        .map((b) => b.replace('* ', ''));

      // Process remote branches
      const remoteBranches = remoteOutput
        .split('\n')
        .map((b) => b.trim())
        .filter((b) => b)
        .map((b) => b.replace('origin/', ''));

      this.outputChannel.appendLine(
        `Found ${localBranches.length} local branches and ${remoteBranches.length} remote branches`
      );

      return localBranches.map((name) => ({
        name,
        isLocal: true,
        exists: {
          local: true,
          remote: remoteBranches.includes(name),
        },
        isCurrentBranch: name === currentBranch,
        isMainBranch: name === mainBranch,
      }));
    } catch (error) {
      this.outputChannel.appendLine(`Error getting branches: ${error}`);
      vscode.window.showErrorMessage('Failed to get Git branches');
      return [];
    }
  }
}
