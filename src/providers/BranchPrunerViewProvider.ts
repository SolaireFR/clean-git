import * as path from 'path';
import * as vscode from 'vscode';
import { GitService, isGitNotFound } from '../services/GitService';
import { Branch } from '../types';
import { getErrorContent, getBranchListContent, getLoadingContent } from '../views/webview';

/** Git events come in bursts (a checkout touches many files): wait for quiet before syncing */
const SYNC_DELAY_MS = 400;

const messages = {
  checking: 'Checking Git environment...',
  gitNotInstalled: 'Git is not installed or not available in PATH. Please install Git and try again.',
  notGitRepo: 'No Git repository found in the current workspace. Please open a Git repository and try again.',
  failedToRefresh: 'Failed to refresh branches. Please try again.',
  deleteConfirmSingle: 'Are you sure you want to delete the following branch?',
  deleteConfirmMultiple: (total: number) => `Are you sure you want to delete the following ${total} branches?`,
  deleteDetail: 'This operation will only delete local branches. Remote branches will not be affected.',
  deleteButton: 'Delete Branches',
  andMore: (count: number) => `...and ${count} more`,
};

/**
 * WebView provider for Git Branch Pruner
 * Manages branch list display, refresh, and delete operations
 */
export class BranchPrunerViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'branchPrunerView';

  private view?: vscode.WebviewView;
  private readonly gitService = new GitService();
  private isOperationInProgress = false;
  private repositories: string[] = [];
  private selectedRepository?: string;
  /** Branches of the displayed list that may be deleted: the only names a delete request can target */
  private deletableBranches = new Set<string>();
  /** Repositories already fetched this session: switching back to them does not hit the network again */
  private readonly fetchedRepositories = new Set<string>();
  /** Repository + branches currently displayed, to skip re-rendering when nothing changed */
  private renderedSignature = '';
  private syncTimer?: ReturnType<typeof setTimeout>;
  /** A Git change arrived while hidden or busy: sync once possible */
  private pendingSync?: { repositoriesChanged: boolean };

  /**
   * Initialize WebView view
   * Set WebView configuration and register message handlers
   */
  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [], // the view loads no local file
    };
    webviewView.webview.onDidReceiveMessage((message) => this.handleMessage(message));

    const watcher = this.gitService.watch((repository) => this.onGitChange(repository));
    webviewView.onDidChangeVisibility(() => this.scheduleSync());
    webviewView.onDidDispose(() => {
      clearTimeout(this.syncTimer);
      void watcher.then((disposable) => disposable.dispose());
      this.view = undefined;
    });

    webviewView.webview.html = getLoadingContent(messages.checking);
    void this.withControlsDisabled(() => this.refresh(false));
  }

  /**
   * Messages come from the webview: check their shape and values before acting on them
   */
  private async handleMessage(message: unknown) {
    const data = (message ?? {}) as { type?: unknown; repository?: unknown; branches?: unknown };

    switch (data.type) {
      case 'refresh':
        return this.withControlsDisabled(() => this.refresh(true));
      case 'selectRepository':
        if (typeof data.repository === 'string' && this.repositories.includes(data.repository)) {
          this.selectedRepository = data.repository;
          return this.withControlsDisabled(() => this.refresh(false));
        }
        return this.setControlsState(true);
      case 'confirmDelete': {
        const branches = Array.isArray(data.branches)
          ? data.branches.filter((name): name is string => typeof name === 'string' && this.deletableBranches.has(name))
          : [];
        return this.withControlsDisabled(() => this.confirmAndDeleteBranches(branches));
      }
    }
  }

  /**
   * Set enabled state of WebView UI controls
   * @param enabled Whether to enable controls
   */
  private async setControlsState(enabled: boolean) {
    await this.view?.webview.postMessage({ type: 'setControlsState', enabled });
  }

  /**
   * Disable UI controls during the operation; a request arriving meanwhile is ignored
   * @param operation Async operation to execute
   */
  private async withControlsDisabled(operation: () => Promise<void>) {
    if (this.isOperationInProgress) {
      return;
    }

    try {
      this.isOperationInProgress = true;
      await this.setControlsState(false);
      await operation();
    } finally {
      this.isOperationInProgress = false;
      await this.setControlsState(true);
      this.scheduleSync();
    }
  }

  /**
   * Git changed (branch created/deleted, checkout, fetch, repository opened/closed...)
   * @param repository Root of the repository that changed, undefined when repositories were added/removed
   */
  private onGitChange(repository?: string) {
    if (repository && repository !== this.selectedRepository) {
      return;
    }
    this.pendingSync = { repositoriesChanged: !repository || !!this.pendingSync?.repositoriesChanged };
    this.scheduleSync();
  }

  private scheduleSync() {
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => void this.sync(), SYNC_DELAY_MS);
  }

  /**
   * Apply a pending Git change: local refs only (no fetch), re-render only if the list differs
   * Waits while the view is hidden or an operation runs (it is re-scheduled afterwards)
   */
  private async sync() {
    const pending = this.pendingSync;
    if (!pending || !this.view?.visible || this.isOperationInProgress) {
      return;
    }
    this.pendingSync = undefined;

    if (pending.repositoriesChanged) {
      return this.withControlsDisabled(() => this.refresh(false));
    }
    const repository = this.selectedRepository;
    if (!repository) {
      return;
    }
    try {
      const branches = await this.gitService.getBranches(repository);
      // An operation started meanwhile renders its own result: do not overwrite it
      if (this.isOperationInProgress || repository !== this.selectedRepository) {
        return;
      }
      if (this.signature(repository, branches) !== this.renderedSignature) {
        await this.render(repository, false, branches);
      }
    } catch (error) {
      // The next refresh reports errors; a background sync stays silent
    }
  }

  private signature(repository: string, branches: Branch[]): string {
    return JSON.stringify([repository, this.repositories, branches]);
  }

  /**
   * Show local branches right away, then fetch and show them again with up-to-date remote status
   * @param forceFetch Fetch even if the repository was already fetched this session
   */
  private async refresh(forceFetch: boolean) {
    if (!this.view) {
      return;
    }

    try {
      // Re-read the list on each refresh so repositories opened in the meantime show up
      this.repositories = await this.gitService.getRepositories();
      if (!this.repositories.length) {
        this.view.webview.html = getErrorContent(messages.notGitRepo);
        return;
      }
      if (!this.selectedRepository || !this.repositories.includes(this.selectedRepository)) {
        this.selectedRepository = this.repositories[0];
      }

      const repository = this.selectedRepository;
      const needsFetch = forceFetch || !this.fetchedRepositories.has(repository);

      await this.render(repository, needsFetch);
      if (needsFetch) {
        await vscode.window.withProgress({ location: { viewId: BranchPrunerViewProvider.viewId } }, () =>
          this.gitService.fetch(repository)
        );
        this.fetchedRepositories.add(repository);
        await this.render(repository, false);
      }
    } catch (error) {
      this.view.webview.html = getErrorContent(isGitNotFound(error) ? messages.gitNotInstalled : messages.failedToRefresh);
    }
  }

  private async render(repository: string, busy: boolean, branches?: Branch[]) {
    branches ??= await this.gitService.getBranches(repository);
    this.renderedSignature = this.signature(repository, branches);
    this.deletableBranches = new Set(
      branches.filter((branch) => !branch.isMainBranch && !branch.isCurrentBranch).map((branch) => branch.name)
    );

    this.view!.webview.html = getBranchListContent(
      branches,
      this.repositories.map((repositoryPath) => ({
        path: repositoryPath,
        label: vscode.workspace.asRelativePath(repositoryPath).replace(/\/$/, '') || path.basename(repositoryPath),
      })),
      repository,
      busy
    );
  }

  /**
   * Confirm and delete selected branches
   * @param branchNames List of branch names to delete
   */
  private async confirmAndDeleteBranches(branchNames: string[]) {
    const repository = this.selectedRepository;
    if (!this.view || !repository || !branchNames.length) {
      return;
    }

    const result = await vscode.window.showWarningMessage(
      this.buildConfirmationMessage(branchNames),
      { modal: true, detail: messages.deleteDetail },
      messages.deleteButton
    );
    if (result !== messages.deleteButton) {
      return;
    }

    await this.gitService.deleteBranches(repository, branchNames);
    // Render right away (~30 ms): the Git watcher event that follows finds the same list and is skipped,
    // and the view stays correct even when the Git extension (and its events) is unavailable
    try {
      await this.render(repository, false);
    } catch (error) {
      this.view.webview.html = getErrorContent(messages.failedToRefresh);
    }
  }

  /**
   * Build delete confirmation message
   * @param branchNames List of branch names to delete
   */
  private buildConfirmationMessage(branchNames: string[]): string {
    const total = branchNames.length;
    const command = `The following command will be executed:\ngit branch -D -- ${branchNames.join(' ')}`;

    if (total === 1) {
      return `${messages.deleteConfirmSingle}\n\n${branchNames[0]}\n\n${command}`;
    }

    const branchList = branchNames
      .slice(0, 5)
      .map((name) => `• ${name}`)
      .join('\n');
    const additionalMessage = total > 5 ? `\n${messages.andMore(total - 5)}` : '';

    return `${messages.deleteConfirmMultiple(total)}\n\n${branchList}${additionalMessage}\n\n${command}`;
  }
}
