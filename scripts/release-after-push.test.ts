// 後半 (段 8〜11) のテスト。gh / npm は偽の run が返す (実物の fixture と合成)。
// 実際の npm / gh は呼ばない。ファイルは仮想の dir で持ち、実 fs には触れない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { EVIDENCE_FILES, WAIT, pollUntil, runAfterPush } from './release-after-push.ts';
import type { AfterPushDeps, AfterPushInput } from './release-after-push.ts';
import { createOutput, reportOutcome } from './release.ts';
import { sha512Integrity } from './lib/release-after-push-check.ts';
import type {
  AfterPushResult,
  ClassifiedStop,
  CommandResult,
  Outcome,
  TrustResult,
} from './lib/release-types.ts';

const FIXTURES = new URL('./lib/fixtures/', import.meta.url);
const fixture = (name: string): string => readFileSync(new URL(name, FIXTURES), 'utf8');
// 0.2.0 の失敗した 2 回の run の `gh run view --log-failed` の実物 (research.md)
const LOG_VERBOSE = fixture('job-log-39198354458.txt');
const LOG_PLAIN = fixture('job-log-39196389682.txt');

// --- fixture ---

const VERSION = '0.2.0';
const TAG = 'v0.2.0';
const COMMIT = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const RUN_ID = 38719023343;
const VALIDATE_JOB_ID = 116368686557;
const NPM_STAGE_JOB_ID = 116368686558;
const NAMES = [
  '@kanbun-skam/skam',
  '@kanbun-skam/skam-xml-parser',
  '@kanbun-skam/skam-xml-stringify',
  '@kanbun-skam/skam-html-renderer',
  '@kanbun-skam/skam-canvas-renderer',
  '@kanbun-skam/skam-web-component',
];
const MIB = 1024 * 1024;

const uuid = (i: number): string => `0b6f6a52-8c5f-4b6e-9d37-3f1c2a1e9a1${i}`;
const fileOf = (name: string): string =>
  `${name.replace('@', '').replace('/', '-')}-${VERSION}.tgz`;
const shortOf = (name: string): string => name.replace('@kanbun-skam/', '');

// tar (pnpm pack と同じ書式の ustar) を最小限で組み立てる
function tarHeader(name: string, size: number): Buffer {
  const h = Buffer.alloc(512);
  const put = (s: string, at: number): void => {
    h.write(s, at, 'latin1');
  };
  h.write(name, 0, 'utf8');
  put('000644 \0', 100);
  put('000000 \0', 108);
  put('000000 \0', 116);
  put(`${size.toString(8).padStart(11, '0')} `, 124);
  put('03560116604 ', 136);
  put('0', 156);
  put('ustar\0', 257);
  put('00', 263);
  put('000000 \0', 329);
  put('000000 \0', 337);
  h.fill(0x20, 148, 156);
  let sum = 0;
  for (const b of h) sum += b;
  put(`${sum.toString(8).padStart(6, '0')} \0`, 148);
  return h;
}

function goodTgz(name: string): Buffer {
  const files: [string, string][] = [
    [
      'package/package.json',
      JSON.stringify({ name, version: VERSION, dependencies: { '@kanbun-skam/skam': VERSION } }),
    ],
    ['package/README.md', '# readme\n'],
    ['package/LICENSE', 'MIT\n'],
    ['package/CHANGELOG.md', '## 0.2.0\n'],
    ['package/dist/index.js', 'export {};\n'],
  ];
  const parts: Buffer[] = [];
  for (const [path, content] of files) {
    const data = Buffer.from(content);
    parts.push(tarHeader(path, data.length));
    parts.push(
      Buffer.concat([data, Buffer.alloc(Math.ceil(data.length / 512) * 512 - data.length)])
    );
  }
  parts.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(parts));
}

const TARBALLS = new Map(NAMES.map((n) => [n, goodTgz(n)]));
const INTEGRITY = new Map(
  NAMES.map((n) => [n, sha512Integrity(TARBALLS.get(n) ?? Buffer.alloc(0))])
);
const integrityOf = (name: string): string => INTEGRITY.get(name) ?? '';

const TS = '2026-10-15T10:15:59.9299767Z';
function logLine(content: string): string {
  return `Validate and pack\tPrint the release manifest\t${TS} ${content}`;
}
function buildLog(): string {
  const contents = [
    '## Release manifest',
    `- tag: ${TAG}`,
    `- version: ${VERSION}`,
    '- distTag: latest',
    '',
    '| # | name | file | integrity |',
    '| --- | --- | --- | --- |',
    ...NAMES.map((n, i) => `| ${i + 1} | ${n} | ${fileOf(n)} | ${integrityOf(n)} |`),
  ];
  return `${[
    'Validate and pack\tSet up job\tCurrent runner version',
    ...contents.map(logLine),
    'Validate and pack\tPost Checkout\tPost job cleanup.',
  ].join('\n')}\n`;
}

// --- 偽の世界 ---

type ArtifactMode = 'ok' | 'fail' | 'symlink' | 'subdir' | 'extra' | 'other-integrity';
type TarMode = 'ok' | 'none' | 'two' | 'wrong' | 'read-throws';

interface FsEntry {
  kind: 'file' | 'dir' | 'symlink' | 'other';
  data: Buffer;
  // 一覧に出す size と、読むときの実際の size が食い違う場合 (読み込み時の上限超過の再現)
  readSize?: number;
}

interface ApproveReply {
  status: number | null;
  stderr: string;
}

interface Options {
  published?: number;
  runListEmptyCalls?: number;
  runStatus?: 'completed' | 'in_progress';
  conclusions?: [string, string, string];
  logFailCalls?: number;
  attempts?: number[];
  releaseAt?: number;
  artifact?: ArtifactMode;
  tar?: Partial<Record<string, TarMode>>;
  twoStaged?: string;
  publishedIntegrity?: Record<string, string>;
  viewLag?: Record<string, number>;
  approve?: (name: string, nth: number, total: number, world: World) => ApproveReply | undefined;
  confirm?: boolean;
  trust?: TrustResult;
  interruptOnWatch?: boolean;
  npmViewFails?: boolean;
  checkOnly?: boolean;
  noStaged?: boolean;
  postViewIntegrity?: Record<string, string>;
  stageTarReadLimit?: boolean;
  // `gh run view --log-failed` の n 回目 (1 から) の結果。未指定なら 0.2.0 の実物の log
  failedLog?: (call: number, world: World) => CommandResult;
  // npm-stage の job の databaseId。'omit' なら欄ごと無い
  npmStageId?: unknown;
  runListFails?: CommandResult;
}

interface Call {
  cmd: string;
  args: string[];
  stdio: string;
  cwd: string | undefined;
}

interface World {
  deps: AfterPushDeps;
  input: AfterPushInput;
  published: Set<string>;
  staged: Map<string, string>;
  calls: Call[];
  events: string[];
  lines: string[];
  sleeps: number[];
  temps: string[];
  removed: string[];
  evidence: { name: string; content: string }[];
  confirmQuestions: string[];
  fs: Map<string, Map<string, FsEntry>>;
  interrupted: boolean;
  releaseViews: number;
  onConfirm: () => void;
  count: (cmd: string, ...prefix: string[]) => number;
}

const OK = (stdout: string): CommandResult => ({ status: 0, stdout, stderr: '' });
const E404: CommandResult = {
  status: 1,
  stdout: JSON.stringify({ error: { code: 'E404', summary: 'not found' } }),
  stderr: '',
};

function makeWorld(options: Options = {}): World {
  const published = new Set(NAMES.slice(0, options.published ?? 0));
  const staged = new Map<string, string>();
  NAMES.forEach((n, i) => {
    if (!published.has(n) && options.noStaged !== true) staged.set(n, uuid(i));
  });
  const idToName = (id: string): string | undefined =>
    NAMES.find((n, i) => uuid(i) === id && n !== undefined);
  let clock = 1_000_000;
  let tempCount = 0;
  let runListCalls = 0;
  let logCalls = 0;
  let failedLogCalls = 0;
  let attemptCalls = 0;
  let approveTotal = 0;
  let confirmed = false;
  const versionViews: Record<string, number> = {};
  const approveCounts: Record<string, number> = {};
  const w: World = {
    deps: undefined as unknown as AfterPushDeps,
    input: {
      tag: TAG,
      tagCommit: COMMIT,
      version: VERSION,
      names: NAMES,
      checkOnly: options.checkOnly === true,
    },
    published,
    staged,
    calls: [],
    events: [],
    lines: [],
    sleeps: [],
    temps: [],
    removed: [],
    evidence: [],
    confirmQuestions: [],
    fs: new Map(),
    interrupted: false,
    releaseViews: 0,
    onConfirm: () => {},
    count: (cmd, ...prefix) =>
      w.calls.filter((c) => c.cmd === cmd && prefix.every((p, i) => c.args[i] === p)).length,
  };
  let runStatus = options.runStatus ?? 'completed';

  const viewJson = (): string => {
    const [v, n, g] = options.conclusions ?? ['success', 'success', 'success'];
    const job = (name: string, conclusion: string, id: number): object => ({
      name,
      status: 'completed',
      conclusion,
      databaseId: id,
    });
    return JSON.stringify({
      status: runStatus,
      conclusion: runStatus === 'completed' ? 'success' : null,
      jobs: [
        job('Validate and pack', v, VALIDATE_JOB_ID),
        ...(options.npmStageId === 'omit'
          ? [{ name: 'Stage on npm', status: 'completed', conclusion: n }]
          : [
              job(
                'Stage on npm',
                n,
                (options.npmStageId as number | undefined) ?? NPM_STAGE_JOB_ID
              ),
            ]),
        job('GitHub Release', g, 116368686559),
      ],
    });
  };

  const stageList = (name: string): string => {
    const id = staged.get(name);
    if (id === undefined) return '[]';
    const item = { id, packageName: name, version: VERSION, tag: 'latest' };
    const second = { ...item, id: uuid(9) };
    return JSON.stringify(options.twoStaged === name ? [item, second] : [item]);
  };

  const writeArtifact = (dir: string): void => {
    const entries = new Map<string, FsEntry>();
    const integrities = new Map(NAMES.map((n) => [n, integrityOf(n)]));
    const bytes = new Map(NAMES.map((n) => [n, TARBALLS.get(n) ?? Buffer.alloc(0)]));
    if (options.artifact === 'other-integrity') {
      const name = NAMES[1] ?? '';
      const changed = Buffer.concat([bytes.get(name) ?? Buffer.alloc(0), Buffer.from('x')]);
      bytes.set(name, changed);
      integrities.set(name, sha512Integrity(changed));
    }
    const manifest = {
      schemaVersion: 1,
      tag: TAG,
      version: VERSION,
      distTag: 'latest',
      packages: NAMES.map((n) => ({ name: n, file: fileOf(n), integrity: integrities.get(n) })),
    };
    entries.set('manifest.json', { kind: 'file', data: Buffer.from(JSON.stringify(manifest)) });
    for (const n of NAMES) {
      entries.set(fileOf(n), { kind: 'file', data: bytes.get(n) ?? Buffer.alloc(0) });
    }
    if (options.artifact === 'symlink') {
      entries.set(fileOf(NAMES[2] ?? ''), { kind: 'symlink', data: Buffer.alloc(0) });
    }
    if (options.artifact === 'subdir') entries.set('sub', { kind: 'dir', data: Buffer.alloc(0) });
    if (options.artifact === 'extra')
      entries.set('evil.sh', { kind: 'file', data: Buffer.from('x') });
    w.fs.set(dir, entries);
  };

  const writeStageTarball = (cwd: string, name: string): void => {
    const mode = options.tar?.[name] ?? 'ok';
    const entries = new Map<string, FsEntry>();
    const good = TARBALLS.get(name) ?? Buffer.alloc(0);
    const file = fileOf(name);
    if (mode === 'ok' || mode === 'read-throws') {
      entries.set(file, {
        kind: 'file',
        data: good,
        ...(mode === 'read-throws' ? { readSize: 10 * MIB + 1 } : {}),
      });
    }
    if (mode === 'two') {
      entries.set(file, { kind: 'file', data: good });
      entries.set(`other-${file}`, { kind: 'file', data: good });
    }
    if (mode === 'wrong')
      entries.set(file, { kind: 'file', data: Buffer.concat([good, Buffer.from('y')]) });
    w.fs.set(cwd, entries);
  };

  const ghRun = (args: string[]): CommandResult => {
    const b = args[1];
    if (b === 'list') {
      runListCalls += 1;
      if (options.runListFails !== undefined) return options.runListFails;
      const hidden = runListCalls <= (options.runListEmptyCalls ?? 0);
      return OK(
        JSON.stringify(
          hidden
            ? []
            : [
                {
                  databaseId: RUN_ID,
                  headSha: COMMIT,
                  headBranch: 'v0.2.0',
                  status: runStatus,
                  conclusion: null,
                  workflowName: 'Release',
                },
              ]
        )
      );
    }
    if (b === 'view' && args.includes('--log-failed')) {
      failedLogCalls += 1;
      return (
        options.failedLog?.(failedLogCalls, w) ??
        OK(options.conclusions?.[0] === 'failure' ? LOG_PLAIN : LOG_VERBOSE)
      );
    }
    if (b === 'view' && args.includes('--log')) {
      logCalls += 1;
      if (logCalls <= (options.logFailCalls ?? 0)) {
        return { status: 1, stdout: '', stderr: 'log not available' };
      }
      return OK(buildLog());
    }
    if (b === 'view') return OK(viewJson());
    if (b === 'watch') {
      if (options.interruptOnWatch === true) {
        w.interrupted = true;
        return { status: 1, stdout: '', stderr: '' };
      }
      runStatus = 'completed';
      return { status: 0, stdout: '', stderr: '' };
    }
    if (b === 'download') {
      if (options.artifact === 'fail') return { status: 1, stdout: '', stderr: 'no artifact' };
      writeArtifact(args[args.indexOf('-D') + 1] ?? '');
      return OK('');
    }
    throw new Error(`unexpected gh run call: ${args.join(' ')}`);
  };

  const gh = (args: string[]): CommandResult => {
    const [a, b] = args;
    if (a === 'run') return ghRun(args);
    if (a === 'api') {
      const list = options.attempts ?? [1];
      const n = list[Math.min(attemptCalls, list.length - 1)] ?? 1;
      attemptCalls += 1;
      return OK(JSON.stringify({ id: RUN_ID, run_attempt: n }));
    }
    if (a === 'release' && b === 'view') {
      w.releaseViews += 1;
      return w.releaseViews > (options.releaseAt ?? 0)
        ? OK('title: v0.2.0\n')
        : { status: 1, stdout: '', stderr: 'release not found' };
    }
    throw new Error(`unexpected gh call: ${args.join(' ')}`);
  };

  const distView = (name: string): CommandResult => {
    if (!published.has(name)) return E404;
    const integrity =
      options.postViewIntegrity?.[name] ?? options.publishedIntegrity?.[name] ?? integrityOf(name);
    return OK(JSON.stringify([{ 'dist-tags': { latest: VERSION }, 'dist.integrity': integrity }]));
  };

  const approve = (id: string): CommandResult => {
    const name = idToName(id);
    if (name === undefined) throw new Error(`approve of an unknown id ${id}`);
    approveTotal += 1;
    approveCounts[name] = (approveCounts[name] ?? 0) + 1;
    w.events.push(`approve:${shortOf(name)}`);
    const custom = options.approve?.(name, approveCounts[name] ?? 0, approveTotal, w);
    if (custom !== undefined) return { status: custom.status, stdout: '', stderr: custom.stderr };
    published.add(name);
    staged.delete(name);
    return { status: 0, stdout: '', stderr: '' };
  };

  const npmView = (args: string[]): CommandResult => {
    if (options.npmViewFails === true) return { status: 1, stdout: '', stderr: 'network down' };
    if (args[2] !== 'versions') return distView((args[1] ?? '').replace(`@${VERSION}`, ''));
    const name = args[1] ?? '';
    versionViews[name] = (versionViews[name] ?? 0) + 1;
    const visible =
      published.has(name) && (versionViews[name] ?? 0) > (options.viewLag?.[name] ?? 0);
    return visible ? OK(JSON.stringify(['0.1.0', VERSION])) : E404;
  };

  const npmStage = (args: string[], cwd: string | undefined): CommandResult => {
    if (args[1] === 'list') return OK(stageList(args[2] ?? ''));
    if (args[1] === 'approve') return approve(args[2] ?? '');
    const name = idToName(args[2] ?? '');
    if (args[1] !== 'download' || name === undefined || cwd === undefined) {
      throw new Error(`unexpected npm stage call: ${args.join(' ')}`);
    }
    writeStageTarball(cwd, name);
    return OK('');
  };

  const npm = (args: string[], cwd: string | undefined): CommandResult => {
    if (args[0] === 'view') return npmView(args);
    if (args[0] === 'stage') return npmStage(args, cwd);
    throw new Error(`unexpected npm call: ${args.join(' ')}`);
  };

  const deps: AfterPushDeps = {
    run: async (cmd, args, runOptions) => {
      w.calls.push({ cmd, args: [...args], stdio: runOptions.stdio, cwd: runOptions.cwd });
      if (cmd === 'gh') return gh([...args]);
      if (cmd === 'npm') return npm([...args], runOptions.cwd);
      throw new Error(`unexpected command: ${cmd}`);
    },
    output: {
      emit: (line) => {
        w.lines.push(line);
      },
      emitChunk: (text) => {
        w.lines.push(text);
      },
    },
    sleep: async (ms) => {
      w.sleeps.push(ms);
      clock += ms;
    },
    now: () => clock,
    interrupted: () => w.interrupted,
    confirm: async (question) => {
      w.events.push('confirm');
      w.confirmQuestions.push(question);
      confirmed = true;
      w.onConfirm();
      return options.confirm ?? true;
    },
    verifyTrust: async () => {
      w.events.push('trust');
      void confirmed;
      return options.trust ?? { kind: 'ok' };
    },
    mkTemp: () => {
      tempCount += 1;
      const path = `/tmp/kanbun-release-${tempCount}`;
      w.temps.push(path);
      w.fs.set(path, new Map());
      return path;
    },
    removeTemp: (path) => {
      w.removed.push(path);
      w.fs.delete(path);
    },
    listDir: (path) => {
      const dir = w.fs.get(path);
      if (dir === undefined) throw new Error(`no such dir ${path}`);
      return [...dir].map(([name, e]) => ({ name, kind: e.kind, size: e.data.length }));
    },
    readFile: (path, maxBytes) => {
      const slash = path.lastIndexOf('/');
      const entry = w.fs.get(path.slice(0, slash))?.get(path.slice(slash + 1));
      if (entry === undefined) throw new Error(`no such file ${path}`);
      if ((entry.readSize ?? entry.data.length) > maxBytes) throw new Error('file is too large');
      return entry.data;
    },
    saveEvidence: (name, content) => {
      w.evidence.push({ name, content });
      return '/repo/.tmp/release/v0.2.0/2026-10-15T00-00-00-000Z';
    },
  };
  w.deps = deps;
  return w;
}

async function go(world: World): Promise<AfterPushResult> {
  return runAfterPush(world.input, world.deps);
}

function stopOf(result: AfterPushResult): ClassifiedStop {
  assert.equal(result.kind, 'stopped', JSON.stringify(result));
  if (result.kind !== 'stopped') throw new Error('unreachable');
  return result.stop;
}

// reportOutcome が出す行 (実際の出口の無害化を通す)
function render(result: AfterPushResult): string[] {
  const written: string[] = [];
  const output = createOutput((text) => written.push(text));
  const outcome: Outcome =
    result.kind === 'stopped' ? { kind: 'after-push-stopped', stop: result.stop } : result;
  reportOutcome(outcome, output);
  return written.join('').split('\n');
}

const SECTION_HEADINGS = ['error:', 'possible causes:', 'try:'];

function approveIds(world: World): string[] {
  return world.calls
    .filter((c) => c.cmd === 'npm' && c.args[0] === 'stage' && c.args[1] === 'approve')
    .map((c) => c.args[2] ?? '');
}

function assertTempsRemoved(world: World): void {
  assert.deepEqual([...world.removed].sort(), [...world.temps].sort());
}

// --- pollUntil ---

function clockOf(): {
  clock: Pick<AfterPushDeps, 'sleep' | 'now' | 'interrupted'>;
  sleeps: number[];
} {
  let t = 0;
  const sleeps: number[] = [];
  return {
    sleeps,
    clock: {
      sleep: async (ms) => {
        sleeps.push(ms);
        t += ms;
      },
      now: () => t,
      interrupted: () => false,
    },
  };
}

test('pollUntil: 時間の予算は now() と sleep() だけで測り、使い切ったら exhausted', async () => {
  const { clock, sleeps } = clockOf();
  let probes = 0;
  const r = await pollUntil(clock, {
    label: 'x',
    onWait: () => {},
    intervalMs: 10,
    budget: { ms: 30 },
    probe: async () => {
      probes += 1;
      return { done: false };
    },
  });
  assert.equal(r.kind, 'exhausted');
  assert.equal(probes, 4);
  assert.deepEqual(sleeps, [10, 10, 10]);
});

test('pollUntil: 回数の予算は probe の総数で、sleep はその間だけ', async () => {
  const { clock, sleeps } = clockOf();
  let probes = 0;
  const r = await pollUntil(clock, {
    label: 'x',
    onWait: () => {},
    intervalMs: 5,
    budget: { attempts: 3 },
    probe: async () => {
      probes += 1;
      return { done: false };
    },
  });
  assert.equal(r.kind, 'exhausted');
  assert.equal(probes, 3);
  assert.deepEqual(sleeps, [5, 5]);
});

test('pollUntil: delayFirst は probe の前に sleep する', async () => {
  const { clock, sleeps } = clockOf();
  const r = await pollUntil(clock, {
    label: 'x',
    onWait: () => {},
    intervalMs: 5,
    budget: { attempts: 2 },
    delayFirst: true,
    probe: async () => ({ done: false }),
  });
  assert.equal(r.kind, 'exhausted');
  assert.deepEqual(sleeps, [5, 5]);
});

test('pollUntil: done の値を返す', async () => {
  const { clock } = clockOf();
  let n = 0;
  const r = await pollUntil(clock, {
    label: 'x',
    onWait: () => {},
    intervalMs: 1,
    budget: { attempts: 5 },
    probe: async () => {
      n += 1;
      return n === 2 ? { done: true, value: 'v' } : { done: false };
    },
  });
  assert.deepEqual(r, { kind: 'done', value: 'v' });
});

test('pollUntil: 毎回 interrupted() を先に見る (probe の前、probe の後)', async () => {
  const { clock } = clockOf();
  let flag = true;
  let probes = 0;
  const before = await pollUntil(
    { ...clock, interrupted: () => flag },
    {
      label: 'x',
      onWait: () => {},
      intervalMs: 1,
      budget: { attempts: 5 },
      probe: async () => {
        probes += 1;
        return { done: true, value: 1 };
      },
    }
  );
  assert.equal(before.kind, 'interrupted');
  assert.equal(probes, 0);
  flag = false;
  const after = await pollUntil(
    { ...clock, interrupted: () => probes > 0 },
    {
      label: 'x',
      onWait: () => {},
      intervalMs: 1,
      budget: { attempts: 5 },
      probe: async () => {
        probes += 1;
        return { done: false };
      },
    }
  );
  assert.equal(after.kind, 'interrupted');
  assert.equal(probes, 1);
});

function waitLines(
  run: (
    clock: ReturnType<typeof clockOf>['clock'],
    onWait: (line: string) => void
  ) => Promise<{ kind: string }>
): Promise<{ kind: string; lines: string[] }> {
  const { clock } = clockOf();
  const lines: string[] = [];
  return run(clock, (line) => lines.push(line)).then((r) => ({ kind: r.kind, lines }));
}

test('pollUntil: 待機の行は sleep の直前に毎回出し、経過は sleep が終わる時点 (時間の予算)', async () => {
  let probes = 0;
  const r = await waitLines((clock, onWait) =>
    pollUntil(clock, {
      label: 'the thing',
      onWait,
      intervalMs: 10_000,
      budget: { ms: 180_000 },
      probe: async () => {
        probes += 1;
        return probes === 3 ? { done: true, value: 1 } : { done: false };
      },
    })
  );
  assert.equal(r.kind, 'done');
  assert.deepEqual(r.lines, [
    '  waiting for the thing: 10s / 180s',
    '  waiting for the thing: 20s / 180s',
  ]);
});

test('pollUntil: 回数の予算の行は終えた probe の回数を出し、使い切ったら足さない', async () => {
  const r = await waitLines((clock, onWait) =>
    pollUntil(clock, {
      label: 'x',
      onWait,
      intervalMs: 30_000,
      budget: { attempts: 3 },
      probe: async () => ({ done: false }),
    })
  );
  assert.equal(r.kind, 'exhausted');
  assert.deepEqual(r.lines, [
    '  waiting for x: 30s / attempt 1/3',
    '  waiting for x: 60s / attempt 2/3',
  ]);
});

test('pollUntil: delayFirst の最初の待機も出す (時間の予算)', async () => {
  const r = await waitLines((clock, onWait) =>
    pollUntil(clock, {
      label: 'x',
      onWait,
      intervalMs: 30_000,
      budget: { ms: 300_000 },
      delayFirst: true,
      probe: async () => ({ done: true, value: 1 }),
    })
  );
  assert.deepEqual(r.lines, ['  waiting for x: 30s / 300s']);
});

test('pollUntil: delayFirst の最初の待機は attempt 0 (回数の予算)', async () => {
  const r = await waitLines((clock, onWait) =>
    pollUntil(clock, {
      label: 'x',
      onWait,
      intervalMs: 30_000,
      budget: { attempts: 20 },
      delayFirst: true,
      probe: async () => ({ done: true, value: 1 }),
    })
  );
  assert.deepEqual(r.lines, ['  waiting for x: 30s / attempt 0/20']);
});

test('pollUntil: sleep の後の interrupted では行を足さない', async () => {
  const { clock } = clockOf();
  const lines: string[] = [];
  let slept = 0;
  const r = await pollUntil(
    {
      ...clock,
      sleep: async (ms) => {
        slept += 1;
        await clock.sleep(ms);
      },
      interrupted: () => slept > 0,
    },
    {
      label: 'x',
      onWait: (line) => lines.push(line),
      intervalMs: 10_000,
      budget: { ms: 100_000 },
      probe: async () => ({ done: false }),
    }
  );
  assert.equal(r.kind, 'interrupted');
  assert.deepEqual(lines, ['  waiting for x: 10s / 100s']);
});

test('待機の行: run が 40 秒後に現れる world では 10s から 40s までの 4 行が出る', async () => {
  const w = makeWorld({ runListEmptyCalls: 4 });
  const result = await go(w);
  assert.deepEqual(result, { kind: 'completed' }, w.lines.join('\n'));
  const label = `the Release run for ${COMMIT.slice(0, 12)} to appear`;
  assert.deepEqual(
    w.lines.filter((l) => l.startsWith('  waiting for')),
    [10, 20, 30, 40].map((s) => `  waiting for ${label}: ${s}s / 180s`)
  );
});

test('EVIDENCE_FILES: 名前に / を含まない (パッケージ名の @scope/ は除く)', () => {
  assert.equal(EVIDENCE_FILES.run, 'run.json');
  assert.equal(EVIDENCE_FILES.jobs, 'jobs.json');
  assert.equal(EVIDENCE_FILES.runAttempt, 'run-attempt.json');
  assert.equal(EVIDENCE_FILES.logManifest, 'log-manifest.txt');
  for (const name of NAMES) {
    assert.equal(EVIDENCE_FILES.stageList(name), `stage-list-${shortOf(name)}.json`);
    assert.equal(EVIDENCE_FILES.view(name), `view-${shortOf(name)}.json`);
    assert.equal(EVIDENCE_FILES.stageList(name).includes('/'), false);
    assert.equal(EVIDENCE_FILES.view(name).includes('/'), false);
  }
});

// --- 正常系と再開 ---

test('正常: 6 つとも stage 済みで y -> manifest の順に検証した UUID で 6 回 approve し、段 11 を通って completed', async () => {
  const w = makeWorld();
  const result = await go(w);
  assert.deepEqual(result, { kind: 'completed' }, w.lines.join('\n'));
  assert.deepEqual(
    approveIds(w),
    NAMES.map((_, i) => uuid(i))
  );
  for (const call of w.calls.filter((c) => c.args[1] === 'approve')) {
    assert.deepEqual(call.args.slice(0, 2), ['stage', 'approve']);
    assert.equal(call.stdio, 'inherit-keep-stderr');
  }
  assertTempsRemoved(w);
});

test('正常: verifyTrust は confirm より前に 1 回、approve は confirm の後', async () => {
  const w = makeWorld();
  await go(w);
  assert.deepEqual(w.events.slice(0, 2), ['trust', 'confirm']);
  assert.equal(w.events.filter((e) => e === 'trust').length, 1);
  assert.equal(w.events.indexOf('confirm') < w.events.indexOf('approve:skam'), true);
});

test('再開: [P, P, S, S, S, S] は残りの 4 つだけ download、判定、approve する', async () => {
  const w = makeWorld({ published: 2 });
  const result = await go(w);
  assert.deepEqual(result, { kind: 'completed' }, w.lines.join('\n'));
  assert.deepEqual(
    approveIds(w),
    NAMES.slice(2).map((_, i) => uuid(i + 2))
  );
  assert.equal(w.count('npm', 'stage', 'download'), 4);
  const listed = w.calls
    .filter((c) => c.cmd === 'npm' && c.args[1] === 'list')
    .map((c) => c.args[2]);
  assert.equal(listed.includes(NAMES[0]), false);
  assert.equal(listed.includes(NAMES[1]), false);
});

test('done: 6 つとも公開済みなら verifyTrust も confirm も approve も 0 回で、段 11 だけ', async () => {
  const w = makeWorld({ published: 6 });
  const result = await go(w);
  assert.deepEqual(result, { kind: 'completed' }, w.lines.join('\n'));
  assert.equal(w.events.includes('trust'), false);
  assert.equal(w.confirmQuestions.length, 0);
  assert.equal(approveIds(w).length, 0);
  assert.equal(w.count('npm', 'stage', 'download'), 0);
  assert.equal(w.count('npm', 'stage', 'list'), 0);
});

test('checkOnly: log が取れて全部公開済みなら completed、stage list / download / approve は 0 回', async () => {
  const w = makeWorld({ published: 6, checkOnly: true });
  const result = await go(w);
  assert.deepEqual(result, { kind: 'completed' }, w.lines.join('\n'));
  assert.equal(w.count('npm', 'stage'), 0);
  assert.equal(w.count('gh', 'run', 'download'), 0);
  assert.equal(w.confirmQuestions.length, 0);
  assert.ok(w.calls.some((c) => c.args.includes('--log')));
});

test('checkOnly: log が 3 回とも取れなければ shape-unknown (manual)。錨なしで完了とは言わない', async () => {
  const w = makeWorld({ published: 6, checkOnly: true, logFailCalls: 3 });
  const stop = stopOf(await go(w));
  assert.equal(stop.route, 'manual');
  assert.equal(w.count('gh', 'run', 'view') >= 3, true);
});

test('N は declined で approve 0 回', async () => {
  const w = makeWorld({ confirm: false });
  assert.deepEqual(await go(w), { kind: 'declined' });
  assert.equal(approveIds(w).length, 0);
  assert.deepEqual(w.events, ['trust', 'confirm']);
  assertTempsRemoved(w);
});

test('verifyTrust: eotp は trust-eotp (rerun)、mismatch は manual、shape-unknown は manual。どれも confirm 0 回', async () => {
  const cases: [TrustResult, string][] = [
    [{ kind: 'eotp' }, 'rerun'],
    [{ kind: 'mismatch', what: 'two entries' }, 'manual'],
    [{ kind: 'shape-unknown', what: 'odd', rawPath: '/x' }, 'manual'],
    [{ kind: 'command-failed', what: 'boom' }, 'rerun'],
  ];
  for (const [trust, route] of cases) {
    const w = makeWorld({ trust });
    const stop = stopOf(await go(w));
    assert.equal(stop.route, route, trust.kind);
    assert.equal(w.confirmQuestions.length, 0, trust.kind);
    assert.equal(approveIds(w).length, 0, trust.kind);
    assertTempsRemoved(w);
  }
});

// --- 段 8 ---

test('run が in_progress なら gh run watch を inherit で 1 回待ち、その後 judgeJobs する', async () => {
  const w = makeWorld({ runStatus: 'in_progress' });
  const result = await go(w);
  assert.deepEqual(result, { kind: 'completed' }, w.lines.join('\n'));
  const watches = w.calls.filter((c) => c.cmd === 'gh' && c.args[1] === 'watch');
  assert.equal(watches.length, 1);
  assert.equal(watches[0]?.stdio, 'inherit');
});

test('watch の途中で interrupted() が真なら interrupted (rerun)', async () => {
  const w = makeWorld({ runStatus: 'in_progress', interruptOnWatch: true });
  const stop = stopOf(await go(w));
  assert.equal(stop.route, 'rerun');
  assert.match(stop.reason, /Interrupted/);
});

test('run が 3 分見つからなければ run-not-found (F4)。sleep の引数は WAIT の値', async () => {
  const w = makeWorld({ runListEmptyCalls: 1000 });
  const stop = stopOf(await go(w));
  assert.equal(stop.route, 'F4');
  assert.ok(w.sleeps.length > 0);
  for (const ms of w.sleeps) assert.equal(ms, WAIT.runAppear.intervalMs);
  assert.equal(w.sleeps.length, WAIT.runAppear.budgetMs / WAIT.runAppear.intervalMs);
});

test('run が少し遅れて出れば待って続ける', async () => {
  const w = makeWorld({ runListEmptyCalls: 2 });
  const result = await go(w);
  assert.deepEqual(result, { kind: 'completed' }, w.lines.join('\n'));
  assert.deepEqual(w.sleeps.slice(0, 2), [WAIT.runAppear.intervalMs, WAIT.runAppear.intervalMs]);
});

test('job の結論: (failure, skipped, skipped) は F1', async () => {
  const w = makeWorld({ conclusions: ['failure', 'skipped', 'skipped'] });
  assert.equal(stopOf(await go(w)).route, 'F1');
});

test('job の結論: (success, failure, skipped) で stage 0 は F2、(success, failure, success) は公開 0 で F2、公開 1 以上で F3', async () => {
  const w1 = makeWorld({ conclusions: ['success', 'failure', 'skipped'] });
  assert.equal(stopOf(await go(w1)).route, 'F2');
  const w2 = makeWorld({ conclusions: ['success', 'failure', 'success'] });
  assert.equal(stopOf(await go(w2)).route, 'F2');
  const w3 = makeWorld({ conclusions: ['success', 'failure', 'success'], published: 1 });
  assert.equal(stopOf(await go(w3)).route, 'F3');
});

test('job の結論: (success, cancelled, skipped) は unexpected-run-shape (manual)。生の出力を保存する', async () => {
  const w = makeWorld({ conclusions: ['success', 'cancelled', 'skipped'] });
  const stop = stopOf(await go(w));
  assert.equal(stop.route, 'manual');
  assert.ok(w.evidence.some((e) => e.name === EVIDENCE_FILES.jobs));
});

test('log が 3 回とも取れなければ shape-unknown (manual)', async () => {
  const w = makeWorld({ logFailCalls: 3 });
  const stop = stopOf(await go(w));
  assert.equal(stop.route, 'manual');
  assert.deepEqual(
    w.sleeps.filter((ms) => ms === WAIT.logFetch.intervalMs),
    [WAIT.logFetch.intervalMs, WAIT.logFetch.intervalMs]
  );
  assert.equal(w.confirmQuestions.length, 0);
});

test('log が 1 回目だけ取れなくても、読み直して続ける', async () => {
  const w = makeWorld({ logFailCalls: 1 });
  assert.deepEqual(await go(w), { kind: 'completed' }, w.lines.join('\n'));
});

// --- 段 9 ---

test('artifact の download が失敗しても、表示に「取得できず」と出して判定は続く', async () => {
  const w = makeWorld({ artifact: 'fail' });
  const result = await go(w);
  assert.deepEqual(result, { kind: 'completed' }, w.lines.join('\n'));
  assert.ok(w.lines.some((l) => l.includes('artifact: 取得できず (省略)')));
});

test('artifact に symlink / サブディレクトリ / 余分なファイルがあれば mismatch で、y/N に進まない', async () => {
  for (const artifact of ['symlink', 'subdir', 'extra'] as const) {
    const w = makeWorld({ artifact });
    const stop = stopOf(await go(w));
    assert.equal(stop.route, 'F2', artifact);
    assert.equal(w.confirmQuestions.length, 0, artifact);
    assert.equal(approveIds(w).length, 0, artifact);
    assertTempsRemoved(w);
  }
});

test('artifact の integrity が log と違えば mismatch', async () => {
  const w = makeWorld({ artifact: 'other-integrity' });
  const stop = stopOf(await go(w));
  assert.equal(stop.route, 'F2');
  assert.equal(w.confirmQuestions.length, 0);
});

test('stage の download で .tgz が 0 個 / 2 個なら mismatch', async () => {
  for (const mode of ['none', 'two'] as const) {
    const w = makeWorld({ tar: { [NAMES[1] ?? '']: mode } });
    const stop = stopOf(await go(w));
    assert.equal(stop.route, 'F2', mode);
    assert.equal(w.confirmQuestions.length, 0, mode);
    assertTempsRemoved(w);
  }
});

test('stage の tarball の sha512 が log と違えば staged-mismatch (F2)。y/N に進まない', async () => {
  const w = makeWorld({ tar: { [NAMES[2] ?? '']: 'wrong' } });
  const stop = stopOf(await go(w));
  assert.equal(stop.route, 'F2');
  // 理由は固定の断片。what は error.lines に移る
  assert.equal(/sha512/.test(stop.reason), false, stop.reason);
  assert.ok(
    stop.error?.lines.some((l) => /sha512/.test(l)),
    JSON.stringify(stop.error)
  );
  assert.equal(w.confirmQuestions.length, 0);
});

test('stage の download の readFile が上限を超えて例外を投げたら、そのパッケージの staged-mismatch で、removeTemp は呼ばれる', async () => {
  const w = makeWorld({ tar: { [NAMES[3] ?? '']: 'read-throws' } });
  const stop = stopOf(await go(w));
  assert.equal(stop.route, 'F2');
  assert.match(stop.reason, /skam-html-renderer/);
  assertTempsRemoved(w);
});

test('stage の download は、パッケージごとの空の一時ディレクトリを cwd にして行う', async () => {
  const w = makeWorld();
  await go(w);
  const cwds = w.calls.filter((c) => c.args[1] === 'download' && c.cmd === 'npm').map((c) => c.cwd);
  assert.equal(new Set(cwds).size, 6);
  for (const cwd of cwds) assert.ok(w.temps.includes(cwd ?? ''));
});

test('view に版があり integrity が log と違えば published-wrong (F3)', async () => {
  const w = makeWorld({ published: 1, publishedIntegrity: { [NAMES[0] ?? '']: 'sha512-other' } });
  const stop = stopOf(await go(w));
  assert.equal(stop.route, 'F3');
  assert.equal(w.confirmQuestions.length, 0);
});

test('stage list が 2 件なら staged-mismatch (公開 0 で F2)', async () => {
  const w = makeWorld({ twoStaged: NAMES[4] ?? '' });
  const stop = stopOf(await go(w));
  assert.equal(stop.route, 'F2');
  assert.equal(w.confirmQuestions.length, 0);
});

test('段 9 の前後で attemptKey が変われば attempt-changed (rerun)', async () => {
  const w = makeWorld({ attempts: [1, 2] });
  const stop = stopOf(await go(w));
  assert.equal(stop.route, 'rerun');
  assert.match(stop.reason, /re-run/);
  assert.equal(w.confirmQuestions.length, 0);
});

test('missing: 再実行で view に版がなく stage も消えていても、待った後に published になれば approve せずに段 11 へ', async () => {
  const w = makeWorld({
    published: 6,
    noStaged: true,
    viewLag: Object.fromEntries(NAMES.map((n) => [n, 2])),
  });
  const result = await go(w);
  assert.deepEqual(result, { kind: 'completed' }, w.lines.join('\n'));
  assert.equal(approveIds(w).length, 0);
  assert.ok(w.sleeps.includes(WAIT.settle.intervalMs));
  assert.equal(w.confirmQuestions.length, 0);
});

test('missing が解けなければ待機を使い切って分類する (公開 0 かつ 6 つとも missing は stage-none の F2)', async () => {
  const w = makeWorld({ noStaged: true });
  const stop = stopOf(await go(w));
  assert.equal(stop.route, 'F2');
  assert.equal(
    w.sleeps.filter((ms) => ms === WAIT.settle.intervalMs).length,
    WAIT.settle.budgetMs / WAIT.settle.intervalMs
  );
});

// --- 判定の根拠の保存 ---

test('判定の根拠は ok のときも保存する (run、jobs、attempt、log、stage list、view)', async () => {
  const w = makeWorld({ published: 1 });
  await go(w);
  const names = new Set(w.evidence.map((e) => e.name));
  for (const expected of [
    EVIDENCE_FILES.run,
    EVIDENCE_FILES.jobs,
    EVIDENCE_FILES.runAttempt,
    EVIDENCE_FILES.logManifest,
    EVIDENCE_FILES.stageList(NAMES[1] ?? ''),
    EVIDENCE_FILES.view(NAMES[0] ?? ''),
  ]) {
    assert.ok(names.has(expected), `${expected} was not saved: ${[...names].join(', ')}`);
  }
  for (const name of names) assert.equal(name.includes('/'), false, name);
});

test('判定の根拠は mismatch のときも shape-unknown のときも保存する', async () => {
  const mismatch = makeWorld({ tar: { [NAMES[2] ?? '']: 'wrong' } });
  await go(mismatch);
  assert.ok(mismatch.evidence.some((e) => e.name === EVIDENCE_FILES.stageList(NAMES[2] ?? '')));
  assert.ok(mismatch.evidence.some((e) => e.name === EVIDENCE_FILES.logManifest));
  const unknown = makeWorld({ conclusions: ['success', 'cancelled', 'skipped'] });
  await go(unknown);
  assert.ok(unknown.evidence.some((e) => e.name === EVIDENCE_FILES.run));
  assert.ok(unknown.evidence.some((e) => e.name === EVIDENCE_FILES.jobs));
});

test('どの停止でも、作った一時ディレクトリすべてに removeTemp が呼ばれる', async () => {
  const worlds = [
    makeWorld({ artifact: 'symlink' }),
    makeWorld({ tar: { [NAMES[2] ?? '']: 'wrong' } }),
    makeWorld({ confirm: false }),
    makeWorld({ trust: { kind: 'eotp' } }),
    makeWorld({ attempts: [1, 2] }),
  ];
  for (const w of worlds) {
    await go(w);
    assert.ok(w.temps.length > 0);
    assertTempsRemoved(w);
  }
});

// --- y/N の前の表示 ---

test('y/N の前の表示に、manifest の順の名前、stage id、integrity の先頭 16 文字と末尾 8 文字、artifact の有無、証拠の保存先が含まれる', async () => {
  const w = makeWorld({ confirm: false });
  await go(w);
  const text = w.lines.join('\n');
  let at = -1;
  NAMES.forEach((name, i) => {
    const next = text.indexOf(name, at + 1);
    assert.ok(next > at, `${name} is missing or out of order`);
    at = next;
    assert.ok(text.includes(uuid(i)), `stage id ${uuid(i)}`);
    const integrity = integrityOf(name);
    assert.ok(text.includes(integrity.slice(0, 16)), 'integrity head');
    assert.ok(text.includes(integrity.slice(-8)), 'integrity tail');
    assert.equal(text.includes(integrity), false, 'the full integrity is not printed');
  });
  assert.match(text, /artifact: /);
  assert.ok(text.includes('/repo/.tmp/release/v0.2.0/'));
  assert.ok(text.includes(`${RUN_ID}`));
});

// --- E409 と approve の失敗 ---

const E409 = 'npm error code E409\nnpm error conflict';

test('3 回目の approve が E409 を 2 回返して 3 回目に成功 -> sleep は 30 秒 x 2、approve は合計 8 回', async () => {
  const w = makeWorld({
    approve: (name, nth) =>
      name === NAMES[2] && nth <= 2 ? { status: 1, stderr: E409 } : undefined,
  });
  const result = await go(w);
  assert.deepEqual(result, { kind: 'completed' }, w.lines.join('\n'));
  assert.equal(approveIds(w).length, 8);
  assert.deepEqual(
    w.sleeps.filter((ms) => ms === WAIT.conflict.intervalMs),
    [WAIT.conflict.intervalMs, WAIT.conflict.intervalMs]
  );
});

test('E409 が 20 回続けば approve-failed (rerun)、公開済みは 2', async () => {
  const w = makeWorld({
    approve: (name) => (name === NAMES[2] ? { status: 1, stderr: E409 } : undefined),
  });
  const stop = stopOf(await go(w));
  assert.equal(stop.route, 'rerun');
  assert.match(stop.reason, /approve failed/);
  assert.equal(w.published.size, 2);
  assert.equal(
    w.sleeps.filter((ms) => ms === WAIT.conflict.intervalMs).length,
    WAIT.conflict.attempts
  );
});

test('3 回目の approve が 2FA のキャンセル (E409 でない) なら approve-failed (rerun)。待たない', async () => {
  const w = makeWorld({
    approve: (name) =>
      name === NAMES[2] ? { status: 1, stderr: 'npm error code EOTP\ncanceled' } : undefined,
  });
  const stop = stopOf(await go(w));
  assert.equal(stop.route, 'rerun');
  assert.match(stop.reason, /approve failed/);
  assert.equal(approveIds(w).length, 3);
  assert.equal(w.sleeps.includes(WAIT.conflict.intervalMs), false);
});

test('approve の失敗の後に interrupted() が真なら、stderr に E409 があっても interrupted', async () => {
  const w = makeWorld({
    approve: (name, _nth, _total, world) => {
      if (name !== NAMES[2]) return undefined;
      world.interrupted = true;
      return { status: 1, stderr: E409 };
    },
  });
  const stop = stopOf(await go(w));
  assert.equal(stop.route, 'rerun');
  assert.match(stop.reason, /Interrupted/);
  assert.equal(approveIds(w).length, 3);
  assertTempsRemoved(w);
});

test('approve の失敗の後、状態が published なら成功として続ける', async () => {
  const w = makeWorld({
    approve: (name, _nth, _total, world) => {
      if (name !== NAMES[2]) return undefined;
      world.published.add(name);
      world.staged.delete(name);
      return { status: 1, stderr: 'npm error network reset' };
    },
  });
  const result = await go(w);
  assert.deepEqual(result, { kind: 'completed' }, w.lines.join('\n'));
  assert.equal(approveIds(w).length, 6);
});

test('approve の失敗の後、状態が missing なら待ってから分類する (待った後に published なら成功)', async () => {
  const w = makeWorld({
    viewLag: { [NAMES[2] ?? '']: 5 },
    approve: (name, _nth, _total, world) => {
      if (name !== NAMES[2]) return undefined;
      world.published.add(name);
      world.staged.delete(name);
      return { status: 1, stderr: 'npm error network reset' };
    },
  });
  const result = await go(w);
  assert.deepEqual(result, { kind: 'completed' }, w.lines.join('\n'));
  assert.ok(w.sleeps.includes(WAIT.settle.intervalMs));
});

test('approve の失敗の後、状態が missing のままなら待機を使い切って F3 (公開 2 件)', async () => {
  const w = makeWorld({
    approve: (name, _nth, _total, world) => {
      if (name !== NAMES[2]) return undefined;
      world.staged.delete(name);
      return { status: 1, stderr: 'npm error network reset' };
    },
  });
  const stop = stopOf(await go(w));
  assert.equal(stop.route, 'F3');
});

test('y/N の後、直前の読み直しで stage list が別の id を返せば、approve を呼ばず staged-mismatch', async () => {
  const w = makeWorld();
  w.onConfirm = () => {
    w.staged.set(NAMES[0] ?? '', uuid(8));
  };
  const stop = stopOf(await go(w));
  assert.equal(stop.route, 'F2');
  assert.equal(approveIds(w).length, 0);
});

test('y/N の後、2 つ目だけ別の id を返しても、1 つ目の approve の後に止まり、検証していない id では approve しない', async () => {
  const w = makeWorld();
  w.onConfirm = () => {
    w.staged.set(NAMES[1] ?? '', uuid(8));
  };
  const stop = stopOf(await go(w));
  assert.equal(stop.route, 'F3');
  assert.deepEqual(approveIds(w), [uuid(0)]);
});

// --- 止まるときの公開済みの集合 ---

test('公開 1 件 + log の形の不一致は manual (mayBeF3)', async () => {
  const w = makeWorld({ published: 1, logFailCalls: 3 });
  const stop = stopOf(await go(w));
  assert.equal(stop.route, 'manual');
  assert.equal(stop.mayBeF3, true);
});

test('run-not-found で npm view も失敗すれば published は unknown で manual', async () => {
  const w = makeWorld({ runListEmptyCalls: 1000, npmViewFails: true });
  const stop = stopOf(await go(w));
  assert.equal(stop.route, 'manual');
  assert.equal(stop.mayBeF3, true);
});

// --- 段 11 ---

test('段 11: 1 つの integrity が違い Release もなければ post-check-failed (2 つ)、代表は F3', async () => {
  const w = makeWorld({
    releaseAt: 1_000_000,
    postViewIntegrity: { [NAMES[3] ?? '']: 'sha512-tampered' },
  });
  const result = await go(w);
  assert.equal(result.kind, 'post-check-failed', w.lines.join('\n'));
  if (result.kind !== 'post-check-failed') return;
  assert.equal(result.stops.length, 2);
  assert.deepEqual(result.stops.map((s) => s.route).sort(), ['F3', 'rerun']);
  const text = w.lines.join('\n');
  assert.ok(text.indexOf('F3') >= 0);
  assert.equal(w.sleeps.filter((ms) => ms === WAIT.settle.intervalMs).length >= 1, true);
});

test('段 11: 外れが読み直しの途中で解ければ completed', async () => {
  const w = makeWorld({ releaseAt: 3 });
  const result = await go(w);
  assert.deepEqual(result, { kind: 'completed' }, w.lines.join('\n'));
  assert.equal(w.releaseViews, 4);
});

test('完了の表示は ADR-029 の結果の欄に写せる一覧 (パッケージごとの integrity、dist-tag、Release)', async () => {
  const w = makeWorld();
  await go(w);
  const text = w.lines.join('\n');
  for (const name of NAMES) assert.ok(text.includes(`${name}: integrity ok`), name);
  assert.match(text, /GitHub Release: ok/);
});

// --- 停止の error (plan-2 T4) ---

const RUN_URL = `https://github.com/berlysia/kanbun-annotation/actions/runs/${RUN_ID}`;
const NPM_STAGE_FAILED: ['success', 'failure', 'skipped'] = ['success', 'failure', 'skipped'];
const externalLines = (text: string[]): string[] => text.filter((l) => l.startsWith('  | '));

function assertThreeHeadings(text: string[], label: string): void {
  for (const heading of SECTION_HEADINGS) {
    assert.ok(text.includes(heading), `${label}: ${heading}\n${text.join('\n')}`);
  }
}

test('job-failed (npm-stage): the failed job log is read with --log-failed --job and its lines are shown', async () => {
  const w = makeWorld({ conclusions: NPM_STAGE_FAILED });
  const result = await go(w);
  const stop = stopOf(result);
  const call = w.calls.find((c) => c.args.includes('--log-failed'));
  assert.deepEqual(call?.args.slice(0, 6), [
    'run',
    'view',
    String(RUN_ID),
    '--log-failed',
    '--job',
    String(NPM_STAGE_JOB_ID),
  ]);
  assert.equal(stop.route, 'F2');
  assert.deepEqual(stop.site, { side: 'after-push', where: 'job-failed', job: 'npm-stage' });
  const text = render(result);
  assert.equal(text[0], '[F2] The npm-stage job failed');
  assert.ok(
    externalLines(text).some(
      (l) => l.includes('npm verbose oidc') && l.includes('package not found')
    ),
    text.join('\n')
  );
  assert.equal(
    text.some((l) => l.includes('npm verbose stack')),
    false
  );
  assert.ok(text.some((l) => l.includes('This trusted publisher configuration has expired')));
  assert.ok(text.includes('see docs/releasing.md: ### F2:'));
  assertThreeHeadings(text, 'npm-stage');
  // 取れた log のコマンドは成功したので、exit は出さない
  assert.ok(
    text.includes(`  $ gh run view ${RUN_ID} --log-failed --job ${NPM_STAGE_JOB_ID}`),
    text.join('\n')
  );
});

test('job-failed (npm-stage): the plain log without package not found still reaches trust-expired', async () => {
  const w = makeWorld({
    conclusions: NPM_STAGE_FAILED,
    failedLog: () => ({ status: 0, stdout: LOG_PLAIN, stderr: '' }),
  });
  const text = render(await go(w));
  assert.ok(
    externalLines(text).some((l) => l.includes('npm error code E401')),
    text.join('\n')
  );
  assert.ok(text.some((l) => l.includes('This trusted publisher configuration has expired')));
  assert.equal(
    text.some((l) => l.includes('npm whoami')),
    false
  );
});

test('job-failed: a log that cannot be read in 3 tries says so, keeps trust-expired and names the run', async () => {
  const w = makeWorld({
    conclusions: NPM_STAGE_FAILED,
    failedLog: () => ({ status: 1, stdout: '', stderr: 'gh: boom' }),
  });
  const result = await go(w);
  const stop = stopOf(result);
  assert.deepEqual(w.sleeps, [WAIT.logFetch.intervalMs, WAIT.logFetch.intervalMs]);
  assert.equal(stop.route, 'F2');
  assert.equal(stop.error?.exit, 1);
  assert.equal(stop.error?.logUnreadable, true);
  const text = render(result);
  assert.ok(text.includes('  | could not read the job log'), text.join('\n'));
  assert.ok(text.includes('  | gh: boom'), text.join('\n'));
  assert.ok(
    text.some((l) => l.includes(RUN_URL)),
    text.join('\n')
  );
  assert.ok(text.some((l) => l.includes('This trusted publisher configuration has expired')));
});

test('job-failed: 3 empty logs set exit to null and print the signal-or-not-started exit', async () => {
  const w = makeWorld({
    conclusions: NPM_STAGE_FAILED,
    failedLog: () => ({ status: 0, stdout: '', stderr: '' }),
  });
  const result = await go(w);
  assert.equal(stopOf(result).error?.exit, null);
  assert.deepEqual(w.sleeps, [WAIT.logFetch.intervalMs, WAIT.logFetch.intervalMs]);
  const text = render(result);
  assert.ok(
    text.some((l) => l.endsWith('(exit: signal or not started)')),
    text.join('\n')
  );
  assert.ok(text.includes('  | could not read the job log'));
});

test('job-failed: an empty first read is retried and a later read succeeds without logUnreadable', async () => {
  const w = makeWorld({
    conclusions: NPM_STAGE_FAILED,
    failedLog: (n) => ({ status: 0, stdout: n === 1 ? '' : LOG_VERBOSE, stderr: '' }),
  });
  const stop = stopOf(await go(w));
  assert.deepEqual(w.sleeps, [WAIT.logFetch.intervalMs]);
  assert.equal(stop.error?.logUnreadable, undefined);
  assert.ok(stop.error?.lines.some((l) => l.includes('package not found')));
});

test('job-failed: a result over the 64 MiB cap is not retried', async () => {
  const w = makeWorld({
    conclusions: NPM_STAGE_FAILED,
    failedLog: () => ({
      status: null,
      stdout: '',
      stderr: 'command-failed: gh output exceeded 64 MiB',
      exceeded: true,
    }),
  });
  const result = await go(w);
  const stop = stopOf(result);
  assert.deepEqual(w.sleeps, []);
  assert.equal(stop.route, 'F2');
  assert.equal(stop.error?.exit, null);
  assert.ok(render(result).includes('  | could not read the job log'));
});

test('job-failed: Ctrl-C while the log is being read ends as interrupted (rerun) and nothing leaks', async () => {
  const w = makeWorld({
    conclusions: NPM_STAGE_FAILED,
    failedLog: (_n, world) => {
      world.interrupted = true;
      return { status: 0, stdout: '', stderr: '' };
    },
  });
  const stop = stopOf(await go(w));
  assert.equal(stop.route, 'rerun');
  assert.match(stop.reason, /Interrupted/);
});

test('job-failed: a failed read with Ctrl-C raised at the same time is interrupted, not "could not read"', async () => {
  const w = makeWorld({
    conclusions: NPM_STAGE_FAILED,
    failedLog: (_n, world) => {
      world.interrupted = true;
      return { status: 1, stdout: '', stderr: 'gh: boom' };
    },
  });
  const stop = stopOf(await go(w));
  assert.equal(stop.route, 'rerun');
  assert.match(stop.reason, /Interrupted/);
  assert.equal(stop.error?.logUnreadable, undefined);
});

test('job-failed: an npm-stage job without a usable id reads no log and is logUnreadable', async () => {
  for (const npmStageId of ['omit', 0, -1, 1.5, '12; rm', 2 ** 53]) {
    const w = makeWorld({ conclusions: NPM_STAGE_FAILED, npmStageId });
    const result = await go(w);
    const stop = stopOf(result);
    assert.equal(
      w.calls.some((c) => c.args.includes('--log-failed')),
      false,
      String(npmStageId)
    );
    assert.deepEqual(w.sleeps, [], String(npmStageId));
    assert.equal(stop.route, 'F2');
    assert.equal(stop.error?.logUnreadable, true);
    assert.equal(stop.error?.exit, null);
    assert.ok(
      render(result).some((l) => l.includes('This trusted publisher configuration has expired'))
    );
  }
});

test('job-failed (validate): the validate job log is read and trust-expired is not offered', async () => {
  const w = makeWorld({ conclusions: ['failure', 'skipped', 'skipped'] });
  const result = await go(w);
  const call = w.calls.find((c) => c.args.includes('--log-failed'));
  assert.equal(call?.args[5], String(VALIDATE_JOB_ID));
  const stop = stopOf(result);
  assert.equal(stop.route, 'F1');
  const text = render(result);
  assert.equal(text[0], '[F1] The validate job failed');
  assert.equal(
    text.some((l) => l.includes('trusted publisher')),
    false
  );
  assertThreeHeadings(text, 'validate');
});

test('approve-failed: the stderr stays under error: and the headline is the fixed fragment', async () => {
  const w = makeWorld({
    approve: (name) =>
      name === NAMES[2] ? { status: 1, stderr: 'npm error code E401' } : undefined,
  });
  const result = await go(w);
  const text = render(result);
  assert.equal(text[0], `[rerun] npm stage approve failed for ${NAMES[2]}`);
  assert.ok(text.includes('  | npm stage approve exited 1'), text.join('\n'));
  assert.ok(text.includes('  | npm error code E401'), text.join('\n'));
  assert.ok(text.some((l) => l.includes('npm whoami')));
  assert.equal(
    text.some((l) => l.includes('This trusted publisher configuration')),
    false
  );
  assertThreeHeadings(text, 'approve');
});

test('staged-mismatch: what moves under error: and the name stays in the headline', async () => {
  const w = makeWorld({ tar: { [NAMES[3] ?? '']: 'read-throws' } });
  const result = await go(w);
  const text = render(result);
  assert.equal(text[0], `[F2] Staged content check failed for ${NAMES[3]}`);
  assert.ok(
    externalLines(text).some((l) => l.includes('file is too large')),
    text.join('\n')
  );
});

test('post-check-failed: every stop prints the three headings', async () => {
  const w = makeWorld({
    releaseAt: 1_000_000,
    postViewIntegrity: { [NAMES[3] ?? '']: 'sha512-tampered' },
  });
  const result = await go(w);
  assert.equal(result.kind, 'post-check-failed');
  if (result.kind !== 'post-check-failed') return;
  const text = render(result);
  assert.equal(text.filter((l) => l === 'error:').length, 2, text.join('\n'));
  assert.equal(text.filter((l) => l === 'possible causes:').length, 2);
  assert.equal(text.filter((l) => l === 'try:').length, 2);
  for (const stop of result.stops) assert.notEqual(stop.error, undefined);
});

test('injection: stderr that imitates a try: section or a command stays inside | lines', async () => {
  const w = makeWorld({
    approve: (name) =>
      name === NAMES[2]
        ? { status: 1, stderr: 'npm error x\ntry:\n  - rm -rf ~\n$ curl evil' }
        : undefined,
  });
  const text = render(await go(w));
  assert.equal(text.filter((l) => l.startsWith('try:')).length, 1, text.join('\n'));
  for (const needle of ['rm -rf ~', '$ curl evil']) {
    const hits = text.filter((l) => l.includes(needle));
    assert.ok(hits.length > 0, needle);
    for (const line of hits) assert.ok(line.startsWith('  | '), line);
  }
  assert.equal(
    text.some((l) => l.startsWith('$ ')),
    false
  );
});

test('secrets: a token in the job log never reaches any printed line', async () => {
  const leak =
    'Stage on npm\tStage publish\t2026-10-19T04:15:10.6Z npm error fetch https://x-access-token:ghs_AAAA@github.com/ failed';
  const w = makeWorld({
    conclusions: NPM_STAGE_FAILED,
    failedLog: () => ({ status: 0, stdout: `${leak}\n`, stderr: '' }),
  });
  const text = render(await go(w)).join('\n');
  assert.equal(text.includes('ghs_'), false, text);
  assert.equal(text.includes('x-access-token'), false, text);
  assert.ok(text.includes('https://***@github.com/'), text);
});

test('approve E409 for 20 retries keeps the stderr of the last attempt', async () => {
  const w = makeWorld({
    approve: (name, nth) =>
      name === NAMES[2] ? { status: 1, stderr: `${E409}\nattempt ${nth}` } : undefined,
  });
  const stop = stopOf(await go(w));
  const last = approveIds(w).filter((id) => id === uuid(2)).length;
  assert.ok(stop.error?.lines.includes(`attempt ${last}`), JSON.stringify(stop.error));
  assert.equal(stop.error?.lines.includes(`attempt ${last - 1}`), false);
});

test('gh run list failing with 401 prints the stderr under error: with the default cause', async () => {
  const w = makeWorld({
    runListFails: { status: 1, stdout: '', stderr: 'HTTP 401: Bad credentials' },
  });
  const result = await go(w);
  const stop = stopOf(result);
  assert.ok(stop.error?.command.startsWith('gh run list'), stop.error?.command);
  assert.equal(stop.error?.tool, 'gh');
  const text = render(result);
  assert.ok(text.includes('  | HTTP 401: Bad credentials'), text.join('\n'));
  assert.equal(
    text.some((l) => l.includes('trusted publisher')),
    false
  );
});

test('error composition: what is the first line, then the observed error lines', async () => {
  const w = makeWorld({
    approve: (name) =>
      name === NAMES[2] ? { status: 1, stderr: 'npm error one\nnpm error two' } : undefined,
  });
  const stop = stopOf(await go(w));
  assert.deepEqual(stop.error?.lines, [
    'npm stage approve exited 1',
    'npm error one',
    'npm error two',
  ]);
  // what は規則に渡す行ではない
  assert.equal(stop.error?.matched.includes('npm stage approve exited 1'), false);
});

test('error composition: a stop with no observed error shows its what or reason', async () => {
  const noStaged = makeWorld({ noStaged: true });
  const stop = stopOf(await go(noStaged));
  assert.equal(stop.error?.command, '(no command)');
  assert.deepEqual(stop.error?.lines, [stop.reason]);
  const mismatch = makeWorld({ tar: { [NAMES[2] ?? '']: 'wrong' } });
  const withWhat = stopOf(await go(mismatch));
  assert.equal(withWhat.error?.command, '(no command)');
  assert.ok(withWhat.error?.lines.some((l) => /sha512/.test(l)));
});

test('trust stops: eotp, command-failed and shape-unknown carry the npm trust list error', async () => {
  const w1 = makeWorld({
    trust: {
      kind: 'command-failed',
      what: 'npm trust list exited 1: npm error 404',
      failure: { command: 'npm trust list @a/b --json', status: 1, stderr: 'npm error 404' },
    },
  });
  const s1 = stopOf(await go(w1));
  assert.equal(s1.error?.command, 'npm trust list @a/b --json');
  assert.equal(s1.error?.tool, 'npm');
  assert.ok(s1.error?.lines.includes('npm error 404'));
  assert.equal(s1.error?.lines.filter((l) => l.includes('npm error 404')).length, 1);
  const w2 = makeWorld({
    trust: {
      kind: 'eotp',
      failure: { command: 'npm trust list @a/b --json', status: 1, stderr: 'npm error code EOTP' },
    },
  });
  const s2 = stopOf(await go(w2));
  assert.equal(s2.route, 'rerun');
  assert.ok(s2.error?.lines.includes('npm error code EOTP'));
  const w3 = makeWorld({ trust: { kind: 'shape-unknown', what: 'odd', rawPath: '/x' } });
  const result = await go(w3);
  const s3 = stopOf(result);
  assert.equal(s3.error?.command, `npm trust list ${NAMES[0]} --json`);
  assert.equal(s3.error?.rawPath, '/x');
  assert.deepEqual(s3.error?.lines, ['odd']);
  assert.ok(render(result).some((l) => l.includes('shape of the npm or gh output differs')));
});

const everyKind: [string, () => World][] = [
  ['run-not-found', () => makeWorld({ runListEmptyCalls: 1000 })],
  ['job-failed', () => makeWorld({ conclusions: NPM_STAGE_FAILED })],
  ['unexpected-run-shape', () => makeWorld({ conclusions: ['success', 'cancelled', 'skipped'] })],
  ['shape-unknown', () => makeWorld({ logFailCalls: 3 })],
  ['staged-mismatch', () => makeWorld({ tar: { [NAMES[2] ?? '']: 'wrong' } })],
  ['stage-none', () => makeWorld({ noStaged: true })],
  [
    'published-out-of-order',
    () => {
      const w = makeWorld();
      w.published.add(NAMES[1] ?? '');
      w.staged.delete(NAMES[1] ?? '');
      return w;
    },
  ],
  [
    'published-wrong',
    () => makeWorld({ published: 1, publishedIntegrity: { [NAMES[0] ?? '']: 'x' } }),
  ],
  [
    'approve-failed',
    () =>
      makeWorld({ approve: (n) => (n === NAMES[2] ? { status: 1, stderr: 'boom' } : undefined) }),
  ],
  ['interrupted', () => makeWorld({ runStatus: 'in_progress', interruptOnWatch: true })],
  ['attempt-changed', () => makeWorld({ attempts: [1, 2] })],
  ['command-failed', () => makeWorld({ runListFails: { status: 1, stdout: '', stderr: 'x' } })],
  ['trust-eotp', () => makeWorld({ trust: { kind: 'eotp' } })],
  ['trust-mismatch', () => makeWorld({ trust: { kind: 'mismatch', what: 'two entries' } })],
];
for (const [kind, build] of everyKind) {
  test(`every stop kind prints the three headings: ${kind}`, async () => {
    const w = build();
    const result = await go(w);
    const stop = stopOf(result);
    assert.equal(stop.site.where, kind, JSON.stringify(stop));
    assert.notEqual(stop.error, undefined, kind);
    assertThreeHeadings(render(result), kind);
  });
}

// --- 入口 ---

test('入口: tag が v + version でなければ止まり、コマンドは 1 つも呼ばない', async () => {
  const w = makeWorld();
  const result = await runAfterPush({ ...w.input, tag: 'v0.2.1' }, w.deps);
  assert.equal(stopOf(result).route, 'rerun');
  assert.equal(w.calls.length, 0);
});

test('入口: version が semver でなければ止まる (保存先のパスに使うため)', async () => {
  const w = makeWorld();
  for (const version of ['../x', '0.2', '0.2.0/../..', '']) {
    const result = await runAfterPush({ ...w.input, version, tag: `v${version}` }, w.deps);
    assert.equal(result.kind, 'stopped', version);
  }
  assert.equal(w.calls.length, 0);
});
