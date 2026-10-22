// Run with: pnpm run test:unit (plain Node, no VS Code needed)
import * as assert from 'assert';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseBranches, parseDiff, parseNumstat, parseStashes, REF_FORMAT, STASH_FORMAT } from '../services/branchParser';

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
  // A newer commit on local-only: it must come first
  git(clone, 'checkout', '-q', 'local-only');
  process.env.GIT_COMMITTER_DATE = '2030-08-25T12:00:00Z';
  git(clone, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'newer');
  delete process.env.GIT_COMMITTER_DATE;
  git(clone, 'checkout', '-q', 'develop');

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
  assert.strictEqual(branches[0].name, 'local-only', 'sorted by last commit, newest first');
  assert.strictEqual(byName['local-only'].lastCommit, Date.parse('2030-08-25T12:00:00Z'));

  // Same call shape as GitService.deleteBranches: names are plain arguments, never run by a shell
  git(clone, 'branch', '-D', '--', '$(id);x&whoami', 'local-only');
  const remaining = git(clone, 'branch', '--format=%(refname:short)').split('\n').filter(Boolean).sort();
  assert.deepStrictEqual(remaining, ['develop', 'feature/kept', 'gone']);

  // Stashes: newest first; dropping by hash from the highest index keeps the other refs valid
  const stash = (message: string) => {
    writeFileSync(join(clone, 'file.txt'), message);
    git(clone, 'add', 'file.txt');
    git(clone, '-c', 'user.name=t', '-c', 'user.email=t@t', 'stash', 'push', '-q', '-m', message);
  };
  ['first', 'second', 'third'].forEach(stash);
  const stashes = parseStashes(git(clone, 'stash', 'list', `--format=${STASH_FORMAT}`));
  assert.deepStrictEqual(
    stashes.map((s) => [s.ref, s.message]),
    [['stash@{0}', 'On develop: third'], ['stash@{1}', 'On develop: second'], ['stash@{2}', 'On develop: first']]
  );
  assert.match(stashes[0].hash, /^[0-9a-f]{40}$/);
  assert.ok(stashes[0].date > 0);
  // Same order as GitService.dropStashes: oldest selected first
  [stashes[2], stashes[0]].forEach((s) => git(clone, 'stash', 'drop', '-q', s.ref));
  assert.deepStrictEqual(
    parseStashes(git(clone, 'stash', 'list', `--format=${STASH_FORMAT}`)).map((s) => s.hash),
    [stashes[1].hash]
  );

  // Changes: same calls as GitService.getChangedFiles / getFileDiff (stash by hash, still valid after the drops)
  const diff = (...args: string[]) => git(clone, 'diff', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', ...args);
  const changedFiles = (range: string[]) => parseNumstat(diff('--numstat', '-z', ...range, '--'));
  const fileDiff = (range: string[], path: string) =>
    parseDiff(git(clone, '--literal-pathspecs', 'diff', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', ...range, '--', path));
  const stashRange = [`${stashes[1].hash}^1`, stashes[1].hash];
  assert.deepStrictEqual(changedFiles(stashRange), [{ path: 'file.txt', added: 1, deleted: 0, binary: false }]);
  assert.deepStrictEqual(fileDiff(stashRange, 'file.txt'), ['@@ -0,0 +1 @@', '+second', '\\ No newline at end of file']);

  // Branch changes and switch: same calls as GitService.getChangedFiles / switchBranch
  const commit = (message: string) => git(clone, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', message);
  git(clone, 'switch', '-q', '--no-guess', '--end-of-options', 'feature/kept');
  const globName = 'a b[1].txt'; // glob characters: the literal pathspec must match only this file
  writeFileSync(join(clone, globName), 'a\nb\n');
  writeFileSync(join(clone, 'a b1.txt'), 'other\n');
  writeFileSync(join(clone, 'image.bin'), Buffer.from([0, 1, 2, 0]));
  git(clone, 'add', '.');
  commit('on branch');
  git(clone, 'switch', '-q', '--no-guess', '--end-of-options', 'develop');
  assert.strictEqual(git(clone, 'branch', '--show-current').trim(), 'develop');
  // A change on develop after the branch left it must not count (merge-base diff)
  writeFileSync(join(clone, 'main-only.txt'), 'x\n');
  git(clone, 'add', 'main-only.txt');
  commit('on develop');
  const branchRange = (branch: string) => [`refs/heads/develop...refs/heads/${branch}`];
  assert.deepStrictEqual(changedFiles(branchRange('feature/kept')), [
    { path: 'a b1.txt', added: 1, deleted: 0, binary: false },
    { path: globName, added: 2, deleted: 0, binary: false },
    { path: 'image.bin', added: 0, deleted: 0, binary: true },
  ]);
  assert.deepStrictEqual(fileDiff(branchRange('feature/kept'), globName), ['@@ -0,0 +1,2 @@', '+a', '+b']);
  assert.deepStrictEqual(fileDiff(branchRange('feature/kept'), 'image.bin'), [], 'binary: no text diff');
  assert.deepStrictEqual(changedFiles(branchRange('gone')), []);

  // An interrupted cherry-pick blocks the switch until it is quit (GitService.quitSequencer)
  writeFileSync(join(clone, 'conflict.txt'), 'develop\n');
  git(clone, 'add', 'conflict.txt');
  commit('develop side');
  git(clone, 'switch', '-q', '--no-guess', '--end-of-options', 'gone');
  writeFileSync(join(clone, 'conflict.txt'), 'gone\n');
  git(clone, 'add', 'conflict.txt');
  commit('gone side');
  git(clone, 'switch', '-q', '--no-guess', '--end-of-options', 'develop');
  assert.throws(() => execFileSync('git', ['cherry-pick', 'gone'], { cwd: clone, stdio: 'pipe' }), 'conflict expected');
  git(clone, 'add', 'conflict.txt'); // conflict resolved, cherry-pick not finished
  assert.throws(
    () => execFileSync('git', ['switch', '--no-guess', '--end-of-options', 'feature/kept'], { cwd: clone, stdio: 'pipe' }),
    (error: { stderr: Buffer }) => /while (cherry-picking|reverting)/.test(error.stderr.toString())
  );
  git(clone, 'cherry-pick', '--quit');
  commit('resolved'); // the resolved change stays staged after --quit: keep it, or the target branch would overwrite it
  git(clone, 'switch', '-q', '--no-guess', '--end-of-options', 'feature/kept');
  assert.strictEqual(git(clone, 'branch', '--show-current').trim(), 'feature/kept');

  console.log('branchParser (branches, stashes, changes, switch): ok');
} finally {
  rmSync(root, { recursive: true, force: true });
}
