import * as path from 'path';
import * as vscode from 'vscode';
import { diffRange, GitService, isGitNotFound } from '../services/GitService';
import { Branch, ChangedFile, Stash, Tab } from '../types';
import {
  getBranchListContent,
  getChangesContent,
  getErrorContent,
  getLoadingContent,
  getStashListContent,
} from '../views/webview';

/** Git events come in bursts (a checkout touches many files): wait for quiet before syncing */
const SYNC_DELAY_MS = 400;

const messages = {
  checking: 'Checking Git environment...',
  gitNotInstalled: 'Git is not installed or not available in PATH. Please install Git and try again.',
  notGitRepo: 'No Git repository found in the current workspace. Please open a Git repository and try again.',
  failedToRefresh: 'Failed to refresh. Please try again.',
  deleteConfirmSingle: 'Are you sure you want to delete the following branch?',
  deleteConfirmMultiple: (total: number) => `Are you sure you want to delete the following ${total} branches?`,
  deleteDetail: 'This operation will only delete local branches. Remote branches will not be affected.',
  deleteButton: 'Delete Branches',
  dropConfirmSingle: 'Are you sure you want to drop the following stash?',
  dropConfirmMultiple: (total: number) => `Are you sure you want to drop the following ${total} stashes?`,
  dropDetail: 'Dropped stashes no longer appear in Git and are hard to recover.',
  dropButton: 'Drop Stashes',
  andMore: (count: number) => `...and ${count} more`,
  changesFailed: 'Could not read the changes:',
  switchFailed: (branch: string) => `Could not switch to ${branch}:`,
  sequencerInProgress: (operation: string) => `A ${operation} is in progress in this repository.`,
  sequencerDetail: (command: string) =>
    `Git cannot switch branch until it is finished. Quit it and switch?\n\nQuitting keeps the commits and changes already applied, it only forgets the interrupted ${command} (git ${command} --quit). Conflicts still unresolved would keep blocking the switch.`,
  sequencerButton: 'Quit and Switch',
};

/** Diff lines sent per file: enough to read, bounded for huge generated files */
const MAX_DIFF_LINES = 5000;

/**
 * WebView provider for Clean Git
 * Manages the branch and stash lists (one tab each): display, refresh, and delete operations
 */
export class BranchPrunerViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'gitBranchCleanerView';

  private view?: vscode.WebviewView;
  private readonly gitService = new GitService();
  private isOperationInProgress = false;
  private repositories: string[] = [];
  private selectedRepository?: string;
  private tab: Tab = 'branches';
  /** Items of the displayed list that may be deleted (branch name or stash hash -> label): the only ones a delete request can target */
  private deletable = new Map<string, string>();
  /** Branches displayed on the branches tab: the only ones an info or switch request can target */
  private branches: Branch[] = [];
  /** Changes page shown instead of the list (info button): its diff range and files, the only ones a diff request can target */
  private detail?: { range: string[]; files: ChangedFile[] };
  /** Repositories already fetched this session: switching back to them does not hit the network again */
  private readonly fetchedRepositories = new Set<string>();
  /** Tab + repository + items currently displayed, to skip re-rendering when nothing changed */
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
    const data = (message ?? {}) as {
      type?: unknown;
      repository?: unknown;
      tab?: unknown;
      items?: unknown;
      item?: unknown;
      index?: unknown;
    };

    switch (data.type) {
      case 'refresh':
        return this.withControlsDisabled(() => this.refresh(true));
      case 'selectRepository':
        if (typeof data.repository === 'string' && this.repositories.includes(data.repository)) {
          this.selectedRepository = data.repository;
          return this.withControlsDisabled(() => this.refresh(false));
        }
        return this.setControlsState(true);
      case 'selectTab':
        if (data.tab === 'branches' || data.tab === 'stashes') {
          this.tab = data.tab;
          return this.withControlsDisabled(() => this.refresh(false));
        }
        return this.setControlsState(true);
      case 'confirmDelete': {
        const items = Array.isArray(data.items)
          ? data.items.filter((id): id is string => typeof id === 'string' && this.deletable.has(id))
          : [];
        return this.withControlsDisabled(() => this.confirmAndDelete(items));
      }
      case 'showInfo': {
        const item = data.item;
        if (this.detail) {
          return this.setControlsState(true);
        }
        if (this.tab === 'stashes' && typeof item === 'string' && this.deletable.has(item)) {
          return this.withControlsDisabled(() => this.showChanges(this.deletable.get(item)!, diffRange.stash(item)));
        }
        const main = this.branches.find((branch) => branch.isMainBranch);
        const branch = this.branches.find((branch) => branch.name === item);
        if (this.tab === 'branches' && main && branch && branch !== main) {
          return this.withControlsDisabled(() =>
            this.showChanges(`${branch.name} (compared to ${main.name})`, diffRange.branch(main.name, branch.name))
          );
        }
        return this.setControlsState(true);
      }
      case 'loadDiff': {
        const file = typeof data.index === 'number' ? this.detail?.files[data.index] : undefined;
        if (file) {
          return this.loadDiff(data.index as number, file.path);
        }
        return;
      }
      case 'back':
        this.detail = undefined;
        return this.withControlsDisabled(() => this.refresh(false));
      case 'switchBranch': {
        const branch = this.branches.find((branch) => branch.name === data.item);
        if (this.tab === 'branches' && branch && !branch.isCurrentBranch) {
          return this.withControlsDisabled(() => this.switchBranch(branch.name));
        }
        return this.setControlsState(true);
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
   * Git changed (branch created/deleted, checkout, stash, fetch, repository opened/closed...)
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
   * Apply a pending Git change: local data only (no fetch), re-render only if the list differs
   * Waits while the view is hidden or an operation runs (it is re-scheduled afterwards)
   */
  private async sync() {
    const pending = this.pendingSync;
    // The changes page is a snapshot: the list is re-read when going back
    if (!pending || !this.view?.visible || this.isOperationInProgress || this.detail) {
      return;
    }
    this.pendingSync = undefined;

    if (pending.repositoriesChanged) {
      return this.withControlsDisabled(() => this.refresh(false));
    }
    const repository = this.selectedRepository;
    const tab = this.tab;
    if (!repository) {
      return;
    }
    try {
      const items = await this.list(repository);
      // An operation started meanwhile renders its own result: do not overwrite it
      if (this.isOperationInProgress || repository !== this.selectedRepository || tab !== this.tab) {
        return;
      }
      if (this.signature(repository, items) !== this.renderedSignature) {
        await this.render(repository, false, items);
      }
    } catch (error) {
      // The next refresh reports errors; a background sync stays silent
    }
  }

  private signature(repository: string, items: Branch[] | Stash[]): string {
    return JSON.stringify([this.tab, repository, this.repositories, items]);
  }

  /** Items of the current tab, from local data only (no network) */
  private list(repository: string): Promise<Branch[] | Stash[]> {
    return this.tab === 'branches' ? this.gitService.getBranches(repository) : this.gitService.getStashes(repository);
  }

  /**
   * Show the current tab right away; on the branches tab, then fetch and show them again with up-to-date remote status
   * @param forceFetch Fetch even if the repository was already fetched this session (stashes are local: never fetched)
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
      const needsFetch = this.tab === 'branches' && (forceFetch || !this.fetchedRepositories.has(repository));

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

  private async render(repository: string, busy: boolean, items?: Branch[] | Stash[]) {
    items ??= await this.list(repository);
    this.renderedSignature = this.signature(repository, items);
    const repositories = this.repositories.map((repositoryPath) => ({
      path: repositoryPath,
      label: vscode.workspace.asRelativePath(repositoryPath).replace(/\/$/, '') || path.basename(repositoryPath),
    }));

    if (this.tab === 'stashes') {
      const stashes = items as Stash[];
      this.branches = [];
      this.deletable = new Map(stashes.map((stash) => [stash.hash, `${stash.ref}: ${stash.message}`]));
      this.view!.webview.html = getStashListContent(stashes, repositories, repository, busy);
    } else {
      const branches = items as Branch[];
      this.branches = branches;
      this.deletable = new Map(
        branches.filter((branch) => !branch.isMainBranch && !branch.isCurrentBranch).map((branch) => [branch.name, branch.name])
      );
      this.view!.webview.html = getBranchListContent(branches, repositories, repository, busy);
    }
  }

  /**
   * Confirm and delete the selected branches or stashes (current tab)
   * @param items Branch names or stash hashes to delete
   */
  private async confirmAndDelete(items: string[]) {
    const repository = this.selectedRepository;
    if (!this.view || !repository || !items.length) {
      return;
    }

    const stashes = this.tab === 'stashes';
    const button = stashes ? messages.dropButton : messages.deleteButton;
    const result = await vscode.window.showWarningMessage(
      stashes ? this.buildDropMessage(items) : this.buildConfirmationMessage(items),
      { modal: true, detail: stashes ? messages.dropDetail : messages.deleteDetail },
      button
    );
    if (result !== button) {
      return;
    }

    await (stashes ? this.gitService.dropStashes(repository, items) : this.gitService.deleteBranches(repository, items));
    // Render right away (~30 ms): the Git watcher event that follows finds the same list and is skipped,
    // and the view stays correct even when the Git extension (and its events) is unavailable
    try {
      await this.render(repository, false);
    } catch (error) {
      this.view.webview.html = getErrorContent(messages.failedToRefresh);
    }
  }

  /**
   * Replace the list with the changes page: files collapsed, each diff loaded when its file is opened
   * @param title Stash or branch shown in the page header
   * @param range `git diff` revisions, from diffRange
   */
  private async showChanges(title: string, range: string[]) {
    const repository = this.selectedRepository;
    if (!this.view || !repository) {
      return;
    }
    try {
      const files = await this.gitService.getChangedFiles(repository, range);
      this.detail = { range, files };
      this.view.webview.html = getChangesContent(title, files);
    } catch (error) {
      vscode.window.showErrorMessage(`${messages.changesFailed} ${stderrOf(error)}`);
    }
  }

  /**
   * Send the diff of one file of the changes page (not an operation: other files can load meanwhile)
   * @param index Index of the file in the page, echoed back so the page knows where to show the diff
   */
  private async loadDiff(index: number, filePath: string) {
    const { range } = this.detail!;
    const repository = this.selectedRepository!;
    try {
      const lines = await this.gitService.getFileDiff(repository, range, filePath);
      await this.view?.webview.postMessage({
        type: 'diff',
        index,
        lines: lines.slice(0, MAX_DIFF_LINES),
        hidden: Math.max(0, lines.length - MAX_DIFF_LINES),
      });
    } catch (error) {
      await this.view?.webview.postMessage({ type: 'diff', index, error: `${messages.changesFailed} ${stderrOf(error)}` });
    }
  }

  /**
   * Check out a branch, then show the new current branch right away (same as after a delete)
   * An interrupted cherry-pick or revert blocks the switch: offer to quit it first
   */
  private async switchBranch(branch: string) {
    const repository = this.selectedRepository;
    if (!this.view || !repository) {
      return;
    }
    try {
      await this.gitService.switchBranch(repository, branch);
    } catch (error) {
      // e.g. "fatal: cannot switch branch while cherry-picking"
      const operation = /while (cherry-picking|reverting)/.exec(stderrOf(error))?.[1];
      const command = operation === 'reverting' ? 'revert' : 'cherry-pick';
      if (!operation) {
        vscode.window.showErrorMessage(`${messages.switchFailed(branch)} ${stderrOf(error)}`);
      } else if (
        (await vscode.window.showWarningMessage(
          messages.sequencerInProgress(command),
          { modal: true, detail: messages.sequencerDetail(command) },
          messages.sequencerButton
        )) === messages.sequencerButton
      ) {
        try {
          await this.gitService.quitSequencer(repository, command);
          await this.gitService.switchBranch(repository, branch);
        } catch (retryError) {
          vscode.window.showErrorMessage(`${messages.switchFailed(branch)} ${stderrOf(retryError)}`);
        }
      }
    }
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

    return `${messages.deleteConfirmMultiple(total)}\n\n${this.bulletList(branchNames)}\n\n${command}`;
  }

  /**
   * Build drop confirmation message
   * @param hashes Hashes of the stashes to drop
   */
  private buildDropMessage(hashes: string[]): string {
    const labels = hashes.map((hash) => this.deletable.get(hash)!);
    const command = 'The following command will be executed for each stash:\ngit stash drop <stash>';

    if (labels.length === 1) {
      return `${messages.dropConfirmSingle}\n\n${labels[0]}\n\n${command}`;
    }

    return `${messages.dropConfirmMultiple(labels.length)}\n\n${this.bulletList(labels)}\n\n${command}`;
  }

  /** First 5 items as a bullet list, then how many more */
  private bulletList(items: string[]): string {
    const list = items
      .slice(0, 5)
      .map((item) => `• ${item}`)
      .join('\n');
    return items.length > 5 ? `${list}\n${messages.andMore(items.length - 5)}` : list;
  }
}

/** Git's own message when a git command failed */
function stderrOf(error: unknown): string {
  return String((error as { stderr?: string }).stderr || error);
}
