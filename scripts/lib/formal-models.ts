/**
 * docs/formal/<topic>/formal.json の形式検査を、テストの中で tla-ts によって流すための部品。
 * manifest の欄は formal-check (dotfiles 側の道具) と同じで、このテストは kind が tla の check だけを扱う。
 */

import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { Worker } from 'node:worker_threads';

export type Verdict = 'hold' | 'violate' | 'error';

export interface TlaOutcome {
  verdict: Verdict;
  /** violate のときに違反した性質の名前 */
  violated?: string;
  /** error のときの理由 */
  message?: string;
}

export interface Cover {
  path: string;
  sha256: string | null;
}

export interface Sync {
  commit?: string;
  covers: Cover[];
}

export interface FormalCheck {
  id: string;
  kind: 'tla';
  model: string;
  cfg: string;
  property: string;
  expect: 'hold' | 'violate';
  role: string;
  timeoutSec?: number;
  sync?: Sync;
}

export interface Judgement {
  ok: boolean;
  message: string;
}

/** check に timeoutSec がないときの上限。17 件は 1 件 30ms 以内で終わる */
export const DEFAULT_TIMEOUT_SEC = 30;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** manifest の形を検査する。形が違えば、どの manifest のどの check かを添えて投げる */
export function parseManifest(text: string, where: string): { checks: FormalCheck[] } {
  const json: unknown = JSON.parse(text);
  if (!isRecord(json) || json['schemaVersion'] !== 1) {
    throw new Error(`${where}: schemaVersion must be 1`);
  }
  const checks = json['checks'];
  if (!Array.isArray(checks) || checks.length === 0) {
    throw new Error(`${where}: the manifest has no checks`);
  }
  return {
    checks: checks.map((raw, index) => {
      const at = `${where}: checks[${index}]`;
      if (!isRecord(raw)) throw new Error(`${at} is not an object`);
      if (raw['kind'] !== 'tla') {
        throw new Error(`${at}: kind is ${String(raw['kind'])}; this test runs only tla checks`);
      }
      for (const key of ['id', 'model', 'cfg', 'property', 'role'] as const) {
        if (typeof raw[key] !== 'string' || raw[key] === '') {
          throw new Error(`${at}: ${key} must be a non-empty string`);
        }
      }
      if (raw['expect'] !== 'hold' && raw['expect'] !== 'violate') {
        throw new Error(`${at}: expect must be hold or violate`);
      }
      return raw as unknown as FormalCheck;
    }),
  };
}

/**
 * base から rel を解決し、symlink を辿った実体がリポジトリの中にあることを確かめて、その実体のパスを返す。
 * 文字列の `..` を見るだけでは、リポジトリの中の symlink が外を指す場合を防げない。読む前に呼ぶ
 */
export function resolveInRepo(base: string, rel: string, repoRoot: string): string {
  if (isAbsolute(rel)) throw new Error(`${rel}: an absolute path is outside the repository`);
  const real = realpathSync(resolve(base, rel));
  const root = realpathSync(repoRoot);
  const fromRoot = relative(root, real);
  if (
    fromRoot === '' ||
    fromRoot.startsWith(`..${sep}`) ||
    fromRoot === '..' ||
    isAbsolute(fromRoot)
  ) {
    throw new Error(`${rel}: resolves to ${real}, outside the repository`);
  }
  return real;
}

const sha256Of = (file: string): string =>
  createHash('sha256').update(readFileSync(file)).digest('hex');

/**
 * contract が覆うファイルのハッシュを記録と比べる。path はリポジトリのルートから解決する。
 * 違えば、モデルを見直して sync を書き換える手順を文言にする
 */
export function checkCovers(sync: Sync, repoRoot: string): Judgement {
  const problems: string[] = [];
  for (const cover of sync.covers) {
    const file = resolveInRepo(repoRoot, cover.path, repoRoot);
    const current = sha256Of(file);
    if (cover.sha256 === current) continue;
    const diff =
      sync.commit === undefined ? '' : ` (start from: git diff ${sync.commit} -- ${cover.path})`;
    problems.push(`${cover.path}: recorded ${cover.sha256 ?? 'null'}, current ${current}${diff}`);
  }
  if (problems.length === 0) return { ok: true, message: '' };
  return {
    ok: false,
    message: [
      'A file this model covers changed since the model was last checked.',
      ...problems,
      'Re-read the model against the change; when the checks give the expected verdicts, write the current sha256 into sync.covers and the commit into sync.commit (docs/formal/README.md).',
    ].join('\n'),
  };
}

// tla-ts の探索は同じスレッドの中では止められないので、worker で流して上限で terminate する。
// worker のコードは CommonJS の文字列で、tla-ts は親で解決した URL から読み込む
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
import(workerData.url).then(async ({ check }) => {
  try {
    const result = await check({
      source: workerData.source,
      config: workerData.config,
      loadModule: (name) => workerData.modules[name],
    });
    parentPort.postMessage({
      status: result.status,
      name: result.violation ? result.violation.name : undefined,
      message: result.failure ? result.failure.message : undefined,
    });
  } catch (error) {
    parentPort.postMessage({ status: 'exception', message: String(error && error.message ? error.message : error) });
  }
});
`;

interface WorkerReply {
  status: string;
  name?: string;
  message?: string;
}

/**
 * TLA+ の仕様を tla-ts で検査する。success だけを hold、invariant-violation だけを violate とし、
 * それ以外 (deadlock、error、例外、時間切れ) はすべて error にする。
 * modules は EXTENDS で読む同じディレクトリの .tla (名前 → 中身)。無い名前は tla-ts の標準モジュールを使う
 */
export function runTlaCheck(options: {
  source: string;
  config: string;
  modules: Readonly<Record<string, string>>;
  timeoutSec?: number;
}): Promise<TlaOutcome> {
  const timeoutSec = options.timeoutSec ?? DEFAULT_TIMEOUT_SEC;
  return new Promise((done) => {
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: {
        url: import.meta.resolve('tla-ts'),
        source: options.source,
        config: options.config,
        modules: options.modules,
      },
    });
    let settled = false;
    const finish = (outcome: TlaOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      done(outcome);
    };
    const timer = setTimeout(
      () => finish({ verdict: 'error', message: `timed out after ${timeoutSec} s` }),
      timeoutSec * 1000
    );
    worker.on('message', (reply: WorkerReply) => {
      if (reply.status === 'success') finish({ verdict: 'hold' });
      else if (reply.status === 'invariant-violation') {
        finish({
          verdict: 'violate',
          ...(reply.name === undefined ? {} : { violated: reply.name }),
        });
      } else {
        finish({
          verdict: 'error',
          message: `${reply.status}${reply.message ? `: ${reply.message}` : ''}`,
        });
      }
    });
    worker.on('error', (error: unknown) =>
      finish({
        verdict: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    );
    worker.on('exit', (code) =>
      finish({ verdict: 'error', message: `worker exited with code ${code}` })
    );
  });
}

/** 判定が check の expect と合うか。violate なら、違反した性質が property と同じであることも求める */
export function judgeOutcome(check: FormalCheck, outcome: TlaOutcome): Judgement {
  const head = `check ${check.id} (${check.model} with ${check.cfg})`;
  if (outcome.verdict === 'error') {
    return {
      ok: false,
      message: `${head}: the checker did not give hold or violate: ${outcome.message ?? ''}`,
    };
  }
  if (outcome.verdict !== check.expect) {
    const detail = outcome.violated === undefined ? '' : ` (${outcome.violated} is violated)`;
    return {
      ok: false,
      message: `${head}: expected ${check.expect}, got ${outcome.verdict}${detail}`,
    };
  }
  if (outcome.verdict === 'violate' && outcome.violated !== check.property) {
    return {
      ok: false,
      message: `${head}: expected ${check.property} to be violated, but ${outcome.violated ?? 'another property'} was`,
    };
  }
  return { ok: true, message: '' };
}
