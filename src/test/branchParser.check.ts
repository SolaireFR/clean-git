// Run with: pnpm run test:unit (plain Node, no VS Code needed)
import * as assert from 'assert';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseBranches, REF_FORMAT } from '../services/branchParser';

const root = mkdtempSync(join(tmpdir(), 'branch-pruner-'));
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' });

try {
  const origin = join(root, 'origin');
  const clone = join(root, 'clone');
  git(root, 'init', '-q', '-b', 'develop', origin);
  git(origin, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init');
  git(origin, 'branch', 'feature/kept');
  git(origin, 'branch', 'gone');
  git(root, 'clone', '-q', origin, clone);

  git(clone, 'branch', '--track', 'gone', 'origin/gone');
  git(clone, 'branch', '--track', 'feature/kept', 'origin/feature/kept');
  git(clone, 'branch', 'local-only');
  git(clone, 'branch', '$(id);x&whoami'); // shell metacharacters are valid in branch names
  git(origin, 'branch', '-D', 'gone');
  git(clone, 'fetch', '-q', '--prune');

  const branches = parseBranches(
    git(clone, 'for-each-ref', `--format=${REF_FORMAT}`, 'refs/heads', 'refs/remotes')
  );
  const byName = Object.fromEntries(branches.map((branch) => [branch.name, branch]));

  assert.deepStrictEqual(Object.keys(byName).sort(), ['$(id);x&whoami', 'develop', 'feature/kept', 'gone', 'local-only']);
  assert.ok(byName['develop'].isCurrentBranch && byName['develop'].isMainBranch, 'origin/HEAD defines the main branch');
  assert.ok(byName['develop'].exists.remote);
  assert.ok(byName['feature/kept'].exists.remote, 'tracked branch still on remote');
  assert.ok(!byName['gone'].exists.remote, 'upstream deleted on remote');
  assert.ok(!byName['local-only'].exists.remote);
  assert.ok(!byName['local-only'].isCurrentBranch && !byName['local-only'].isMainBranch);

  // Same call shape as GitService.deleteBranches: names are plain arguments, never run by a shell
  git(clone, 'branch', '-D', '--', '$(id);x&whoami', 'local-only');
  const remaining = git(clone, 'branch', '--format=%(refname:short)').split('\n').filter(Boolean).sort();
  assert.deepStrictEqual(remaining, ['develop', 'feature/kept', 'gone']);

  console.log('branchParser: ok');
} finally {
  rmSync(root, { recursive: true, force: true });
}
