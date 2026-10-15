/**
 * Local release flow: version with changesets, verify, commit, annotated tag, atomic push.
 *
 * Usage:
 *   node scripts/release.ts              # normal release (needs a pending changeset)
 *   node scripts/release.ts --tag-only   # tag the current HEAD (the version is already bumped)
 *
 * Normally started through `pnpm run release`, which runs `pnpm verify` first.
 * The stages and what each leaves behind when it stops are defined in the spec (K1).
 * This script never force-pushes and never merges.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import {
  checkSameVersion,
  checkTag,
  parseGhReleaseView,
  parseReleaseArgs,
} from './lib/release-check.ts';
import type { Check, ReleaseLookup, WorkspacePackage } from './lib/release-check.ts';

export interface GitResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export interface ReleaseDeps {
  git(args: string[]): GitResult;
  changesetVersion(): Check<void>;
  prettier(files: string[]): Check<void>;
  checkRelease(tag: string): Check<void>;
  consumer(): Check<void>;
  ghRelease(tag: string): ReleaseLookup;
  confirm(question: string): Promise<boolean>;
  log(line: string): void;
}

export type ReleaseOutcome =
  | { status: 'released'; tag: string }
  | { status: 'tag-pushed'; tag: string }
  | { status: 'stopped'; stage: string; reason: string };

const BRANCH = 'master';
const REVERT_VERSIONING = 'git checkout -- . && git clean -fd .changeset packages';

export async function runRelease(
  options: { tagOnly: boolean },
  deps: ReleaseDeps
): Promise<ReleaseOutcome> {
  const { git, log } = deps;
  let tag = '';

  const stop = (stage: string, reason: string, recovery?: string): ReleaseOutcome => {
    log(`release stopped at ${stage}: ${reason}`);
    if (recovery) log(`to undo: ${recovery}`);
    return { status: 'stopped', stage, reason };
  };
  const errorText = (r: { errors: string[] }): string => r.errors.join('; ');

  const topLevel = git(['rev-parse', '--show-toplevel']);
  if (topLevel.status !== 0) return stop('1 prerequisites', 'not inside a git repository');
  const root = topLevel.stdout.trim();

  // 段 1: 前提。何も変えない
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch.stdout.trim() !== BRANCH) {
    return stop(
      '1 prerequisites',
      `current branch is "${branch.stdout.trim()}", expected ${BRANCH}`
    );
  }
  const dirty = git(['status', '--porcelain']);
  if (dirty.status !== 0 || dirty.stdout.trim() !== '') {
    return stop('1 prerequisites', 'working tree is not clean');
  }
  if (git(['fetch', 'origin']).status !== 0)
    return stop('1 prerequisites', 'git fetch origin failed');
  const head = git(['rev-parse', 'HEAD']).stdout.trim();
  const originHead = git(['rev-parse', `origin/${BRANCH}`]).stdout.trim();
  if (head === '' || head !== originHead) {
    return stop('1 prerequisites', `HEAD is not equal to origin/${BRANCH}`);
  }

  const tagState = (name: string): { ok: true } | { ok: false; reason: string } => {
    const local = git(['rev-parse', '-q', '--verify', `refs/tags/${name}`]);
    if (local.status === 0) return { ok: false, reason: `tag ${name} already exists locally` };
    const remote = git(['ls-remote', '--tags', 'origin', `refs/tags/${name}`]);
    // 判定できないときは進まない (fail-closed)
    if (remote.status !== 0)
      return {
        ok: false,
        reason: 'git ls-remote failed; cannot tell whether the tag exists on origin',
      };
    if (remote.stdout.trim() !== '')
      return { ok: false, reason: `tag ${name} already exists on origin` };
    return { ok: true };
  };

  if (options.tagOnly) {
    const version = readVersion(root, git);
    if (!version.ok) return stop('1 prerequisites', errorText(version));
    tag = `v${version.value}`;
    const tagCheck = checkTag(tag, version.value);
    if (!tagCheck.ok) return stop('1 prerequisites', errorText(tagCheck));
    const state = tagState(tag);
    if (!state.ok) return stop('1 prerequisites', state.reason);
    const lookup = deps.ghRelease(tag);
    if (lookup.kind === 'found')
      return stop('1 prerequisites', `GitHub Release ${tag} already exists`);
    if (lookup.kind === 'error') return stop('1 prerequisites', lookup.message);
  } else {
    const changesets = git(['ls-files', '.changeset'])
      .stdout.split('\n')
      .filter((f) => f.endsWith('.md') && f !== '.changeset/README.md');
    if (changesets.length === 0) return stop('1 prerequisites', 'no pending changeset');
  }

  // 段 2: 版上げ (--tag-only は飛ばす)
  if (!options.tagOnly) {
    const versioned = deps.changesetVersion();
    if (!versioned.ok) return stop('2 versioning', errorText(versioned), REVERT_VERSIONING);
    const changed = git(['diff', '--name-only', '--diff-filter=ACMR'])
      .stdout.split('\n')
      .filter(Boolean);
    const formatted = deps.prettier(changed);
    if (!formatted.ok) return stop('2 versioning', errorText(formatted), REVERT_VERSIONING);
    const version = readVersion(root, git);
    if (!version.ok) return stop('2 versioning', errorText(version), REVERT_VERSIONING);
    tag = `v${version.value}`;
  }
  const recovery = options.tagOnly ? undefined : REVERT_VERSIONING;

  // 段 3: 公開前提
  const checked = deps.checkRelease(tag);
  if (!checked.ok) return stop('3 publish preconditions', errorText(checked), recovery);
  if (!options.tagOnly) {
    const state = tagState(tag);
    if (!state.ok) return stop('3 publish preconditions', state.reason, recovery);
  }

  // 段 4: 利用者テスト (新しい版の tarball で)
  const consumed = deps.consumer();
  if (!consumed.ok) return stop('4 consumer test', errorText(consumed), recovery);

  // 段 5: 確認
  const files = git(['status', '--short']).stdout.trim();
  const question = options.tagOnly
    ? `Tag HEAD as ${tag} and push the tag?`
    : `Release ${tag}?\n${files}\nCommit, tag and push to origin/${BRANCH}?`;
  if (!(await deps.confirm(question))) return stop('5 confirmation', 'declined', recovery);

  // 段 6: 記録
  if (!options.tagOnly) {
    if (git(['add', '-A']).status !== 0) return stop('6 record', 'git add failed', recovery);
    const commit = git(['commit', '-m', `chore: release ${tag}`]);
    if (commit.status !== 0)
      return stop('6 record', `git commit failed: ${commit.stderr.trim()}`, recovery);
  }
  const tagged = git(['tag', '-a', tag, '-m', tag]);
  if (tagged.status !== 0) {
    return stop(
      '6 record',
      `git tag failed: ${tagged.stderr.trim()}`,
      options.tagOnly ? undefined : `git reset --hard origin/${BRANCH}`
    );
  }

  // 段 7: 送信。--atomic で、拒否されたら origin は変わらない。force は使わない
  const pushArgs = options.tagOnly
    ? ['push', 'origin', `refs/tags/${tag}`]
    : ['push', '--atomic', 'origin', BRANCH, `refs/tags/${tag}`];
  const pushed = git(pushArgs);
  if (pushed.status !== 0) {
    const undo = options.tagOnly
      ? `git tag -d ${tag}`
      : `git tag -d ${tag} && git reset --hard origin/${BRANCH}`;
    return stop('7 push', `git push was rejected or failed: ${pushed.stderr.trim()}`, undo);
  }
  log(`pushed ${tag}`);
  return options.tagOnly ? { status: 'tag-pushed', tag } : { status: 'released', tag };
}

function readVersion(root: string, git: ReleaseDeps['git']): Check<string> {
  const listed = git(['ls-files', '--', ':(glob)packages/*/package.json']);
  const pkgs: WorkspacePackage[] = [];
  for (const rel of listed.stdout.split('\n').filter(Boolean)) {
    const file = join(root, rel);
    if (!existsSync(file)) continue;
    const json = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    if (json['private'] === true) continue;
    pkgs.push({
      name: String(json['name']),
      dir: rel,
      version: String(json['version']),
      private: false,
      dependencies: {},
      peerDependencies: {},
      optionalDependencies: {},
    });
  }
  if (pkgs.length === 0) return { ok: false, errors: ['no public packages found'] };
  return checkSameVersion(pkgs);
}

function spawnChecked(cmd: string, args: string[]): Check<void> {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  return r.status === 0
    ? { ok: true, value: undefined }
    : { ok: false, errors: [`${cmd} ${args.join(' ')} exited with ${r.status ?? 'a signal'}`] };
}

async function main(argv: string[]): Promise<number> {
  const parsed = parseReleaseArgs(argv);
  if (!parsed.ok) {
    console.error(parsed.errors.join('\n'));
    return 1;
  }
  const checkReleaseScript = new URL('./check-release.ts', import.meta.url).pathname;
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  const deps: ReleaseDeps = {
    git: (args) => {
      const r = spawnSync('git', args, { encoding: 'utf8' });
      return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
    },
    changesetVersion: () => spawnChecked('pnpm', ['changeset', 'version']),
    prettier: (files) =>
      files.length === 0
        ? { ok: true, value: undefined }
        : spawnChecked('pnpm', ['exec', 'prettier', '--write', ...files]),
    checkRelease: (tag) =>
      spawnChecked(process.execPath, [checkReleaseScript, 'check', '--tag', tag, '--registry']),
    consumer: () => spawnChecked('pnpm', ['test:consumer']),
    ghRelease: (tag) => {
      const r = spawnSync('gh', ['release', 'view', tag], { encoding: 'utf8' });
      return parseGhReleaseView(r.status, r.stderr ?? '');
    },
    confirm: async (question) =>
      /^y(es)?$/i.test((await readline.question(`${question} [y/N] `)).trim()),
    log: (line) => console.log(line),
  };
  try {
    const outcome = await runRelease(parsed.value, deps);
    return outcome.status === 'stopped' ? 1 : 0;
  } finally {
    readline.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main(process.argv.slice(2));
}
