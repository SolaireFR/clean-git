import { randomBytes } from 'crypto';
import { version } from '../../package.json';
import { Branch } from '../types';

const messages = {
  description: 'Clean up local Git branches.',
  refreshTitle: 'Refresh branches',
  deleteSelectedButton: 'Delete selected',
  noBranches: 'No branches found',
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

// Icons drawn with the current text color (the CSP blocks external images and codicon fonts)
const refreshIcon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" /><path d="M12.5 1.5v3h-3" />
</svg>`;
const branchIcon = `<svg class="branch-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">
  <circle cx="5" cy="3.5" r="1.5" /><circle cx="5" cy="12.5" r="1.5" /><circle cx="11" cy="5" r="1.5" />
  <path d="M5 5v6M11 6.5c0 2.5-6 1.5-6 4.5" />
</svg>`;

// Colors only come from VS Code theme variables so the view follows any theme (light, dark, high contrast)
const styles = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 8px 12px 12px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
  }
  :focus-visible {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
  }

  .header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
    color: var(--vscode-descriptionForeground);
  }
  .version {
    flex-shrink: 0;
    font-size: 11px;
    opacity: 0.8;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 8px;
  }
  .select-wrapper {
    position: relative;
    flex: 1;
    min-width: 0;
  }
  .select-wrapper::after {
    content: '';
    position: absolute;
    right: 9px;
    top: 50%;
    width: 5px;
    height: 5px;
    border-right: 1px solid var(--vscode-dropdown-foreground);
    border-bottom: 1px solid var(--vscode-dropdown-foreground);
    transform: translateY(-75%) rotate(45deg);
    pointer-events: none;
  }
  select {
    appearance: none;
    width: 100%;
    height: 26px;
    padding: 0 24px 0 6px;
    font: inherit;
    color: var(--vscode-dropdown-foreground);
    background-color: var(--vscode-dropdown-background);
    border: 1px solid var(--vscode-dropdown-border, transparent);
    border-radius: 2px;
    text-overflow: ellipsis;
    cursor: pointer;
  }
  .repo-name {
    flex: 1;
    min-width: 0;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button {
    font: inherit;
    border: none;
    cursor: pointer;
  }
  button:disabled, select:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .icon-button {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 26px;
    height: 26px;
    padding: 0;
    color: var(--vscode-icon-foreground);
    background: transparent;
    border-radius: 5px;
  }
  .icon-button:hover:not(:disabled) {
    background-color: var(--vscode-toolbar-hoverBackground);
  }
  .primary-button {
    width: 100%;
    height: 28px;
    padding: 0 12px;
    color: var(--vscode-button-foreground);
    background-color: var(--vscode-button-background);
    border-radius: 2px;
  }
  .primary-button:hover:not(:disabled) {
    background-color: var(--vscode-button-hoverBackground);
  }

  input[type='checkbox'] {
    appearance: none;
    position: relative;
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    margin: 0;
    background-color: var(--vscode-checkbox-background);
    border: 1px solid var(--vscode-checkbox-border);
    border-radius: 3px;
    cursor: pointer;
  }
  input[type='checkbox']:checked::after,
  input[type='checkbox']:indeterminate::after {
    content: '';
    position: absolute;
    left: 5px;
    top: 2px;
    width: 4px;
    height: 8px;
    border: solid var(--vscode-checkbox-foreground);
    border-width: 0 1.5px 1.5px 0;
    transform: rotate(45deg);
  }
  input[type='checkbox']:indeterminate::after {
    left: 3px;
    top: 6px;
    width: 8px;
    height: 0;
    border-width: 0 0 1.5px 0;
    transform: none;
  }
  input[type='checkbox']:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 26px;
    padding: 2px 6px;
    border-radius: 3px;
    cursor: pointer;
  }
  .row:hover {
    background-color: var(--vscode-list-hoverBackground);
  }
  .row:has(input:checked) {
    background-color: var(--vscode-list-inactiveSelectionBackground);
  }
  .row.locked {
    cursor: default;
  }
  .list-header {
    padding-bottom: 4px;
    margin-bottom: 4px;
    border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
    color: var(--vscode-descriptionForeground);
  }
  .branch-list {
    margin: 0 0 12px;
    padding: 0;
    list-style: none;
  }
  .branch-icon {
    flex-shrink: 0;
    color: var(--vscode-descriptionForeground);
  }
  .branch-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tags {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  .tag {
    padding: 0 5px;
    font-size: 11px;
    line-height: 16px;
    border: 1px solid currentColor;
    border-radius: 8px;
    white-space: nowrap;
  }
  .tag.remote { color: var(--vscode-descriptionForeground); opacity: 0.8; }
  .tag.local-only { color: var(--vscode-editorWarning-foreground); }
  .tag.current { color: var(--vscode-charts-blue); }
  .tag.main { color: var(--vscode-charts-purple); }

  .empty, .status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 6px;
    color: var(--vscode-descriptionForeground);
  }
  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--vscode-progressBar-background);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .error {
    flex: 1;
    padding: 6px 8px;
    color: var(--vscode-errorForeground);
    background-color: var(--vscode-inputValidation-errorBackground);
    border-left: 2px solid var(--vscode-inputValidation-errorBorder);
  }
`;

// Event listeners instead of inline handlers: the CSP only lets the nonce'd script run
const branchListScript = `
  const vscode = acquireVsCodeApi();
  const deleteBtn = document.getElementById('deleteBtn');
  const selectAll = document.getElementById('selectAllCheckbox');
  const selectable = () => Array.from(document.querySelectorAll('.branch-checkbox:not([data-locked])'));
  let controlsEnabled = document.body.dataset.busy !== 'true';
  const repository = document.querySelector('.branch-list')?.dataset.repository;

  // Keep the selection across re-renders (Git changes detected, view hidden then shown)
  const saved = vscode.getState();
  if (repository && saved?.repository === repository) {
    selectable().forEach((box) => (box.checked = saved.checked.includes(box.dataset.branch)));
  }

  // Delete button label and "select all" state follow the selection
  function updateSelection() {
    const boxes = selectable();
    const checked = boxes.filter((box) => box.checked).map((box) => box.dataset.branch);
    const count = checked.length;
    if (repository) {
      vscode.setState({ repository, checked });
    }
    if (deleteBtn) {
      deleteBtn.textContent = count ? 'Delete ' + count + ' branch' + (count > 1 ? 'es' : '') : '${messages.deleteSelectedButton}';
      deleteBtn.disabled = !controlsEnabled || count === 0;
    }
    if (selectAll) {
      selectAll.checked = count > 0 && count === boxes.length;
      selectAll.indeterminate = count > 0 && count < boxes.length;
    }
  }

  // Locked controls (main/current branch, nothing to select) stay disabled
  function setControlsEnabled(enabled) {
    controlsEnabled = enabled;
    document.querySelectorAll('button, select, input').forEach((control) => {
      control.disabled = !enabled || 'locked' in control.dataset;
    });
    updateSelection();
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

  selectAll?.addEventListener('change', () => {
    selectable().forEach((box) => (box.checked = selectAll.checked));
    updateSelection();
  });

  document.addEventListener('change', (event) => {
    if (event.target.classList.contains('branch-checkbox')) {
      updateSelection();
    }
  });

  deleteBtn?.addEventListener('click', () => {
    const branches = selectable().filter((box) => box.checked).map((box) => box.dataset.branch);
    if (branches.length) {
      setControlsEnabled(false);
      vscode.postMessage({ type: 'confirmDelete', branches });
    }
  });

  updateSelection();
`;

function page(body: string, script = '', busy = false): string {
  const nonce = randomBytes(16).toString('base64');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${styles}</style>
</head>
<body data-busy="${busy}">
  <header class="header">
    <span>${messages.description}</span>
    <span class="version">v${escapeHtml(version)}</span>
  </header>
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
      <div class="error" role="alert">${escapeHtml(errorMessage)}</div>
      ${refreshButton()}
    </div>`,
    branchListScript
  );
}

export function getLoadingContent(message: string): string {
  return page(`
    <div class="status" role="status">
      <div class="spinner"></div>
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
  const disabled = (locked = false) => `${locked ? 'data-locked' : ''} ${busy || locked ? 'disabled' : ''}`;
  const selected = repositories.find((repository) => repository.path === selectedRepository);
  const hasDeletable = branches.some((branch) => !branch.isMainBranch && !branch.isCurrentBranch);

  const tags = (branch: Branch) =>
    [
      branch.isCurrentBranch ? '<span class="tag current">current</span>' : '',
      branch.isMainBranch ? '<span class="tag main">main</span>' : '',
      branch.exists.remote
        ? '<span class="tag remote" title="Exists on the remote">remote</span>'
        : '<span class="tag local-only" title="No matching branch on the remote">local only</span>',
    ].join('');

  const repositoryPicker =
    repositories.length > 1
      ? `<div class="select-wrapper">
          <select id="repoSelect" aria-label="Repository" ${disabled()}>
            ${repositories
              .map(
                (repository) =>
                  `<option value="${escapeHtml(repository.path)}" title="${escapeHtml(repository.path)}" ${
                    repository.path === selectedRepository ? 'selected' : ''
                  }>${escapeHtml(repository.label)}</option>`
              )
              .join('')}
          </select>
        </div>`
      : `<span class="repo-name" title="${escapeHtml(selectedRepository)}">${escapeHtml(selected?.label ?? '')}</span>`;

  const branchList = branches.length
    ? `
      <label class="row list-header">
        <input type="checkbox" id="selectAllCheckbox" aria-label="Select all branches" ${disabled(!hasDeletable)}>
        <span>${branches.length} branch${branches.length > 1 ? 'es' : ''}</span>
      </label>
      <ul class="branch-list" data-repository="${escapeHtml(selectedRepository)}">
        ${branches
          .map((branch) => {
            const locked = branch.isMainBranch || branch.isCurrentBranch;
            const name = escapeHtml(branch.name);
            return `
              <li>
                <label class="row ${locked ? 'locked' : ''}" title="${name}">
                  <input type="checkbox" class="branch-checkbox" data-branch="${name}" aria-label="${name}" ${disabled(locked)}>
                  ${branchIcon}
                  <span class="branch-name">${name}</span>
                  <span class="tags">${tags(branch)}</span>
                </label>
              </li>`;
          })
          .join('')}
      </ul>
      <button id="deleteBtn" class="primary-button" disabled>${messages.deleteSelectedButton}</button>`
    : `<div class="empty">${messages.noBranches}</div>`;

  return page(
    `
    <div class="toolbar">
      ${repositoryPicker}
      ${refreshButton(disabled())}
    </div>
    ${branchList}
  `,
    branchListScript,
    busy
  );
}
