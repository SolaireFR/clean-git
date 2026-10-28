import { randomBytes } from 'crypto';
import { version } from '../../package.json';
import { Branch, ChangedFile, Stash, Tab } from '../types';

const messages = {
  backTitle: 'Back',
  noChanges: 'No changes',
  loading: 'Loading...',
  description: 'Clean up local Git branches and stashes.',
  refreshTitle: 'Refresh',
  deleteSelectedButton: 'Delete selected',
  noBranches: 'No branches found',
  noStashes: 'No stashes found',
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
const branchIcon = `<svg class="item-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">
  <circle cx="5" cy="3.5" r="1.5" /><circle cx="5" cy="12.5" r="1.5" /><circle cx="11" cy="5" r="1.5" />
  <path d="M5 5v6M11 6.5c0 2.5-6 1.5-6 4.5" />
</svg>`;
const stashIcon = `<svg class="item-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">
  <path d="M2.5 6.5h11v6.5h-11zM3.5 6.5l1-3.5h7l1 3.5M6 9h4" />
</svg>`;
const switchIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M3 8h10M8.5 3.5 13 8l-4.5 4.5" />
</svg>`;
const backIcon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M13 8H3M7.5 3.5 3 8l4.5 4.5" />
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

  .tabs {
    display: flex;
    gap: 12px;
    margin-bottom: 8px;
    border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
  }
  .tab {
    padding: 4px 2px;
    color: var(--vscode-panelTitle-inactiveForeground);
    background: transparent;
    border-bottom: 1px solid transparent;
    margin-bottom: -1px;
  }
  .tab:hover:not(:disabled) {
    color: var(--vscode-panelTitle-activeForeground);
  }
  .tab[aria-selected='true'] {
    color: var(--vscode-panelTitle-activeForeground);
    border-bottom-color: var(--vscode-panelTitle-activeBorder);
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
  .icon-button.small {
    width: 20px;
    height: 20px;
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
  .item-list {
    margin: 0 0 12px;
    padding: 0;
    list-style: none;
  }
  .item-icon {
    flex-shrink: 0;
    color: var(--vscode-descriptionForeground);
  }
  .info-button {
    padding: 0;
    color: inherit;
    background: transparent;
    text-align: left;
  }
  .info-button:hover:not(:disabled) {
    color: var(--vscode-textLink-activeForeground);
    text-decoration: underline;
  }
  .info-button:disabled {
    opacity: 1;
  }
  .item-name {
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
  .tag.remote-only { color: var(--vscode-charts-orange); }
  .tag.local-only { color: var(--vscode-editorWarning-foreground); }
  .tag.current { color: var(--vscode-charts-blue); }
  .tag.main { color: var(--vscode-charts-purple); }
  .commit-date {
    flex-shrink: 0;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--vscode-descriptionForeground);
  }

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

  .changes-header {
    display: flex;
    gap: 8px;
  }
  .stat {
    flex-shrink: 0;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .stat .added { color: var(--vscode-gitDecoration-addedResourceForeground); }
  .stat .deleted { color: var(--vscode-gitDecoration-deletedResourceForeground); }
  .file-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .file-list summary {
    list-style: none;
  }
  .file-list summary::-webkit-details-marker {
    display: none;
  }
  /* Chevron: points right when collapsed, down when open */
  .file-list summary::before {
    content: '';
    flex-shrink: 0;
    width: 5px;
    height: 5px;
    margin: 0 2px 0 1px;
    border-right: 1px solid var(--vscode-icon-foreground);
    border-bottom: 1px solid var(--vscode-icon-foreground);
    transform: rotate(-45deg);
  }
  .file-list details[open] > summary::before {
    transform: rotate(45deg);
  }
  .file-name {
    flex-shrink: 0;
    max-width: 70%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .file-dir {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }
  .diff {
    margin: 2px 0 6px;
    border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
    border-radius: 3px;
    overflow-x: auto;
    font-family: var(--vscode-editor-font-family);
    font-size: var(--vscode-editor-font-size);
    background-color: var(--vscode-editor-background);
  }
  .diff-lines {
    min-width: max-content;
  }
  .diff-lines > div {
    padding: 0 6px;
    white-space: pre;
  }
  .diff-lines .added { background-color: var(--vscode-diffEditor-insertedLineBackground, var(--vscode-diffEditor-insertedTextBackground)); }
  .diff-lines .deleted { background-color: var(--vscode-diffEditor-removedLineBackground, var(--vscode-diffEditor-removedTextBackground)); }
  .diff-lines .hunk { color: var(--vscode-descriptionForeground); }
`;

// Event listeners instead of inline handlers: the CSP only lets the nonce'd script run
const listScript = `
  const vscode = acquireVsCodeApi();
  const deleteBtn = document.getElementById('deleteBtn');
  const selectAll = document.getElementById('selectAllCheckbox');
  const selectable = () => Array.from(document.querySelectorAll('.item-checkbox:not([data-locked])'));
  let controlsEnabled = document.body.dataset.busy !== 'true';
  const list = document.querySelector('.item-list')?.dataset;
  // One saved selection per tab and repository
  const listKey = list && list.noun + ':' + list.repository;

  // Keep the selection across re-renders (Git changes detected, view hidden then shown)
  const saved = vscode.getState();
  if (listKey && saved?.listKey === listKey) {
    selectable().forEach((box) => (box.checked = saved.checked.includes(box.dataset.id)));
  }

  // Delete button label and "select all" state follow the selection
  function updateSelection() {
    const boxes = selectable();
    const checked = boxes.filter((box) => box.checked).map((box) => box.dataset.id);
    const count = checked.length;
    if (listKey) {
      vscode.setState({ listKey, checked });
    }
    if (deleteBtn) {
      deleteBtn.textContent = count ? list.verb + ' ' + count + ' ' + list.noun + (count > 1 ? 'es' : '') : '${messages.deleteSelectedButton}';
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
    if (event.target.classList.contains('item-checkbox')) {
      updateSelection();
    }
  });

  document.querySelectorAll('.tab').forEach((tab) =>
    tab.addEventListener('click', () => {
      if (tab.getAttribute('aria-selected') !== 'true') {
        setControlsEnabled(false);
        vscode.postMessage({ type: 'selectTab', tab: tab.dataset.tab });
      }
    })
  );

  document.querySelectorAll('.info-button').forEach((button) =>
    button.addEventListener('click', (event) => {
      event.preventDefault(); // inside the row label: do not toggle the checkbox
      setControlsEnabled(false);
      vscode.postMessage({ type: 'showInfo', item: button.dataset.id });
    })
  );

  document.querySelectorAll('.switch-button').forEach((button) =>
    button.addEventListener('click', (event) => {
      event.preventDefault(); // inside the row label: do not toggle the checkbox
      setControlsEnabled(false);
      vscode.postMessage({ type: 'switchBranch', item: button.dataset.id });
    })
  );

  deleteBtn?.addEventListener('click', () => {
    const items = selectable().filter((box) => box.checked).map((box) => box.dataset.id);
    if (items.length) {
      setControlsEnabled(false);
      vscode.postMessage({ type: 'confirmDelete', items });
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
    listScript
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


/** One row of a list, values not escaped yet */
interface Row {
  id: string;
  label: string;
  /** Pre-rendered HTML */
  tags?: string;
  date: number;
  /** Cannot be selected for deletion */
  locked?: boolean;
  /** The name is a button that opens the changes page of the item */
  info?: boolean;
  /** Show an arrow button that checks out the branch */
  switchable?: boolean;
}

const tabLabels: Record<Tab, string> = { branches: 'Branches', stashes: 'Stashes' };
const lists: Record<Tab, { noun: string; verb: string; icon: string; empty: string }> = {
  branches: { noun: 'branch', verb: 'Delete', icon: branchIcon, empty: messages.noBranches },
  stashes: { noun: 'stash', verb: 'Drop', icon: stashIcon, empty: messages.noStashes },
};

/**
 * Tabs, repository picker, then the selectable rows of the active tab
 * @param busy Render every control disabled (an operation such as a fetch is still running)
 */
function listContent(
  tab: Tab,
  rows: Row[],
  repositories: RepositoryOption[],
  selectedRepository: string,
  busy: boolean
): string {
  const disabled = (locked = false) => `${locked ? 'data-locked' : ''} ${busy || locked ? 'disabled' : ''}`;
  const selected = repositories.find((repository) => repository.path === selectedRepository);
  const { noun, verb, icon, empty } = lists[tab];
  const plural = (count: number) => `${noun}${count > 1 ? 'es' : ''}`;

  const tabs = `<div class="tabs" role="tablist">
      ${(Object.keys(tabLabels) as Tab[])
        .map(
          (name) =>
            `<button class="tab" role="tab" data-tab="${name}" aria-selected="${name === tab}" ${disabled()}>${tabLabels[name]}</button>`
        )
        .join('')}
    </div>`;

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

  const list = rows.length
    ? `
      <label class="row list-header">
        <input type="checkbox" id="selectAllCheckbox" aria-label="Select all ${noun}es" ${disabled(rows.every((row) => row.locked))}>
        <span>${rows.length} ${plural(rows.length)}</span>
      </label>
      <ul class="item-list" data-repository="${escapeHtml(selectedRepository)}" data-noun="${noun}" data-verb="${verb}">
        ${rows
          .map((row) => {
            const id = escapeHtml(row.id);
            const label = escapeHtml(row.label);
            const date = new Date(row.date);
            const pad = (value: number) => String(value).padStart(2, '0');
            // e.g. "lundi 25 octobre 2026 à 18:03:11"
            const fullDate = date.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'medium' });
            return `
              <li>
                <label class="row ${row.locked ? 'locked' : ''}" title="${label}">
                  <input type="checkbox" class="item-checkbox" data-id="${id}" aria-label="${label}" ${disabled(row.locked)}>
                  ${icon}
                  ${
                    row.info
                      ? `<button class="item-name info-button" data-id="${id}" title="Show changes of ${label}" ${disabled()}>${label}</button>`
                      : `<span class="item-name">${label}</span>`
                  }
                  ${row.tags ? `<span class="tags">${row.tags}</span>` : ''}
                  <span class="commit-date" title="${escapeHtml(fullDate)}">${pad(date.getMonth() + 1)}-${pad(date.getDate())}</span>
                  ${
                    row.switchable
                      ? `<button class="icon-button small switch-button" data-id="${id}" title="Switch to ${label}" aria-label="Switch to ${label}" ${disabled()}>${switchIcon}</button>`
                      : ''
                  }
                </label>
              </li>`;
          })
          .join('')}
      </ul>
      <button id="deleteBtn" class="primary-button" disabled>${messages.deleteSelectedButton}</button>`
    : `<div class="empty">${empty}</div>`;

  return page(
    `
    ${tabs}
    <div class="toolbar">
      ${repositoryPicker}
      ${refreshButton(disabled())}
    </div>
    ${list}
  `,
    listScript,
    busy
  );
}

export function getBranchListContent(
  branches: Branch[],
  repositories: RepositoryOption[],
  selectedRepository: string,
  busy = false
): string {
  const tags = (branch: Branch) =>
    [
      branch.isCurrentBranch ? '<span class="tag current">current</span>' : '',
      branch.isMainBranch ? '<span class="tag main">main</span>' : '',
      branch.isLocal
        ? branch.exists.remote
          ? '<span class="tag remote" title="Exists on the remote">remote</span>'
          : '<span class="tag local-only" title="No matching branch on the remote">local only</span>'
        : '<span class="tag remote-only" title="Remote-only branch">remote-only</span>',
    ].join('');

  // Changes are summarized against the main branch: no info without one, nor on the main branch itself
  const hasMain = branches.some((branch) => branch.isMainBranch);
  const rows = branches.map((branch) => ({
    id: branch.name,
    label: branch.name,
    tags: tags(branch),
    date: branch.lastCommit,
    locked: branch.isMainBranch || branch.isCurrentBranch,
    info: hasMain && !branch.isMainBranch && branch.isLocal,
    switchable: branch.isLocal && !branch.isCurrentBranch,
  }));
  return listContent('branches', rows, repositories, selectedRepository, busy);
}

export function getStashListContent(
  stashes: Stash[],
  repositories: RepositoryOption[],
  selectedRepository: string,
  busy = false
): string {
  const rows = stashes.map((stash) => ({
    id: stash.hash,
    label: `${stash.ref}: ${stash.message}`,
    date: stash.date,
    info: true,
  }));
  return listContent('stashes', rows, repositories, selectedRepository, busy);
}

// Diffs are inserted with textContent: file content is never parsed as HTML
const changesScript = `
  const vscode = acquireVsCodeApi();
  const back = document.getElementById('backBtn');

  back.addEventListener('click', () => {
    back.disabled = true;
    vscode.postMessage({ type: 'back' });
  });

  // A file's diff is loaded the first time it is opened
  document.querySelectorAll('.file-list details').forEach((details) =>
    details.addEventListener('toggle', () => {
      if (details.open && !details.dataset.loaded) {
        details.dataset.loaded = 'true';
        vscode.postMessage({ type: 'loadDiff', index: Number(details.dataset.index) });
      }
    })
  );

  function element(className, text) {
    const node = document.createElement('div');
    node.className = className;
    node.textContent = text;
    return node;
  }

  function showDiff(data) {
    const diff = document.querySelector('details[data-index="' + data.index + '"] .diff');
    if (!diff) {
      return;
    }
    if (data.error) {
      return diff.replaceChildren(element('error', data.error));
    }
    if (!data.lines.length) {
      return diff.replaceChildren(element('empty', 'No text changes (binary file or mode change)'));
    }
    const lines = document.createElement('div');
    lines.className = 'diff-lines';
    for (const line of data.lines) {
      const kind = line[0] === '+' ? 'added' : line[0] === '-' ? 'deleted' : line[0] === '@' || line[0] === '\\\\' ? 'hunk' : '';
      lines.append(element(kind, line || ' '));
    }
    if (data.hidden) {
      lines.append(element('hunk', '... ' + data.hidden + ' more lines not shown'));
    }
    diff.replaceChildren(lines);
  }

  window.addEventListener('message', (event) => {
    if (event.data.type === 'setControlsState') {
      back.disabled = !event.data.enabled;
    } else if (event.data.type === 'diff') {
      showDiff(event.data);
    }
  });
`;

const stat = (change: { added: number; deleted: number }) =>
  `<span class="stat"><span class="added">+${change.added}</span> <span class="deleted">-${change.deleted}</span></span>`;

/**
 * Changes page of a stash or a branch: one collapsed row per file, its diff loaded on open
 * @param title Stash or branch name
 */
export function getChangesContent(title: string, files: ChangedFile[]): string {
  const total = files.reduce((sum, file) => ({ added: sum.added + file.added, deleted: sum.deleted + file.deleted }), {
    added: 0,
    deleted: 0,
  });

  const list = files.length
    ? `
      <div class="row list-header changes-header">
        <span class="item-name">${files.length} file${files.length > 1 ? 's' : ''} changed</span>
        ${stat(total)}
      </div>
      <ul class="file-list">
        ${files
          .map((file, index) => {
            const slash = file.path.lastIndexOf('/');
            const filePath = escapeHtml(file.path);
            return `
              <li>
                <details data-index="${index}">
                  <summary class="row" title="${filePath}">
                    <span class="file-name">${escapeHtml(file.path.slice(slash + 1))}</span>
                    <span class="file-dir">${escapeHtml(file.path.slice(0, Math.max(slash, 0)))}</span>
                    ${file.binary ? '<span class="stat">binary</span>' : stat(file)}
                  </summary>
                  <div class="diff"><div class="status" role="status"><div class="spinner"></div><span>${messages.loading}</span></div></div>
                </details>
              </li>`;
          })
          .join('')}
      </ul>`
    : `<div class="empty">${messages.noChanges}</div>`;

  return page(
    `
    <div class="toolbar">
      <button id="backBtn" class="icon-button" title="${messages.backTitle}" aria-label="${messages.backTitle}">${backIcon}</button>
      <span class="repo-name" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
    </div>
    ${list}
  `,
    changesScript
  );
}
