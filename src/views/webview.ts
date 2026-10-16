import { randomBytes } from 'crypto';
import { Branch } from '../types';

const messages = {
  description:
    'Git Branch Pruner helps you manage local Git branches by identifying and removing branches that are no longer needed, especially those that have been merged or deleted from remote.',
  refreshTitle: 'Refresh branches',
  deleteSelectedButton: 'Delete Selected',
  noBranches: 'No branches found',
  selectAll: 'Select All',
};

export interface RepositoryOption {
  path: string;
  label: string;
}

/** Branch names and paths come from the repository: escape everything injected in HTML */
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Arrow-circle icon drawn with the current text color
const refreshIcon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" /><path d="M12.5 1.5v3h-3" />
</svg>`;

const styles = `
  body {
    padding: 10px;
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
  }
  .description {
    margin-bottom: 20px;
    line-height: 1.4;
  }
  .error-message {
    flex: 1;
    color: var(--vscode-errorForeground);
  }
  .status-message {
    margin: 20px 0;
    padding: 10px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .loading-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--vscode-foreground);
    border-radius: 50%;
    border-top-color: transparent;
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 10px 0;
  }
  .toolbar select, .repo-name {
    flex: 1;
    min-width: 0;
  }
  .toolbar select {
    padding: 4px;
    color: var(--vscode-dropdown-foreground);
    background-color: var(--vscode-dropdown-background);
    border: 1px solid var(--vscode-dropdown-border);
  }
  .repo-name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .branch-list {
    margin: 10px 0;
  }
  .branch-item {
    display: flex;
    align-items: center;
    padding: 8px;
    margin: 5px 0;
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
  }
  .branch-item.disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
  .branch-name {
    flex: 1;
    margin-right: 10px;
    overflow-wrap: anywhere;
  }
  .checkbox-wrapper {
    margin-right: 10px;
  }
  .status-badge {
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 12px;
    margin-right: 8px;
  }
  .in-sync {
    background-color: var(--vscode-testing-iconPassed);
    color: var(--vscode-editor-background);
  }
  .stale {
    background-color: var(--vscode-testing-iconFailed);
    color: var(--vscode-editor-background);
  }
  .current {
    background-color: var(--vscode-statusBarItem-warningBackground);
    color: var(--vscode-statusBarItem-warningForeground);
  }
  .main {
    background-color: var(--vscode-statusBarItem-prominentBackground);
    color: var(--vscode-statusBarItem-prominentForeground);
  }
  #select-all {
    display: block;
    margin-bottom: 10px;
  }
  .no-branches {
    padding: 20px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
  }
  .actions {
    margin: 10px 0;
  }
  button {
    background-color: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 6px 12px;
    cursor: pointer;
    margin: 5px;
    border-radius: 2px;
  }
  button:hover {
    background-color: var(--vscode-button-hoverBackground);
  }
  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background-color: var(--vscode-button-secondaryBackground);
  }
  button.icon-button {
    display: flex;
    padding: 4px;
    margin: 0;
    color: var(--vscode-icon-foreground);
    background: transparent;
  }
  button.icon-button:hover {
    background-color: var(--vscode-toolbar-hoverBackground);
  }
  button.icon-button:disabled {
    background: transparent;
  }
`;

// Event listeners instead of inline handlers: the CSP only lets the nonce'd script run
const branchListScript = `
  const vscode = acquireVsCodeApi();

  // Locked controls (main/current branch, delete without candidates) stay disabled
  function setControlsEnabled(enabled) {
    document.querySelectorAll('button, select, input').forEach((control) => {
      control.disabled = !enabled || control.dataset.locked === 'true';
    });
  }

  window.addEventListener('message', (event) => {
    if (event.data.type === 'setControlsState') {
      setControlsEnabled(event.data.enabled);
    }
  });

  document.getElementById('refreshBtn').addEventListener('click', () => {
    setControlsEnabled(false);
    vscode.postMessage({ type: 'refresh' });
  });

  document.getElementById('repoSelect')?.addEventListener('change', (event) => {
    setControlsEnabled(false);
    vscode.postMessage({ type: 'selectRepository', repository: event.target.value });
  });

  document.getElementById('selectAllCheckbox')?.addEventListener('change', (event) => {
    document.querySelectorAll('.branch-checkbox:not(:disabled)').forEach((checkbox) => {
      checkbox.checked = event.target.checked;
    });
  });

  document.getElementById('deleteBtn')?.addEventListener('click', () => {
    const branches = Array.from(
      document.querySelectorAll('.branch-checkbox:checked:not(:disabled)'),
      (checkbox) => checkbox.dataset.branch
    );
    if (branches.length) {
      setControlsEnabled(false);
      vscode.postMessage({ type: 'confirmDelete', branches });
    }
  });
`;

function page(body: string, script = ''): string {
  const nonce = randomBytes(16).toString('base64');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${styles}</style>
</head>
<body>
  <div class="description">${messages.description}</div>
  ${body}
  ${script ? `<script nonce="${nonce}">${script}</script>` : ''}
</body>
</html>`;
}

const refreshButton = (attributes = '') =>
  `<button id="refreshBtn" class="icon-button" title="${messages.refreshTitle}" aria-label="${messages.refreshTitle}" ${attributes}>${refreshIcon}</button>`;

export function getErrorContent(errorMessage: string): string {
  return page(
    `<div class="toolbar">
      <span class="error-message">${escapeHtml(errorMessage)}</span>
      ${refreshButton()}
    </div>`,
    branchListScript
  );
}

export function getLoadingContent(message: string): string {
  return page(`
    <div class="status-message">
      <div class="loading-spinner"></div>
      <span>${escapeHtml(message)}</span>
    </div>
  `);
}

/**
 * @param busy Render every control disabled (an operation such as a fetch is still running)
 */
export function getBranchListContent(
  branches: Branch[],
  repositories: RepositoryOption[],
  selectedRepository: string,
  busy = false
): string {
  const disabled = (locked = false) => `${locked ? 'data-locked="true"' : ''} ${busy || locked ? 'disabled' : ''}`;
  const selected = repositories.find((repository) => repository.path === selectedRepository);
  const hasDeletable = branches.some((branch) => !branch.isMainBranch && !branch.isCurrentBranch);

  const badges = (branch: Branch) =>
    [
      branch.exists.remote
        ? '<span class="status-badge in-sync">Remote: ✓</span>'
        : '<span class="status-badge stale">Remote: ✗</span>',
      branch.isCurrentBranch ? '<span class="status-badge current">Current</span>' : '',
      branch.isMainBranch ? '<span class="status-badge main">Main</span>' : '',
    ].join('');

  const repositoryPicker =
    repositories.length > 1
      ? `<select id="repoSelect" aria-label="Repository" ${disabled()}>
          ${repositories
            .map(
              (repository) =>
                `<option value="${escapeHtml(repository.path)}" ${
                  repository.path === selectedRepository ? 'selected' : ''
                }>${escapeHtml(repository.label)}</option>`
            )
            .join('')}
        </select>`
      : `<span class="repo-name">${escapeHtml(selected?.label ?? '')}</span>`;

  const branchList = branches.length
    ? `
      <label id="select-all">
        <input type="checkbox" id="selectAllCheckbox" ${disabled()}>
        ${messages.selectAll}
      </label>
      <div class="branch-list">
        ${branches
          .map((branch) => {
            const locked = branch.isMainBranch || branch.isCurrentBranch;
            return `
              <div class="branch-item ${locked ? 'disabled' : ''}">
                <div class="checkbox-wrapper">
                  <input type="checkbox" class="branch-checkbox" data-branch="${escapeHtml(branch.name)}" ${disabled(locked)}>
                </div>
                <span class="branch-name">${escapeHtml(branch.name)}</span>
                ${badges(branch)}
              </div>`;
          })
          .join('')}
      </div>
      <div class="actions">
        <button id="deleteBtn" ${disabled(!hasDeletable)}>${messages.deleteSelectedButton}</button>
      </div>`
    : `<div class="no-branches">${messages.noBranches}</div>`;

  return page(
    `
    <div class="toolbar">
      ${repositoryPicker}
      ${refreshButton(disabled())}
    </div>
    ${branchList}
  `,
    branchListScript
  );
}
