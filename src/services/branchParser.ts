import { Branch, ChangedFile, Stash } from '../types';

/** `git for-each-ref` format: one NUL-separated record per line (NUL cannot appear in ref names) */
export const REF_FORMAT = '%(refname)%00%(HEAD)%00%(upstream)%00%(symref)%00%(committerdate:unix)';

const HEADS = 'refs/heads/';
const REMOTES = 'refs/remotes/';

/**
 * Build the branch list from `git for-each-ref --format=REF_FORMAT refs/heads refs/remotes`
 */
export function parseBranches(output: string): Branch[] {
  const refs = output
    .split('\n')
    .filter((line) => line)
    .map((line) => {
      const [ref, head, upstream, symref, date] = line.split('\0');
      return { ref, isHead: head === '*', upstream, symref, lastCommit: Number(date) * 1000 };
    });

  const remoteRefs = new Set(refs.filter((r) => r.ref.startsWith(REMOTES) && !r.symref).map((r) => r.ref));
  // refs/remotes/<remote>/<branch> -> <branch>
  const remoteBranchNames = new Set([...remoteRefs].map((ref) => ref.split('/').slice(3).join('/')));
  const localRefs = refs.filter((r) => r.ref.startsWith(HEADS));
  const localNames = localRefs.map((r) => r.ref.slice(HEADS.length));

  // Main branch: the one origin/HEAD points to, else main, else master
  const originHead = refs.find((r) => r.ref === `${REMOTES}origin/HEAD`)?.symref;
  const mainBranch = originHead?.startsWith(`${REMOTES}origin/`)
    ? originHead.slice(`${REMOTES}origin/`.length)
    : ['main', 'master'].find((name) => localNames.includes(name));

  // Build branch objects from all refs
  const allBranches: Branch[] = [];

  // Add local branches
  for (const r of localRefs) {
    const name = r.ref.slice(HEADS.length);
    allBranches.push({
      name,
      isLocal: true,
      exists: {
        local: true,
        // Tracked branch: its upstream must still exist; untracked: any remote branch with the same name
        remote: r.upstream.startsWith(REMOTES) ? remoteRefs.has(r.upstream) : remoteBranchNames.has(name),
      },
      isCurrentBranch: r.isHead,
      isMainBranch: name === mainBranch,
      lastCommit: r.lastCommit,
    });
  }

  // Add remote-only branches (branches that exist on remote but not locally)
  for (const remoteRef of remoteRefs) {
    const name = remoteRef.split('/').slice(3).join('/');
    // Skip if this remote branch has a corresponding local branch
    if (!localNames.includes(name)) {
      const refInfo = refs.find((r) => r.ref === remoteRef);
      if (refInfo) {
        allBranches.push({
          name,
          isLocal: false,
          exists: {
            local: false,
            remote: true,
          },
          isCurrentBranch: false,
          isMainBranch: name === mainBranch,
          lastCommit: refInfo.lastCommit,
        });
      }
    }
  }

  // Sort all branches by last commit date (most recent first)
  return allBranches.sort((a, b) => b.lastCommit - a.lastCommit);
}

/** `git stash list` format: same NUL-separated records as REF_FORMAT */
export const STASH_FORMAT = '%gd%x00%H%x00%ct%x00%gs';

/**
 * Build the stash list from `git stash list --format=STASH_FORMAT` (newest first, as git lists them)
 */
export function parseStashes(output: string): Stash[] {
  return output
    .split('\n')
    .filter((line) => line)
    .map((line) => {
      const [ref, hash, date, message] = line.split('\0');
      return { ref, hash, message, date: Number(date) * 1000 };
    });
}

/**
 * Files of `git diff --numstat -z --no-renames` output (NUL-terminated: any path is kept as-is)
 */
export function parseNumstat(output: string): ChangedFile[] {
  return output
    .split('\0')
    .filter((record) => record)
    .map((record) => {
      const [added, deleted, ...path] = record.split('\t');
      // Binary files show "-" instead of line counts
      return { path: path.join('\t'), added: Number(added) || 0, deleted: Number(deleted) || 0, binary: added === '-' };
    });
}

/**
 * Lines of a single-file `git diff` from the first hunk on (headers dropped); empty when there is no text diff (binary, mode change)
 */
export function parseDiff(output: string): string[] {
  const lines = output.split('\n');
  const start = lines.findIndex((line) => line.startsWith('@@'));
  if (start < 0) {
    return [];
  }
  // Drop the empty string after the final newline
  return lines.slice(start, lines[lines.length - 1] === '' ? -1 : undefined);
}
