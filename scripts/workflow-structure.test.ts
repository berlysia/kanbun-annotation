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
import { basename, dirname, join } from 'node:path';
import { parse } from 'yaml';
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
