// .github/workflows の構造の検査 (spec K3 / K10 / K12)。
// release.yml は tag push でしか動かず PR では実行されないので、特権の配置と step の結線をここで固定する。
// shell の step は取り出して、偽の npm / gh を PATH に置いて実際に実行する。
import { after, afterEach, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, posix } from 'node:path';
import { parse } from 'yaml';
import {
  GH_245_LIST_ALLOWED,
  GH_245_VIEW_ALLOWED,
  GH_RUN_LIST_FIELDS,
  GH_RUN_VIEW_FIELDS,
  RELEASE_JOB_NAMES,
  RELEASING_SECTIONS,
  isSubsetOfAllowlist,
} from './lib/release-after-push-check.ts';
import { makeWorkspace, removeWorkspace } from './lib/test-workspace.ts';

const REPO_ROOT = dirname(import.meta.dirname);
const WORKFLOWS_DIR = join(REPO_ROOT, '.github', 'workflows');
const CLI = join(REPO_ROOT, 'scripts', 'check-release.ts');
const SCRATCH_PREFIX = 'skam-wf-';

interface Step {
  id?: string;
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  if?: unknown;
  'continue-on-error'?: unknown;
}

interface Job {
  needs?: string | string[];
  permissions?: Record<string, string>;
  environment?: unknown;
  if?: unknown;
  'continue-on-error'?: unknown;
  steps?: Step[];
}

interface Workflow {
  on?: unknown;
  permissions?: unknown;
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
  jobs: Record<string, Job>;
}

function loadWorkflow(file: string): Workflow {
  return parse(readFileSync(join(WORKFLOWS_DIR, file), 'utf8')) as Workflow;
}

function workflowFiles(): string[] {
  return readdirSync(WORKFLOWS_DIR)
    .filter((f) => f.endsWith('.yml'))
    .sort();
}

function stepsOf(job: Job | undefined): Step[] {
  return job?.steps ?? [];
}

function jobOf(workflow: Workflow, name: string): Job {
  const job = workflow.jobs[name];
  assert.ok(job, `job ${name} is missing`);
  return job;
}

// step は id で特定し、ちょうど 1 つであることを求める (name の書き換えで検査が無効にならないように)
function stepById(job: Job, id: string): Step {
  const found = stepsOf(job).filter((s) => s.id === id);
  assert.equal(found.length, 1, `expected exactly one step with id ${id}, found ${found.length}`);
  return found[0]!;
}

function runOf(job: Job, id: string): string {
  const run = stepById(job, id).run;
  assert.equal(typeof run, 'string', `step ${id} has no run`);
  return run!;
}

function needsOf(job: Job): string[] {
  return job.needs === undefined ? [] : Array.isArray(job.needs) ? job.needs : [job.needs];
}

const scratchDirs: string[] = [];

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), SCRATCH_PREFIX));
  scratchDirs.push(dir);
  return dir;
}

// mkdtempSync が返したパスだけを、tmpdir 直下の skam-wf-* であることを確かめて消す
function removeScratch(dir: string): void {
  const real = realpathSync(dir);
  if (dirname(real) !== realpathSync(tmpdir()) || !basename(real).startsWith(SCRATCH_PREFIX)) {
    throw new Error(`refused to remove unexpected path ${real}`);
  }
  rmSync(real, { recursive: true, force: true });
}

function runShell(
  run: string,
  options: { cwd: string; env: Record<string, string> }
): { status: number | null; stdout: string; stderr: string } {
  // Actions の既定 shell と同じ `bash -e {0}`。script は cwd の外に置く
  const script = join(scratchDir(), 'step.sh');
  writeFileSync(script, run);
  const r = spawnSync('bash', ['-e', script], {
    cwd: options.cwd,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function fakeBin(name: string, body: string): string {
  const dir = scratchDir();
  const file = join(dir, name);
  writeFileSync(file, `#!/bin/sh\n${body}\n`);
  chmodSync(file, 0o755);
  return dir;
}

afterEach(() => {
  for (const dir of scratchDirs.splice(0)) removeScratch(dir);
});

describe('all workflows', () => {
  test('(1) no run step expands an expression directly; values go through env', () => {
    const offenders: string[] = [];
    for (const file of workflowFiles()) {
      const workflow = loadWorkflow(file);
      for (const [jobName, job] of Object.entries(workflow.jobs)) {
        for (const step of stepsOf(job)) {
          if (step.run?.includes('${{'))
            offenders.push(`${file}:${jobName}:${step.id ?? step.name}`);
        }
      }
    }
    assert.deepEqual(offenders, []);
  });

  test('(2) top-level permissions are empty', () => {
    for (const file of workflowFiles()) {
      assert.deepEqual(loadWorkflow(file).permissions, {}, file);
    }
  });
});

describe('release.yml', () => {
  const release = (): Workflow => loadWorkflow('release.yml');

  test('(3a) starts only from a tag push', () => {
    assert.deepEqual(release().on, { push: { tags: ['v*'] } });
  });

  test('(3b) privileges sit only on the job that needs them', () => {
    const wf = release();
    assert.deepEqual(Object.keys(wf.jobs).sort(), ['github-release', 'npm-stage', 'validate']);
    assert.deepEqual(jobOf(wf, 'validate').permissions, { contents: 'read' });
    assert.equal(jobOf(wf, 'validate').environment, undefined);
    assert.deepEqual(jobOf(wf, 'npm-stage').permissions, { contents: 'read', 'id-token': 'write' });
    assert.equal(jobOf(wf, 'npm-stage').environment, 'npm');
    assert.deepEqual(jobOf(wf, 'github-release').permissions, { contents: 'write' });
    assert.equal(jobOf(wf, 'github-release').environment, undefined);
    for (const [name, job] of Object.entries(wf.jobs)) {
      if (name !== 'npm-stage') assert.equal(job.permissions?.['id-token'], undefined, name);
      if (name !== 'github-release') assert.notEqual(job.permissions?.['contents'], 'write', name);
    }
  });

  test('(3c) stage and release wait for validate; runs are serialized and never cancelled', () => {
    const wf = release();
    assert.deepEqual(needsOf(jobOf(wf, 'validate')), []);
    assert.deepEqual(needsOf(jobOf(wf, 'npm-stage')), ['validate']);
    assert.deepEqual(needsOf(jobOf(wf, 'github-release')), ['validate']);
    assert.equal(wf.concurrency?.group, 'release');
    assert.equal(wf.concurrency?.['cancel-in-progress'], false);
  });

  test('(3d) npm-stage runs no third-party code while the OIDC token is available', () => {
    const steps = stepsOf(jobOf(release(), 'npm-stage'));
    const uses = steps.flatMap((s) => (s.uses === undefined ? [] : [s.uses]));
    assert.equal(uses.length, 2);
    assert.ok(uses.some((u) => u.startsWith('actions/download-artifact@')));
    assert.ok(uses.some((u) => u.startsWith('actions/setup-node@')));
    const runs = steps.flatMap((s) => (s.run === undefined ? [] : [s.run]));
    const all = runs.join('\n');
    for (const banned of ['pnpm', 'npx', 'npm ci', 'npm i ', 'corepack', 'npm publish']) {
      assert.ok(!all.includes(banned), `npm-stage run contains ${JSON.stringify(banned)}`);
    }
    assert.deepEqual(all.match(/npm install[^\n]*/g), ['npm install -g npm@12.1.0']);
  });

  test('(3e) validate runs verify, check, pack, consumer, verify-manifest, upload, summary in order', () => {
    const job = jobOf(release(), 'validate');
    const expected = [
      'verify',
      'check',
      'pack',
      'consumer',
      'verify-manifest',
      'upload',
      'summary',
    ];
    const ids = stepsOf(job).flatMap((s) =>
      s.id !== undefined && expected.includes(s.id) ? [s.id] : []
    );
    assert.deepEqual(ids, expected);

    const check = runOf(job, 'check');
    assert.match(check, /--tag/);
    assert.match(check, /--registry/);

    const outValue = /--out\s+("[^"]+"|\S+)/.exec(runOf(job, 'pack'))?.[1];
    const tarballsValue = /--tarballs\s+("[^"]+"|\S+)/.exec(runOf(job, 'consumer'))?.[1];
    assert.ok(outValue, 'pack has no --out');
    assert.equal(tarballsValue, outValue);

    assert.equal(stepById(job, 'upload').with?.['if-no-files-found'], 'error');
  });

  test('(3f) validate sets up pnpm and node like ci.yml, differing only in the cache', () => {
    const pick = (job: Job) => ({
      pnpm: stepsOf(job).filter((s) => s.uses?.startsWith('pnpm/action-setup@')),
      node: stepsOf(job).filter((s) => s.uses?.startsWith('actions/setup-node@')),
    });
    const validate = pick(jobOf(release(), 'validate'));
    assert.equal(validate.pnpm.length, 1);
    assert.equal(validate.node.length, 1);
    const ci = loadWorkflow('ci.yml');
    assert.ok(Object.keys(ci.jobs).length > 0);
    for (const [name, job] of Object.entries(ci.jobs)) {
      const theirs = pick(job);
      assert.equal(theirs.pnpm.length, 1, name);
      assert.equal(theirs.node.length, 1, name);
      // 2 つの uses を組で比べる (SHA まで)
      assert.equal(validate.pnpm[0]!.uses, theirs.pnpm[0]!.uses, name);
      assert.equal(validate.node[0]!.uses, theirs.node[0]!.uses, name);
      assert.deepEqual(validate.pnpm[0]!.with, theirs.pnpm[0]!.with, name);
      const { cache, ...withoutCache } = theirs.node[0]!.with ?? {};
      assert.equal(cache, 'pnpm', name);
      // cache は外し、zizmor の cache-poisoning のために自動 cache を明示的に切る (それ以外の with は同じ)
      assert.deepEqual(
        validate.node[0]!.with,
        { ...withoutCache, 'package-manager-cache': false },
        name
      );
    }
  });

  test('(3g) github-release verifies the tag and generates notes', () => {
    const run = runOf(jobOf(release(), 'github-release'), 'release');
    assert.match(run, /--verify-tag/);
    assert.match(run, /--generate-notes/);
  });

  test('(6) validate calls pnpm run verify', () => {
    assert.equal(runOf(jobOf(release(), 'validate'), 'verify').trim(), 'pnpm run verify');
  });

  test('every uses is pinned to a full SHA with a version comment', () => {
    const text = readFileSync(join(WORKFLOWS_DIR, 'release.yml'), 'utf8');
    const lines = text.split('\n').filter((l) => /^\s*-?\s*uses:/.test(l));
    assert.ok(lines.length > 0);
    for (const line of lines) assert.match(line, /@[0-9a-f]{40} # v\d/, line);
  });
});

// (4a)(4b)(4c) と summary は、check-release pack が作った本物の manifest と tgz を使って step を実行する
describe('release.yml steps, executed', () => {
  interface Bundle {
    dir: string;
    tag: string;
  }
  let stable: Bundle;
  let prerelease: Bundle;
  const workspaces: string[] = [];
  const bundleHolders: string[] = [];

  function pack(version: string): Bundle {
    const root = makeWorkspace({ version });
    workspaces.push(root);
    // afterEach が消す scratchDirs には入れない (describe 全体で使い回す)
    const holder = mkdtempSync(join(tmpdir(), SCRATCH_PREFIX));
    bundleHolders.push(holder);
    const dir = join(holder, 'npm-tarball');
    const tag = `v${version}`;
    const r = spawnSync(
      process.execPath,
      [CLI, 'pack', '--root', root, '--out', dir, '--tag', tag],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(r.status, 0, r.stderr);
    return { dir, tag };
  }

  before(() => {
    stable = pack('0.2.0');
    prerelease = pack('0.3.0-rc.1');
  });

  after(() => {
    for (const w of workspaces.splice(0)) removeWorkspace(w);
    for (const dir of bundleHolders.splice(0)) removeScratch(dir);
  });

  // 検査ごとに fixture の複製を作る。cwd は複製の親で、その下に npm-tarball/ がある
  function workDir(bundle: Bundle): { cwd: string; tarballs: string } {
    const cwd = scratchDir();
    const tarballs = join(cwd, 'npm-tarball');
    cpSync(bundle.dir, tarballs, { recursive: true });
    return { cwd, tarballs };
  }

  interface ManifestShape {
    schemaVersion: number;
    tag: string;
    version: string;
    distTag: string;
    packages: { name: string; file: string; integrity: string }[];
  }

  function readManifest(tarballs: string): ManifestShape {
    return JSON.parse(readFileSync(join(tarballs, 'manifest.json'), 'utf8')) as ManifestShape;
  }

  function writeManifest(tarballs: string, manifest: unknown): void {
    writeFileSync(join(tarballs, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  }

  const validate = (): Job => jobOf(loadWorkflow('release.yml'), 'validate');
  const npmStage = (): Job => jobOf(loadWorkflow('release.yml'), 'npm-stage');

  function verifyArtifact(cwd: string, tag: string) {
    return runShell(runOf(npmStage(), 'verify-artifact'), { cwd, env: { TAG_NAME: tag } });
  }

  test('(4a) verify-artifact accepts the manifest and tarballs that pack produced', () => {
    const { cwd } = workDir(stable);
    const r = verifyArtifact(cwd, stable.tag);
    assert.equal(r.status, 0, r.stderr);
  });

  const rejections: {
    label: string;
    reason: RegExp;
    tag?: string;
    mutate: (tarballs: string, manifest: ManifestShape) => ManifestShape | undefined;
  }[] = [
    {
      label: 'a tgz that is not in the manifest',
      reason: /not in the manifest/,
      mutate: (tarballs) => {
        cpSync(join(tarballs, 'fx-a-0.2.0.tgz'), join(tarballs, 'extra.tgz'));
        return undefined;
      },
    },
    {
      label: 'a tgz in the manifest that is missing',
      reason: /not in the directory/,
      mutate: (tarballs) => {
        rmSync(join(tarballs, 'fx-b-0.2.0.tgz'));
        return undefined;
      },
    },
    {
      label: 'a tgz with one byte changed',
      reason: /integrity/,
      mutate: (tarballs) => {
        const target = join(tarballs, 'fx-a-0.2.0.tgz');
        const bytes = readFileSync(target);
        bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 0xff;
        writeFileSync(target, bytes);
        return undefined;
      },
    },
    {
      label: 'schemaVersion 2',
      reason: /schemaVersion/,
      mutate: (_t, m) => ({ ...m, schemaVersion: 2 }),
    },
    {
      label: 'a manifest tag that differs from the pushed tag',
      reason: /tag/,
      mutate: (_t, m) => ({ ...m, tag: 'v0.2.1' }),
    },
    {
      label: 'distTag next for a stable tag',
      reason: /distTag/,
      mutate: (_t, m) => ({ ...m, distTag: 'next' }),
    },
    {
      label: 'a file name that climbs out of the directory',
      reason: /plain \.tgz/,
      mutate: (_t, m) => ({
        ...m,
        packages: m.packages.map((p, i) => (i === 0 ? { ...p, file: '../x.tgz' } : p)),
      }),
    },
    {
      label: 'an integrity that is not sha512',
      reason: /sha512/,
      mutate: (_t, m) => ({
        ...m,
        packages: m.packages.map((p, i) =>
          i === 0 ? { ...p, integrity: 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' } : p
        ),
      }),
    },
    {
      label: 'an empty packages list',
      reason: /non-empty/,
      mutate: (_t, m) => ({ ...m, packages: [] }),
    },
    {
      label: 'a duplicated name',
      reason: /name .* more than once/,
      mutate: (_t, m) => ({
        ...m,
        packages: m.packages.map((p, i) => (i === 1 ? { ...p, name: m.packages[0]!.name } : p)),
      }),
    },
    {
      label: 'a duplicated file',
      reason: /file .* more than once/,
      mutate: (_t, m) => ({
        ...m,
        packages: m.packages.map((p, i) => (i === 1 ? { ...p, file: m.packages[0]!.file } : p)),
      }),
    },
  ];

  for (const { label, reason, tag, mutate } of rejections) {
    test(`(4a) verify-artifact rejects ${label}`, () => {
      const { cwd, tarballs } = workDir(stable);
      const changed = mutate(tarballs, readManifest(tarballs));
      if (changed !== undefined) writeManifest(tarballs, changed);
      const r = verifyArtifact(cwd, tag ?? stable.tag);
      assert.notEqual(r.status, 0, 'expected a non-zero exit');
      assert.match(r.stderr, reason);
    });
  }

  test('(4a) verify-artifact rejects a prerelease tag whose manifest says latest', () => {
    const { cwd, tarballs } = workDir(prerelease);
    writeManifest(tarballs, { ...readManifest(tarballs), distTag: 'latest' });
    const r = verifyArtifact(cwd, prerelease.tag);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /distTag/);
  });

  // 偽の npm: 呼び出しを 1 行ずつ追記し、FAIL_ON 回目だけ exit 1
  const FAKE_NPM = [
    'echo "$*" >> "$CALLS_FILE"',
    'n=$(wc -l < "$CALLS_FILE")',
    'if [ "$n" = "${FAIL_ON:-0}" ]; then exit 1; fi',
    'exit 0',
  ].join('\n');

  function stage(bundle: Bundle, failOn: number | undefined) {
    const { cwd } = workDir(bundle);
    const bin = fakeBin('npm', FAKE_NPM);
    const callsFile = join(scratchDir(), 'calls.txt');
    writeFileSync(callsFile, '');
    const env: Record<string, string> = {
      PATH: `${bin}:${process.env['PATH'] ?? ''}`,
      CALLS_FILE: callsFile,
      TAG_NAME: bundle.tag,
    };
    if (failOn !== undefined) env['FAIL_ON'] = String(failOn);
    const r = runShell(runOf(npmStage(), 'stage'), { cwd, env });
    const calls = readFileSync(callsFile, 'utf8').split('\n').filter(Boolean);
    return { ...r, calls };
  }

  test('(4b) stage publishes each tarball once, in manifest order, with the latest tag', () => {
    const r = stage(stable, undefined);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.calls, [
      'stage publish ./npm-tarball/fx-a-0.2.0.tgz --access public --tag latest',
      'stage publish ./npm-tarball/fx-b-0.2.0.tgz --access public --tag latest',
    ]);
  });

  test('(4b) stage stops at the first failure', () => {
    const r = stage(stable, 1);
    assert.notEqual(r.status, 0);
    assert.deepEqual(r.calls, [
      'stage publish ./npm-tarball/fx-a-0.2.0.tgz --access public --tag latest',
    ]);
  });

  test('(4b) stage uses the next tag for a prerelease', () => {
    const r = stage(prerelease, undefined);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.calls.length, 2);
    for (const call of r.calls) assert.match(call, / --access public --tag next$/);
  });

  test('(4c) github-release passes --prerelease only for a prerelease tag', () => {
    const run = runOf(jobOf(loadWorkflow('release.yml'), 'github-release'), 'release');
    const calls = (tag: string): string[] => {
      const bin = fakeBin('gh', 'echo "$*" >> "$CALLS_FILE"');
      const callsFile = join(scratchDir(), 'calls.txt');
      writeFileSync(callsFile, '');
      const r = runShell(run, {
        cwd: scratchDir(),
        env: {
          PATH: `${bin}:${process.env['PATH'] ?? ''}`,
          CALLS_FILE: callsFile,
          TAG_NAME: tag,
          GITHUB_REPOSITORY: 'owner/repo',
        },
      });
      assert.equal(r.status, 0, r.stderr);
      return readFileSync(callsFile, 'utf8').split('\n').filter(Boolean);
    };
    const stableCalls = calls('v0.2.0');
    assert.equal(stableCalls.length, 1);
    assert.ok(stableCalls[0]!.includes('release create v0.2.0'));
    assert.ok(!stableCalls[0]!.includes('--prerelease'));
    const rcCalls = calls('v0.3.0-rc.1');
    assert.equal(rcCalls.length, 1);
    assert.ok(rcCalls[0]!.includes('--prerelease'));
  });

  test('summary writes the manifest table that releasing.md refers to, to the summary file and the log', () => {
    const { cwd } = workDir(stable);
    const summaryFile = join(scratchDir(), 'summary.md');
    writeFileSync(summaryFile, '');
    const r = runShell(runOf(validate(), 'summary'), {
      cwd,
      env: { RUNNER_TEMP: cwd, GITHUB_STEP_SUMMARY: summaryFile, TAG_NAME: stable.tag },
    });
    assert.equal(r.status, 0, r.stderr);
    const manifest = readManifest(join(cwd, 'npm-tarball'));
    const expected = [
      '## Release manifest',
      '- tag: v0.2.0',
      '- version: 0.2.0',
      '- distTag: latest',
      '',
      '| # | name | file | integrity |',
      '| --- | --- | --- | --- |',
      ...manifest.packages.map((p, i) => `| ${i + 1} | ${p.name} | ${p.file} | ${p.integrity} |`),
    ].join('\n');
    assert.equal(readFileSync(summaryFile, 'utf8').trimEnd(), expected);
    assert.equal(r.stdout.trimEnd(), expected);
  });
});

describe('ci.yml', () => {
  test('(5) every command of pnpm verify appears verbatim as a run of an unconditional job', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const verify = pkg.scripts['verify'];
    assert.ok(verify, 'package.json has no verify script');
    const commands = verify.split(' && ').map((c) => c.trim());
    assert.ok(commands.length > 1);

    const ci = loadWorkflow('ci.yml');
    const runs = new Set<string>();
    for (const job of Object.values(ci.jobs)) {
      if (job.if !== undefined || job['continue-on-error'] !== undefined) continue;
      for (const step of stepsOf(job)) {
        if (
          step.run !== undefined &&
          step.if === undefined &&
          step['continue-on-error'] === undefined
        ) {
          runs.add(step.run.trim());
        }
      }
    }
    const missing = commands.filter((c) => !runs.has(c));
    assert.deepEqual(missing, []);
  });
});

// --- release の script の構造 (spec Architecture) ---
// 検査は、ソースの文字列を受けて違反の一覧を返す純粋な関数で、現物が通ることと、
// 違反を 1 つ入れた文字列で落ちることの両方を確かめる。

const RELEASE_SOURCES = [
  'scripts/release.ts',
  'scripts/release-after-push.ts',
  'scripts/lib/release-after-push-check.ts',
  'scripts/lib/release-check.ts',
  'scripts/lib/release-types.ts',
] as const;

// spec の Architecture の許可の表。node:* はどこでも許可
const ALLOWED_IMPORTS: Readonly<Record<string, readonly string[]>> = {
  'scripts/release.ts': [
    'scripts/release-after-push.ts',
    'scripts/lib/release-after-push-check.ts',
    'scripts/lib/release-check.ts',
    'scripts/lib/release-types.ts',
  ],
  'scripts/release-after-push.ts': [
    'scripts/lib/release-after-push-check.ts',
    'scripts/lib/release-check.ts',
    'scripts/lib/release-types.ts',
  ],
  'scripts/lib/release-after-push-check.ts': [
    'scripts/lib/release-check.ts',
    'scripts/lib/release-types.ts',
  ],
  'scripts/lib/release-check.ts': ['scripts/lib/release-types.ts'],
  'scripts/lib/release-types.ts': [],
};

function readSource(file: string): string {
  return readFileSync(join(REPO_ROOT, file), 'utf8');
}

// 文字列リテラルの中の // (https://) は残し、行コメントとブロックコメントを除く
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

function importSpecifiers(source: string): string[] {
  const code = stripComments(source);
  const patterns = [
    /\b(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  return patterns.flatMap((pattern) =>
    [...code.matchAll(pattern)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]))
  );
}

function findImportViolations(file: string, source: string): string[] {
  const allowed = ALLOWED_IMPORTS[file] ?? [];
  const violations: string[] = [];
  for (const spec of importSpecifiers(source)) {
    if (spec.startsWith('node:')) continue;
    const resolved = spec.startsWith('.')
      ? posix.normalize(posix.join(posix.dirname(file), spec))
      : spec;
    if (!allowed.includes(resolved)) violations.push(`${file} imports ${spec} (${resolved})`);
  }
  return violations;
}

const OUTPUT_ESCAPES: readonly [string, RegExp][] = [
  ['console', /\bconsole\s*\./],
  ['process.stdout / process.stderr', /\bprocess\s*\.\s*(?:stdout|stderr)\b(?!\s*\.\s*isTTY\b)/],
  ['process["stdout"]', /\bprocess\s*\[\s*['"`](?:stdout|stderr)['"`]\s*\]/],
  ['new Console', /\bnew\s+Console\b/],
  ['.pipe(process.', /\.pipe\(\s*process\./],
  ['writeSync(1 / writeSync(2', /\bwriteSync\s*\(\s*[12]\b/],
  ['node:console', /['"](?:node:)?console['"]/],
  ['createInterface with output', /\bcreateInterface\s*\(\s*\{[^}]*\boutput\s*:/],
];

// release.ts の main() が createOutput に渡す書き込み関数 1 か所だけが、標準出力への出口
const OUTPUT_SINK = /createOutput\(\s*\((\w+)\)\s*=>\s*process\.stdout\.write\(\1\)\s*\)/g;

function findOutputEscapes(file: string, source: string, allowSink: boolean): string[] {
  let code = stripComments(source);
  const violations: string[] = [];
  if (allowSink) {
    const sinks = [...code.matchAll(OUTPUT_SINK)].length;
    if (sinks !== 1) violations.push(`${file} has ${sinks} createOutput sinks, expected exactly 1`);
    code = code.replace(OUTPUT_SINK, '');
  }
  for (const [label, pattern] of OUTPUT_ESCAPES) {
    if (pattern.test(code)) violations.push(`${file} uses ${label}`);
  }
  return violations;
}

const SPAWN_CALLEES = [
  'spawn',
  'spawnSync',
  'exec',
  'execFile',
  'execSync',
  'execFileSync',
  'fork',
];

interface SpawnRules {
  // 外部コマンドの実行を直接呼べるトップレベルの宣言
  literal: readonly string[];
  // 注入された async の spawn (spawnFn) を呼べるトップレベルの宣言
  spawnFn: readonly string[];
  // 注入された同期の spawn (sync) を呼べる、トップレベルの宣言と、その中の宣言
  sync: { top: string; nested: readonly string[] } | undefined;
  allowChildProcessImport: boolean;
}

const NO_SPAWN: SpawnRules = {
  literal: [],
  spawnFn: [],
  sync: undefined,
  allowChildProcessImport: false,
};

// release.ts の実際の構造: 直接の spawn は nodeSpawn (async) と nodeSpawnSync (同期) だけ。
// 実行は createRunner (spawnFn)、spawnChecked / git の dep / ghRelease (sync) を通る
const RELEASE_SPAWN_RULES: SpawnRules = {
  literal: ['nodeSpawn', 'nodeSpawnSync'],
  spawnFn: ['createRunner'],
  sync: { top: 'buildReleaseDeps', nested: ['spawnChecked', 'git', 'ghRelease'] },
  allowChildProcessImport: true,
};

function lastDeclaration(
  code: string,
  pattern: RegExp,
  before: number,
  after = -1
): string | undefined {
  let found: string | undefined;
  let foundAt = -1;
  for (const m of code.matchAll(pattern)) {
    if (m.index >= before) break;
    if (m.index > after) {
      found = m[1];
      foundAt = m.index;
    }
  }
  return foundAt >= 0 ? found : undefined;
}

function findSpawnViolations(file: string, source: string, rules: SpawnRules): string[] {
  const code = stripComments(source);
  const violations: string[] = [];
  if (!rules.allowChildProcessImport) {
    for (const spec of importSpecifiers(source)) {
      if (spec === 'node:child_process' || spec === 'child_process') {
        violations.push(`${file} imports ${spec}`);
      }
    }
  }
  const calleePattern = new RegExp(
    `(?<![.\\w])(${[...SPAWN_CALLEES, 'spawnFn', 'sync'].join('|')})\\s*\\(`,
    'g'
  );
  const topPattern = /^(?:export\s+)?(?:async\s+)?(?:function\s+|const\s+|let\s+|class\s+)(\w+)/gm;
  const nestedPattern = /^ {2}(?:async\s+)?(?:function\s+|const\s+)(\w+)/gm;
  for (const m of code.matchAll(calleePattern)) {
    const callee = m[1] ?? '';
    const top = lastDeclaration(code, topPattern, m.index);
    const topAt =
      top === undefined
        ? -1
        : code.search(
            new RegExp(
              `^(?:export\\s+)?(?:async\\s+)?(?:function\\s+|const\\s+|let\\s+|class\\s+)${top}\\b`,
              'm'
            )
          );
    const nested = lastDeclaration(code, nestedPattern, m.index, topAt);
    const where = `${top ?? '(top)'}${nested === undefined ? '' : `/${nested}`}`;
    let allowed: boolean;
    if (callee === 'spawnFn') allowed = top !== undefined && rules.spawnFn.includes(top);
    else if (callee === 'sync') {
      allowed =
        rules.sync !== undefined &&
        top === rules.sync.top &&
        nested !== undefined &&
        rules.sync.nested.includes(nested);
    } else allowed = top !== undefined && rules.literal.includes(top);
    if (!allowed) violations.push(`${file}: ${callee}( is called in ${where}`);
  }
  return violations;
}

// テストが本物の npm / gh を直接起動しない (changesets と git は K18 で許可)
function findDirectNpmGhSpawns(file: string, source: string): string[] {
  const code = stripComments(source);
  const pattern =
    /(?<![.\w])(?:spawn|spawnSync|execFile|execFileSync|exec|execSync)\s*\(\s*['"`](?:npm|gh)(?:['"`\s])/g;
  return [...code.matchAll(pattern)].map((m) => `${file}: ${m[0]}`);
}

describe('release scripts: module boundaries', () => {
  test('(6a) every import of the real files is in the allowed table', () => {
    for (const file of RELEASE_SOURCES) {
      assert.deepEqual(findImportViolations(file, readSource(file)), [], file);
    }
  });

  test('(6b) the import check catches static, type, re-export, dynamic and multi-line imports', () => {
    const file = 'scripts/release-after-push.ts';
    const bad = [
      "import { x } from './release.ts';",
      "import type { X } from './release.ts';",
      "export * from './release.ts';",
      "export { y } from '../release.ts';",
      "const m = await import('./release.ts');",
      "import './release.ts';",
      "import {\n  a,\n  b,\n} from './release.ts';",
      "import lodash from 'lodash';",
      "import { z } from './lib/test-workspace.ts';",
    ];
    for (const source of bad) {
      assert.equal(findImportViolations(file, source).length, 1, source);
    }
    const good = [
      "import { a } from './lib/release-after-push-check.ts';",
      "import type { B } from './lib/release-types.ts';",
      "import { createHash } from 'node:crypto';",
      "// import { c } from './release.ts';\nconst x = 1;",
    ];
    for (const source of good) assert.deepEqual(findImportViolations(file, source), [], source);
    assert.equal(
      findImportViolations(
        'scripts/lib/release-check.ts',
        "import { a } from './release-after-push-check.ts';"
      ).length,
      1
    );
    assert.deepEqual(
      findImportViolations('scripts/release.ts', "import { a } from './release-after-push.ts';"),
      []
    );
  });

  test('(7a) the real files write only through the one createOutput sink', () => {
    for (const file of RELEASE_SOURCES) {
      const violations = findOutputEscapes(file, readSource(file), file === 'scripts/release.ts');
      assert.deepEqual(violations, [], file);
    }
  });

  test('(7b) the output check catches each way out of the output function', () => {
    const file = 'scripts/release-after-push.ts';
    const bad = [
      "console.log('x');",
      "console . error('x');",
      "process.stdout.write('x');",
      "process.stderr.write('x');",
      "process['stdout'].write('x');",
      'const c = new Console(process.stdout);',
      'child.stdout.pipe(process.stdout);',
      "fs.writeSync(1, 'x');",
      "writeSync(2, 'x');",
      "import { log } from 'node:console';",
      'createInterface({ input, output: process.stdout });',
    ];
    for (const source of bad) {
      assert.ok(findOutputEscapes(file, source, false).length > 0, source);
    }
    const good = [
      'const tty = process.stdout.isTTY;',
      'const tty = process.stderr.isTTY;',
      '// console.log is not used here\nconst x = 1;',
      'createInterface({ input });',
      'const answer = process.stdin;',
    ];
    for (const source of good) assert.deepEqual(findOutputEscapes(file, source, false), [], source);
  });

  test('(7c) the createOutput sink is allowed in release.ts exactly once and nowhere else', () => {
    const sink = 'const output = createOutput((text) => process.stdout.write(text));\n';
    assert.deepEqual(findOutputEscapes('scripts/release.ts', sink, true), []);
    assert.equal(findOutputEscapes('scripts/release.ts', sink + sink, true).length, 1);
    assert.equal(findOutputEscapes('scripts/release.ts', 'const x = 1;', true).length, 1);
    assert.ok(findOutputEscapes('scripts/release-after-push.ts', sink, false).length > 0);
    const other =
      "createOutput((text) => process.stdout.write(text));\nprocess.stdout.write('x');\n";
    assert.ok(findOutputEscapes('scripts/release.ts', other, true).length > 0);
  });

  test('(8a) external commands are started only by the known call sites of release.ts', () => {
    for (const file of RELEASE_SOURCES) {
      const rules = file === 'scripts/release.ts' ? RELEASE_SPAWN_RULES : NO_SPAWN;
      assert.deepEqual(findSpawnViolations(file, readSource(file), rules), [], file);
    }
  });

  test('(8b) the spawn check catches a call outside the known sites', () => {
    const good = [
      'const nodeSpawn = (cmd) =>\n  spawn(cmd, []);\n',
      "export function createRunner(spawnFn) {\n  return () => spawnFn('npm', []);\n}\n",
      "export function buildReleaseDeps(o) {\n  const sync = o.sync;\n  const spawnChecked = () => {\n    const r = sync('x', []);\n  };\n}\n",
      'const found = PATTERN.exec(line);\n',
    ];
    for (const source of good) {
      assert.deepEqual(
        findSpawnViolations('scripts/release.ts', source, RELEASE_SPAWN_RULES),
        [],
        source
      );
    }
    const bad = [
      "export function sneaky() {\n  return spawnSync('npm', ['publish']);\n}\n",
      "export function sneaky() {\n  return execFileSync('gh', []);\n}\n",
      "export function runIt() {\n  return sync('npm', []);\n}\n",
      "export function buildReleaseDeps(o) {\n  const sync = o.sync;\n  const other = () => sync('x', []);\n}\n",
      "export function other(spawnFn) {\n  return spawnFn('npm', []);\n}\n",
    ];
    for (const source of bad) {
      assert.equal(
        findSpawnViolations('scripts/release.ts', source, RELEASE_SPAWN_RULES).length,
        1,
        source
      );
    }
    assert.equal(
      findSpawnViolations('scripts/release-after-push.ts', "spawn('x', []);", NO_SPAWN).length,
      1
    );
    assert.equal(
      findSpawnViolations(
        'scripts/release-after-push.ts',
        "import { spawn } from 'node:child_process';",
        NO_SPAWN
      ).length,
      1
    );
  });

  test('(9a) no test starts the real npm or gh directly', () => {
    const files = (readdirSync(join(REPO_ROOT, 'scripts'), { recursive: true }) as string[])
      .filter((f) => f.endsWith('.test.ts') && !f.includes('node_modules'))
      // この検査自身は、違反の例を文字列として持つ
      .filter((f) => f !== 'workflow-structure.test.ts');
    assert.ok(files.length >= 4, files.join(', '));
    for (const f of files) {
      const rel = `scripts/${f}`;
      assert.deepEqual(findDirectNpmGhSpawns(rel, readSource(rel)), [], rel);
    }
  });

  test('(9b) the npm / gh spawn check catches a direct start and lets git, tar and variables through', () => {
    const bad = [
      "spawnSync('npm', ['view', 'x']);",
      'execFile("gh", ["run", "list"]);',
      'spawn(`npm`, []);',
      "execSync('npm view x');",
      "exec('gh run list');",
    ];
    for (const source of bad)
      assert.equal(findDirectNpmGhSpawns('x.test.ts', source).length, 1, source);
    const good = [
      "spawnSync('git', ['status']);",
      "spawnSync('tar', ['-tzf', f]);",
      'return spawnSync(cmd, args, options);',
      "const r = run('npm', ['view']);",
      "assert.equal(cmd, 'npm');",
    ];
    for (const source of good)
      assert.deepEqual(findDirectNpmGhSpawns('x.test.ts', source), [], source);
  });
});

describe('release scripts: constants shared with release.yml and gh', () => {
  test('(10a) RELEASE_JOB_NAMES, the manifest step and the workflow name match release.yml', () => {
    const wf = parse(readFileSync(join(WORKFLOWS_DIR, 'release.yml'), 'utf8')) as Workflow & {
      name?: string;
      jobs: Record<string, Job & { name?: string }>;
    };
    assert.equal(wf.name, 'Release');
    assert.equal(wf.jobs['validate']?.name, RELEASE_JOB_NAMES.validate);
    assert.equal(wf.jobs['npm-stage']?.name, RELEASE_JOB_NAMES.npmStage);
    assert.equal(wf.jobs['github-release']?.name, RELEASE_JOB_NAMES.githubRelease);
    const summarySteps = stepsOf(wf.jobs['validate']).filter(
      (s) => s.name === 'Print the release manifest'
    );
    assert.equal(summarySteps.length, 1);
    for (const file of [
      'scripts/lib/release-after-push-check.ts',
      'scripts/release-after-push.ts',
    ]) {
      assert.ok(readSource(file).includes('Print the release manifest'), file);
    }
  });

  test('(10b) the gh --json fields are within what gh 2.45.0 accepts', () => {
    assert.equal(isSubsetOfAllowlist(GH_RUN_LIST_FIELDS, GH_245_LIST_ALLOWED), true);
    assert.equal(isSubsetOfAllowlist(GH_RUN_VIEW_FIELDS, GH_245_VIEW_ALLOWED), true);
    assert.equal(
      isSubsetOfAllowlist([...GH_RUN_LIST_FIELDS, 'attempt'], GH_245_LIST_ALLOWED),
      false
    );
    assert.equal(
      isSubsetOfAllowlist([...GH_RUN_VIEW_FIELDS, 'attempt'], GH_245_VIEW_ALLOWED),
      false
    );
  });
});

// --- releasing.md の構造 (plan-5 T4) ---
// 検査関数は文字列を受けて違反を返す。現物が通ることと、違反を入れた文字列で落ちることの両方を確かめる。
// 手作業の節には `## Release manifest` を含むコードブロックがあるので、見出しの走査はコードフェンスの中を読み飛ばす。

interface MarkdownHeading {
  level: number;
  text: string;
  // text 内の行番号 (0 始まり)
  line: number;
}

function markdownHeadings(text: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  let inFence = false;
  text.split('\n').forEach((line, index) => {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const match = /^(#{1,6}) (.*)$/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      headings.push({ level: match[1].length, text: line, line: index });
    }
  });
  return headings;
}

// `## ` の見出しが prefix で始まる節の本文 (次の `## ` の見出しの手前まで)。なければ undefined
function markdownSection(text: string, prefix: string): string | undefined {
  const headings = markdownHeadings(text).filter((h) => h.level === 2);
  const index = headings.findIndex((h) => h.text.startsWith(prefix));
  const start = headings[index];
  if (start === undefined) return undefined;
  const end = headings[index + 1]?.line;
  return text.split('\n').slice(start.line, end).join('\n');
}

function markdownCodeBlocks(body: string): string[] {
  const blocks: string[] = [];
  let current: string[] | undefined;
  for (const line of body.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      if (current === undefined) current = [];
      else {
        blocks.push(current.join('\n'));
        current = undefined;
      }
    } else if (current !== undefined) current.push(line);
  }
  return blocks;
}

const MANUAL_SECTION = '## 手作業の手順';
const FIRST_RELEASE_SECTION = '## 最初のリリース (0.2.0) で確かめること';
const PRERELEASE_SECTION = '## prerelease';
const MANUAL_COMMANDS = [
  'npm stage list',
  'npm stage view',
  'npm stage download',
  'npm stage approve',
  'npm view',
];

// classifyStop が出す見出しの接頭辞 (RELEASING_SECTIONS) が、releasing.md に実在する
function findMissingReleasingSections(text: string): string[] {
  const headings = markdownHeadings(text).filter((h) => h.level === 2 || h.level === 3);
  return Object.entries(RELEASING_SECTIONS)
    .filter(([, prefix]) => !headings.some((h) => h.text.startsWith(prefix)))
    .map(([route, prefix]) => `route ${route}: no heading starts with ${JSON.stringify(prefix)}`);
}

function findManualStepViolations(text: string): string[] {
  const body = markdownSection(text, MANUAL_SECTION);
  if (body === undefined) return [`no section ${MANUAL_SECTION}`];
  const code = markdownCodeBlocks(body).join('\n');
  return MANUAL_COMMANDS.filter((command) => !code.includes(command)).map(
    (command) => `${MANUAL_SECTION}: no code block has ${command}`
  );
}

function findFirstReleaseViolations(text: string): string[] {
  const body = markdownSection(text, FIRST_RELEASE_SECTION);
  if (body === undefined) return [`no section ${FIRST_RELEASE_SECTION}`];
  return ['段 10', '`N`', '.tmp/release/']
    .filter((needle) => !body.includes(needle))
    .map((needle) => `${FIRST_RELEASE_SECTION}: no ${needle}`);
}

function findPrereleaseViolations(text: string): string[] {
  const violations: string[] = [];
  const body = markdownSection(text, PRERELEASE_SECTION);
  if (body === undefined) violations.push(`no section ${PRERELEASE_SECTION}`);
  else {
    for (const needle of ['--pre beta', '--exit-pre']) {
      if (!body.includes(needle)) violations.push(`${PRERELEASE_SECTION}: no ${needle}`);
    }
  }
  if (/検証していないので.{0,10}書かない/.test(text)) {
    violations.push('releasing.md still says the prerelease steps are not verified');
  }
  return violations;
}

describe('releasing.md structure', () => {
  const releasing = readSource('docs/releasing.md');

  test('(11a) every RELEASING_SECTIONS prefix starts a ## or ### heading', () => {
    assert.deepEqual(findMissingReleasingSections(releasing), []);
    const renamed = releasing.replace('### F2:', '### F2 ');
    assert.deepEqual(findMissingReleasingSections(renamed), [
      'route F2: no heading starts with "### F2:"',
    ]);
    assert.equal(findMissingReleasingSections('## 止まったとき\n').length, 5);
  });

  test('(11a) a heading-looking line inside a code fence is not a heading', () => {
    const fenced = ['## 止まったとき', '', '```', '### F1: in a fence', '```', ''].join('\n');
    assert.ok(findMissingReleasingSections(fenced).some((v) => v.startsWith('route F1')));
  });

  test('(11b) the manual steps section keeps the npm commands in code blocks', () => {
    assert.deepEqual(findManualStepViolations(releasing), []);
    const misspelled = releasing.replaceAll('npm stage approve', 'npm stage aprove');
    assert.deepEqual(findManualStepViolations(misspelled), [
      `${MANUAL_SECTION}: no code block has npm stage approve`,
    ]);
    assert.deepEqual(findManualStepViolations('## 毎回のリリース\n'), [
      `no section ${MANUAL_SECTION}`,
    ]);
  });

  test('(11b) commands written only in prose do not count, and a ## line in a fence does not end the section', () => {
    const proseOnly = [MANUAL_SECTION, '', MANUAL_COMMANDS.join(' / '), '', '## 次の節', ''].join(
      '\n'
    );
    assert.equal(findManualStepViolations(proseOnly).length, MANUAL_COMMANDS.length);
    const afterFencedHeading = [
      MANUAL_SECTION,
      '',
      '```',
      '## Release manifest',
      '```',
      '',
      '```bash',
      ...MANUAL_COMMANDS,
      '```',
      '',
      '## 次の節',
      '',
    ].join('\n');
    assert.deepEqual(findManualStepViolations(afterFencedHeading), []);
    const afterNextSection = [
      MANUAL_SECTION,
      '',
      '## 次の節',
      '',
      '```',
      ...MANUAL_COMMANDS,
      '```',
    ];
    assert.equal(
      findManualStepViolations(afterNextSection.join('\n')).length,
      MANUAL_COMMANDS.length
    );
  });

  test('(11c) the first release section names stage 10, the N answer and the saved files', () => {
    assert.deepEqual(findFirstReleaseViolations(releasing), []);
    assert.deepEqual(findFirstReleaseViolations(releasing.replaceAll('段 10', '段 9')), [
      `${FIRST_RELEASE_SECTION}: no 段 10`,
    ]);
    assert.deepEqual(findFirstReleaseViolations(releasing.replaceAll('`N`', 'N')), [
      `${FIRST_RELEASE_SECTION}: no \`N\``,
    ]);
    assert.deepEqual(
      findFirstReleaseViolations(releasing.replaceAll('.tmp/release/', '.tmp/rel/')),
      [`${FIRST_RELEASE_SECTION}: no .tmp/release/`]
    );
  });

  test('(11d) the prerelease section shows --pre beta and --exit-pre, and no "not verified" sentence remains', () => {
    assert.deepEqual(findPrereleaseViolations(releasing), []);
    assert.deepEqual(findPrereleaseViolations(releasing.replaceAll('--exit-pre', '--exit')), [
      `${PRERELEASE_SECTION}: no --exit-pre`,
    ]);
    assert.deepEqual(findPrereleaseViolations(releasing.replaceAll('--pre beta', '--pre b')), [
      `${PRERELEASE_SECTION}: no --pre beta`,
    ]);
    for (const sentence of [
      'prerelease の手順は検証していないので書かない。',
      'prerelease の版を作る手順は検証していないので、この文書には書かない。',
    ]) {
      assert.deepEqual(findPrereleaseViolations(`${releasing}\n${sentence}\n`), [
        'releasing.md still says the prerelease steps are not verified',
      ]);
    }
  });
});
