import * as path from 'path';
import * as vscode from 'vscode';
import { GitService, isGitNotFound } from '../services/GitService';
import { getErrorContent, getBranchListContent, getLoadingContent } from '../views/webview';

const messages = {
  checking: 'Checking Git environment...',
  deleting: (count: number) => `Deleting ${count} branch(es)...`,
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
    }
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

  private async render(repository: string, busy: boolean) {
    const branches = await this.gitService.getBranches(repository);
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

    this.view.webview.html = getLoadingContent(messages.deleting(branchNames.length));
    await this.gitService.deleteBranches(repository, branchNames);
    await this.refresh(false);
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
