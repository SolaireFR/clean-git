import { Branch } from '../types';

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

  // Most recent last commit first
  return localRefs.sort((a, b) => b.lastCommit - a.lastCommit).map((r) => {
    const name = r.ref.slice(HEADS.length);
    return {
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
    };
  });
}
