// リリースの後半 (push の後) の純粋関数。ファイル・ネットワーク・子プロセスには触れない
// (入力は文字列、JSON、バイト列。tarball の gunzip は node:zlib の同期関数をバイト列に当てるだけ)。

import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import zlib from 'node:zlib';
import { checkPackedPackageJson, verifyManifest } from './release-check.ts';
import type {
  Check,
  ClassifiedStop,
  DistTag,
  PackageState,
  Published,
  RegistryResponse,
  ReleaseManifest,
  StopObservation,
  StopRoute,
} from './release-types.ts';

const ok = <T>(value: T): Check<T> => ({ ok: true, value });
const fail = (...errors: string[]): { ok: false; errors: string[] } => ({ ok: false, errors });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

const MIB = 1024 * 1024;

// 表示の無害化は release-check.ts に移した。既存の import 元を変えないために再公開する
export { createStreamSanitizer, sanitizeForTerminal } from './release-check.ts';

// --- 後半の引数の組み立て (npm / gh の固定の引数は実行器が足す) ---

const STAGE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RELEASE_TAG_PATTERN = /^v\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;
const REPO_API_PATH = 'repos/berlysia/kanbun-annotation';

export const GH_RUN_LIST_FIELDS: readonly string[] = [
  'databaseId',
  'headSha',
  'headBranch',
  'status',
  'conclusion',
  'workflowName',
];
export const GH_RUN_VIEW_FIELDS: readonly string[] = ['jobs', 'status', 'conclusion'];

// gh 2.45.0 の `gh run list --json` / `gh run view --json` が受け付けるフィールド (research §5b)。
// attempt はない。偽の gh が実物より広いと、使うフィールドが実物で通らなくても気づけないので、これで固定する
export const GH_245_LIST_ALLOWED: readonly string[] = [
  'conclusion',
  'createdAt',
  'databaseId',
  'displayTitle',
  'event',
  'headBranch',
  'headSha',
  'name',
  'number',
  'startedAt',
  'status',
  'updatedAt',
  'url',
  'workflowDatabaseId',
  'workflowName',
];
export const GH_245_VIEW_ALLOWED: readonly string[] = [...GH_245_LIST_ALLOWED, 'jobs'];

export function isSubsetOfAllowlist(
  fields: readonly string[],
  allowed: readonly string[]
): boolean {
  return fields.every((f) => allowed.includes(f));
}

function checkId(label: string, value: number): Check<string> {
  return isPositiveSafeInteger(value)
    ? ok(String(value))
    : fail(`${label} ${String(value)} is not a positive integer`);
}

function checkStageId(id: string): Check<string> {
  return STAGE_ID_PATTERN.test(id) ? ok(id) : fail(`stage id ${JSON.stringify(id)} is not a UUID`);
}

function withId(label: string, value: number, build: (id: string) => string[]): Check<string[]> {
  const id = checkId(label, value);
  return id.ok ? ok(build(id.value)) : id;
}

export function ghRunListArgs(tagCommit: string): string[] {
  return [
    'run',
    'list',
    '--workflow',
    'release.yml',
    '--commit',
    tagCommit,
    '--event',
    'push',
    '--limit',
    '20',
    '--json',
    GH_RUN_LIST_FIELDS.join(','),
  ];
}

export function ghRunViewArgs(runId: number): Check<string[]> {
  return withId('run id', runId, (id) => [
    'run',
    'view',
    id,
    '--json',
    GH_RUN_VIEW_FIELDS.join(','),
  ]);
}

export function ghRunAttemptArgs(runId: number): Check<string[]> {
  return withId('run id', runId, (id) => ['api', `${REPO_API_PATH}/actions/runs/${id}`]);
}

export function ghRunLogArgs(runId: number, jobId: number): Check<string[]> {
  const job = checkId('job id', jobId);
  if (!job.ok) return job;
  return withId('run id', runId, (id) => ['run', 'view', id, '--log', '--job', job.value]);
}

export function ghRunWatchArgs(runId: number): Check<string[]> {
  return withId('run id', runId, (id) => ['run', 'watch', id, '--exit-status']);
}

export function ghRunDownloadArgs(runId: number, dir: string): Check<string[]> {
  return withId('run id', runId, (id) => ['run', 'download', id, '-n', 'npm-tarball', '-D', dir]);
}

export function ghReleaseViewArgs(tag: string): Check<string[]> {
  return RELEASE_TAG_PATTERN.test(tag)
    ? ok(['release', 'view', tag])
    : fail(`tag ${JSON.stringify(tag)} is not v<semver>`);
}

export function npmViewVersionsArgs(name: string): string[] {
  return ['view', name, 'versions', '--json'];
}

export function npmViewDistArgs(name: string, version: string): string[] {
  return [
    'view',
    `${name}@${version}`,
    'dist-tags',
    'dist.integrity',
    'dist.attestations',
    '--json',
  ];
}

export function npmStageListArgs(name: string): string[] {
  return ['stage', 'list', name, '--json'];
}

export function npmStageDownloadArgs(stageId: string): Check<string[]> {
  const id = checkStageId(stageId);
  return id.ok ? ok(['stage', 'download', id.value]) : id;
}

export function npmStageApproveArgs(stageId: string): Check<string[]> {
  const id = checkStageId(stageId);
  return id.ok ? ok(['stage', 'approve', id.value]) : id;
}

// --- run の選択、job の結論、attempt (K10) ---

export type SelectRunResult =
  | { kind: 'found'; id: number; headBranch: string | null }
  | { kind: 'none' }
  | { kind: 'shape-unknown'; what: string };

export function selectRun(json: unknown, tagCommit: string): SelectRunResult {
  if (!Array.isArray(json))
    return { kind: 'shape-unknown', what: 'gh run list output is not an array' };
  let best: { id: number; headBranch: string | null } | undefined;
  for (const raw of json as unknown[]) {
    // 対象 (同じ commit の Release の run) だけを検査する。他の run の形の違いは無視する
    if (!isRecord(raw) || raw['headSha'] !== tagCommit || raw['workflowName'] !== 'Release')
      continue;
    const id = raw['databaseId'];
    if (!isPositiveSafeInteger(id)) {
      return { kind: 'shape-unknown', what: 'a Release run has no usable databaseId' };
    }
    const branch = raw['headBranch'];
    if (best === undefined || id > best.id) {
      best = { id, headBranch: typeof branch === 'string' ? branch : null };
    }
  }
  return best === undefined ? { kind: 'none' } : { kind: 'found', ...best };
}

// release.yml の job の表示名 (構造テストが release.yml の name: と照合する)
export const RELEASE_JOB_NAMES = {
  validate: 'Validate and pack',
  npmStage: 'Stage on npm',
  githubRelease: 'GitHub Release',
} as const;

export type JudgeJobsResult =
  | { kind: 'in-progress' }
  | { kind: 'ok'; validateJobId: number; githubRelease: 'success' | 'failure' }
  | { kind: 'job-failed'; job: 'validate' | 'npm-stage' }
  | { kind: 'shape-unknown'; what: string };

interface JobConclusions {
  validate: string;
  npmStage: string;
  githubRelease: string;
  validateJobId: number;
}

function readJobConclusions(jobs: unknown): JobConclusions | string {
  if (!Array.isArray(jobs) || jobs.length !== 3) return 'the run does not have exactly 3 jobs';
  const byName = new Map<string, Record<string, unknown>>();
  for (const job of jobs as unknown[]) {
    if (!isRecord(job) || typeof job['name'] !== 'string') return 'a job has no name';
    if (job['status'] !== 'completed') return `job ${job['name']} is not completed`;
    byName.set(job['name'], job);
  }
  const pickConclusion = (name: string): string | undefined => {
    const conclusion = byName.get(name)?.['conclusion'];
    return typeof conclusion === 'string' ? conclusion : undefined;
  };
  const validate = pickConclusion(RELEASE_JOB_NAMES.validate);
  const npmStage = pickConclusion(RELEASE_JOB_NAMES.npmStage);
  const githubRelease = pickConclusion(RELEASE_JOB_NAMES.githubRelease);
  const validateJobId = byName.get(RELEASE_JOB_NAMES.validate)?.['databaseId'];
  if (validate === undefined || npmStage === undefined || githubRelease === undefined) {
    return 'a job name is unknown or a job has no conclusion';
  }
  if (!isPositiveSafeInteger(validateJobId)) return 'the validate job has no usable databaseId';
  return { validate, npmStage, githubRelease, validateJobId };
}

function judgeConclusions(c: JobConclusions): JudgeJobsResult {
  const releaseConclusions = ['success', 'failure', 'skipped'];
  if (c.validate === 'success' && c.npmStage === 'success') {
    if (c.githubRelease === 'success' || c.githubRelease === 'failure') {
      return { kind: 'ok', validateJobId: c.validateJobId, githubRelease: c.githubRelease };
    }
  } else if (c.validate === 'success' && c.npmStage === 'failure') {
    // github-release は validate にだけ依存するので、npm-stage の失敗と独立に走る
    if (releaseConclusions.includes(c.githubRelease))
      return { kind: 'job-failed', job: 'npm-stage' };
  } else if (
    c.validate === 'failure' &&
    c.npmStage === 'skipped' &&
    c.githubRelease === 'skipped'
  ) {
    return { kind: 'job-failed', job: 'validate' };
  }
  return {
    kind: 'shape-unknown',
    what: `unexpected job conclusions: validate=${c.validate}, npm-stage=${c.npmStage}, github-release=${c.githubRelease}`,
  };
}

export function judgeJobs(json: unknown): JudgeJobsResult {
  if (!isRecord(json))
    return { kind: 'shape-unknown', what: 'gh run view output is not an object' };
  if (json['status'] !== 'completed') return { kind: 'in-progress' };
  const read = readJobConclusions(json['jobs']);
  if (typeof read === 'string') return { kind: 'shape-unknown', what: read };
  return judgeConclusions(read);
}

// re-run の検出用。run_attempt と job の databaseId の集合から文字列を作る
export function attemptKey(apiRun: unknown, viewJobs: unknown): Check<string> {
  const attempt = isRecord(apiRun) ? apiRun['run_attempt'] : undefined;
  if (!isPositiveSafeInteger(attempt)) return fail('run_attempt is not a positive integer');
  const jobs = isRecord(viewJobs) ? viewJobs['jobs'] : undefined;
  if (!Array.isArray(jobs)) return fail('gh run view output has no jobs array');
  const ids: number[] = [];
  for (const job of jobs as unknown[]) {
    const id = isRecord(job) ? job['databaseId'] : undefined;
    if (!isPositiveSafeInteger(id)) return fail('a job has no usable databaseId');
    ids.push(id);
  }
  return ok(`${attempt}:${ids.sort((a, b) => a - b).join(',')}`);
}

// --- log の manifest (K11 の 1、2) ---

export interface LogManifest {
  tag: string;
  version: string;
  distTag: DistTag;
  packages: { name: string; file: string; integrity: string }[];
}

export type LogManifestResult =
  | { kind: 'ok'; manifest: LogManifest }
  | { kind: 'shape-unknown'; what: string };

const SUMMARY_JOB = 'Validate and pack';
const SUMMARY_STEP = 'Print the release manifest';
const MANIFEST_HEADING = '## Release manifest';
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z(?: |$)/;
// ESC を文字クラスに書かず、String.fromCharCode で組み立てる (制御文字を正規表現のリテラルに置かない)
const ANSI_PATTERN = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;?]*[ -/]*[@-~]`, 'g');
const TABLE_ROW_PATTERN = /^\| (\d+) \| ([^|\s]+) \| ([^|\s]+) \| ([^|\s]+) \|$/;
const FILE_NAME_PATTERN = /^[A-Za-z0-9._-]+\.tgz$/;
const SHA512_PATTERN = /^sha512-[A-Za-z0-9+/]{86}==$/;
const TABLE_HEADER = '| # | name | file | integrity |';
const TABLE_SEPARATOR = '| --- | --- | --- | --- |';

// `<job 名>\t<step 名>\t[BOM]<時刻> <内容>` の行から、対象の step の内容だけを取り出す
function summaryStepContents(log: string): string[] {
  const contents: string[] = [];
  for (const rawLine of log.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    const first = line.indexOf('\t');
    const second = first < 0 ? -1 : line.indexOf('\t', first + 1);
    if (second < 0) continue;
    if (line.slice(0, first) !== SUMMARY_JOB || line.slice(first + 1, second) !== SUMMARY_STEP)
      continue;
    let content = line.slice(second + 1).replace(ANSI_PATTERN, '');
    if (content.startsWith('﻿')) content = content.slice(1);
    contents.push(content.replace(TIMESTAMP_PATTERN, ''));
  }
  return contents;
}

function parseTableRows(lines: readonly string[], count: number): LogManifest['packages'] | string {
  const rows: LogManifest['packages'] = [];
  for (const line of lines) {
    const m = TABLE_ROW_PATTERN.exec(line);
    if (!m) break;
    if (Number(m[1]) !== rows.length + 1) return `table row numbers are not 1..n (got ${m[1]})`;
    const [name, file, integrity] = [m[2] ?? '', m[3] ?? '', m[4] ?? ''];
    if (!FILE_NAME_PATTERN.test(file))
      return `file ${JSON.stringify(file)} is not a plain .tgz name`;
    if (!SHA512_PATTERN.test(integrity)) return `integrity for ${file} is not a sha512 base64`;
    rows.push({ name, file, integrity });
  }
  return rows.length === count ? rows : `the table has ${rows.length} rows, expected ${count}`;
}

function readLabeled(line: string | undefined, label: string): string | undefined {
  const prefix = `- ${label}: `;
  if (line === undefined || !line.startsWith(prefix)) return undefined;
  const value = line.slice(prefix.length);
  return /^\S+$/.test(value) ? value : undefined;
}

export function extractLogManifest(log: string, packageCount: number): LogManifestResult {
  const unknown = (what: string): LogManifestResult => ({ kind: 'shape-unknown', what });
  const contents = summaryStepContents(log);
  const headings = contents.flatMap((c, i) => (c === MANIFEST_HEADING ? [i] : []));
  if (headings.length !== 1) {
    return unknown(`"${MANIFEST_HEADING}" appears ${headings.length} times in the summary step`);
  }
  const at = (headings[0] ?? 0) + 1;
  const tag = readLabeled(contents[at], 'tag');
  const version = readLabeled(contents[at + 1], 'version');
  const distTag = readLabeled(contents[at + 2], 'distTag');
  if (tag === undefined || version === undefined) return unknown('tag or version line is missing');
  if (distTag !== 'latest' && distTag !== 'next')
    return unknown('distTag line is missing or unknown');
  if (contents[at + 3] !== '') return unknown('expected exactly one empty line after distTag');
  if (contents[at + 4] !== TABLE_HEADER || contents[at + 5] !== TABLE_SEPARATOR) {
    return unknown('table header or separator is missing');
  }
  const rows = parseTableRows(contents.slice(at + 6), packageCount);
  if (typeof rows === 'string') return unknown(rows);
  return { kind: 'ok', manifest: { tag, version, distTag, packages: rows } };
}

export type JudgeResult = { kind: 'ok' } | { kind: 'mismatch'; what: string };

export function judgeLogManifest(
  manifest: LogManifest,
  expected: { tag: string; version: string; distTag: DistTag; names: readonly string[] }
): JudgeResult {
  const mismatch = (what: string): JudgeResult => ({ kind: 'mismatch', what });
  if (manifest.tag !== expected.tag) {
    return mismatch(`log tag ${manifest.tag} differs from expected ${expected.tag}`);
  }
  if (manifest.version !== expected.version) {
    return mismatch(`log version ${manifest.version} differs from expected ${expected.version}`);
  }
  if (manifest.distTag !== expected.distTag) {
    return mismatch(`log distTag ${manifest.distTag} differs from expected ${expected.distTag}`);
  }
  const actual = manifest.packages.map((p) => p.name);
  if (actual.length !== expected.names.length || actual.some((n, i) => n !== expected.names[i])) {
    return mismatch(
      `log package list [${actual.join(', ')}] differs from expected [${expected.names.join(', ')}]`
    );
  }
  return { kind: 'ok' };
}

// --- stage の一覧 (K11 の 4) ---

export type PickStageResult =
  | { kind: 'one'; id: string }
  | { kind: 'none' }
  | { kind: 'many' }
  | { kind: 'shape-unknown'; what: string }
  | { kind: 'mismatch'; what: string };

function parseStageItems(raw: string): Record<string, unknown>[] | string {
  if (raw.trim() === '') return 'npm stage list output is empty';
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return 'npm stage list output is not JSON';
  }
  if (!Array.isArray(json)) return 'npm stage list output is not an array';
  const items: Record<string, unknown>[] = [];
  for (const item of json as unknown[]) {
    const valid =
      isRecord(item) &&
      typeof item['id'] === 'string' &&
      typeof item['packageName'] === 'string' &&
      typeof item['version'] === 'string';
    if (!valid) return 'a stage item lacks string id, packageName or version';
    items.push(item);
  }
  return items;
}

export function pickStage(
  raw: string,
  name: string,
  version: string,
  distTag: DistTag
): PickStageResult {
  const items = parseStageItems(raw);
  if (typeof items === 'string') return { kind: 'shape-unknown', what: items };
  const matching = items.filter((i) => i['packageName'] === name && i['version'] === version);
  const [only] = matching;
  if (only === undefined) return { kind: 'none' };
  if (matching.length > 1) return { kind: 'many' };
  const id = String(only['id']);
  if (!STAGE_ID_PATTERN.test(id)) {
    return {
      kind: 'mismatch',
      what: `stage id ${JSON.stringify(id)} is not a UUID (possible tampering)`,
    };
  }
  const tag = only['tag'];
  if (typeof tag !== 'string') {
    return { kind: 'shape-unknown', what: `stage item for ${name} has no string tag` };
  }
  if (tag !== distTag) {
    return { kind: 'mismatch', what: `stage tag ${tag} differs from expected ${distTag}` };
  }
  return { kind: 'one', id };
}

// --- tarball と artifact の検査 (K11 の 3、5、6) ---

export function sha512Integrity(bytes: Buffer): string {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
}

export type InspectResult =
  | { kind: 'ok' }
  | { kind: 'shape-unknown'; what: string }
  | { kind: 'mismatch'; what: string };

const MAX_TARBALL_BYTES = 10 * MIB;
const MAX_UNPACKED_BYTES = 50 * MIB;
const MAX_TAR_ENTRIES = 10_000;
const TAR_BLOCK = 512;

const GZIP_FHCRC = 2;
const GZIP_FEXTRA = 4;
const GZIP_FNAME = 8;
const GZIP_FCOMMENT = 16;
const GZIP_RESERVED = 0xe0;

const mismatch = (what: string): { kind: 'mismatch'; what: string } => ({ kind: 'mismatch', what });
const shapeUnknown = (what: string): { kind: 'shape-unknown'; what: string } => ({
  kind: 'shape-unknown',
  what,
});

function skipCString(bytes: Buffer, from: number): number | undefined {
  const end = bytes.indexOf(0, from);
  return end < 0 ? undefined : end + 1;
}

// RFC 1952 のヘッダを読み、deflate の開始位置を返す (壊れていれば undefined)
function gzipDeflateStart(bytes: Buffer): number | undefined {
  if (bytes.length < 18 || bytes[0] !== 0x1f || bytes[1] !== 0x8b || bytes[2] !== 8)
    return undefined;
  const flags = bytes[3] ?? 0;
  if ((flags & GZIP_RESERVED) !== 0) return undefined;
  let pos: number | undefined = 10;
  if ((flags & GZIP_FEXTRA) !== 0) {
    pos = pos + 2 > bytes.length ? undefined : pos + 2 + bytes.readUInt16LE(pos);
  }
  if (pos !== undefined && (flags & GZIP_FNAME) !== 0) pos = skipCString(bytes, pos);
  if (pos !== undefined && (flags & GZIP_FCOMMENT) !== 0) pos = skipCString(bytes, pos);
  if (pos !== undefined && (flags & GZIP_FHCRC) !== 0) pos += 2;
  return pos !== undefined && pos + 8 < bytes.length ? pos : undefined;
}

type Gunzipped = { ok: true; tar: Buffer } | { ok: false; what: string };

// Node の gunzip は複数の member を黙って連結するので、先に member が 1 つで余りがないことを
// 入力の消費量で確かめる (research §5b)。その後の gunzip が CRC32 と ISIZE を検証する
function gunzipSingleMember(bytes: Buffer): Gunzipped {
  const start = gzipDeflateStart(bytes);
  if (start === undefined) return { ok: false, what: 'gzip header is malformed' };
  let consumed: number;
  try {
    const raw = zlib.inflateRawSync(bytes.subarray(start), {
      info: true,
      maxOutputLength: MAX_UNPACKED_BYTES,
    }) as unknown as { engine: { bytesWritten: number } };
    consumed = raw.engine.bytesWritten;
  } catch (error) {
    return {
      ok: false,
      what: `gzip stream cannot be inflated within the limit: ${errorText(error)}`,
    };
  }
  if (start + consumed + 8 !== bytes.length) {
    return { ok: false, what: 'gzip is not exactly one member (extra members or trailing bytes)' };
  }
  try {
    return { ok: true, tar: zlib.gunzipSync(bytes, { maxOutputLength: MAX_UNPACKED_BYTES }) };
  } catch (error) {
    return { ok: false, what: `gzip trailer check failed: ${errorText(error)}` };
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface TarFile {
  path: string;
  dir: boolean;
  content: Buffer;
}

type TarParse =
  | { kind: 'ok'; entries: TarFile[] }
  | { kind: 'mismatch' | 'shape-unknown'; what: string };

// 8 進の数値フィールド。末尾の NUL / 空白、先頭の空白は許す。それ以外は undefined
function parseOctalField(field: Buffer): number | undefined {
  let end = field.length;
  while (end > 0 && (field[end - 1] === 0 || field[end - 1] === 0x20)) end--;
  const text = field.subarray(0, end).toString('latin1').replace(/^ +/, '');
  return /^[0-7]+$/.test(text) ? Number.parseInt(text, 8) : undefined;
}

function checksumMatches(block: Buffer): boolean {
  const recorded = parseOctalField(block.subarray(148, 156));
  if (recorded === undefined) return false;
  let sum = 0;
  for (let i = 0; i < TAR_BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : (block[i] ?? 0);
  return sum === recorded;
}

// NUL で終わる固定長の文字列。最初の NUL の後ろに非 0 のバイトがあれば undefined (パスの偽装)
function readCString(block: Buffer, from: number, to: number): string | undefined {
  const field = block.subarray(from, to);
  const end = field.indexOf(0);
  if (end < 0) return field.toString('utf8');
  return field.subarray(end).some((b) => b !== 0)
    ? undefined
    : field.subarray(0, end).toString('utf8');
}

type TarHeader =
  | { kind: 'ok'; path: string; dir: boolean; size: number }
  | { kind: 'mismatch' | 'shape-unknown'; what: string };

function classifyTypeflag(flag: string): 'file' | 'dir' | 'shape-unknown' | 'mismatch' {
  if (flag === '0' || flag === '\0') return 'file';
  if (flag === '5') return 'dir';
  return 'xgLK'.includes(flag) ? 'shape-unknown' : 'mismatch';
}

function readTarSize(block: Buffer): number | string {
  if (((block[124] ?? 0) & 0x80) !== 0) return 'size field is base-256';
  const size = parseOctalField(block.subarray(124, 136));
  return size ?? 'size field is not an octal string';
}

function readTarHeader(block: Buffer): TarHeader {
  if (!checksumMatches(block)) return mismatch('tar header checksum does not match');
  if (
    block.subarray(257, 263).toString('latin1') !== 'ustar\0' ||
    block.subarray(263, 265).toString('latin1') !== '00'
  ) {
    return shapeUnknown('tar magic/version is not ustar\\0 + 00');
  }
  const size = readTarSize(block);
  if (typeof size === 'string') return shapeUnknown(size);
  const type = classifyTypeflag(String.fromCharCode(block[156] ?? 0));
  if (type === 'shape-unknown') return shapeUnknown('tar entry type is pax/GNU long name');
  if (type === 'mismatch') return mismatch('tar entry is neither a regular file nor a directory');
  if (type === 'dir' && size !== 0) return mismatch('tar directory entry has a non-zero size');
  const name = readCString(block, 0, 100);
  const prefix = readCString(block, 345, 500);
  if (name === undefined || prefix === undefined) return mismatch('tar path contains a NUL');
  return {
    kind: 'ok',
    path: prefix === '' ? name : `${prefix}/${name}`,
    dir: type === 'dir',
    size,
  };
}

function checkTarEnd(tar: Buffer, offset: number): TarParse | undefined {
  const rest = tar.subarray(offset);
  if (rest.length < 2 * TAR_BLOCK) return mismatch('tar has fewer than two end-of-archive blocks');
  return rest.some((b) => b !== 0)
    ? mismatch('tar has data after the end-of-archive blocks')
    : undefined;
}

function parseTar(tar: Buffer): TarParse {
  const entries: TarFile[] = [];
  let offset = 0;
  for (;;) {
    if (offset + TAR_BLOCK > tar.length) return mismatch('tar ends without end-of-archive blocks');
    const block = tar.subarray(offset, offset + TAR_BLOCK);
    if (block.every((b) => b === 0)) {
      return checkTarEnd(tar, offset) ?? { kind: 'ok', entries };
    }
    if (entries.length >= MAX_TAR_ENTRIES)
      return mismatch(`tar has more than ${MAX_TAR_ENTRIES} entries`);
    const header = readTarHeader(block);
    if (header.kind !== 'ok') return header;
    const dataStart = offset + TAR_BLOCK;
    const padded = Math.ceil(header.size / TAR_BLOCK) * TAR_BLOCK;
    if (dataStart + padded > tar.length)
      return mismatch('tar entry size exceeds the remaining bytes');
    entries.push({
      path: header.path,
      dir: header.dir,
      content: tar.subarray(dataStart, dataStart + header.size),
    });
    offset = dataStart + padded;
  }
}

const ALLOWED_ROOT_FILES = ['package.json', 'README.md', 'LICENSE', 'CHANGELOG.md'];

// ディレクトリのパスは末尾の `/` を除いて返す。外れなら理由
function checkEntryPath(entry: TarFile): string | undefined {
  const { path } = entry;
  if (path.startsWith('/') || path.includes('\\') || path.includes('//')) {
    return `unsafe path ${JSON.stringify(path)}`;
  }
  const bare = entry.dir && path.endsWith('/') ? path.slice(0, -1) : path;
  if (bare.split('/').some((s) => s === '' || s === '.' || s === '..')) {
    return `path ${JSON.stringify(path)} has an empty, . or .. segment`;
  }
  if (entry.dir) {
    const inside =
      bare === 'package' || bare === 'package/dist' || bare.startsWith('package/dist/');
    return inside ? undefined : `directory ${JSON.stringify(path)} is outside package/dist`;
  }
  if (!path.startsWith('package/')) return `path ${JSON.stringify(path)} is outside package/`;
  const rel = path.slice('package/'.length);
  const allowed =
    ALLOWED_ROOT_FILES.includes(rel) || (rel.startsWith('dist/') && rel.length > 'dist/'.length);
  return allowed ? undefined : `file ${JSON.stringify(path)} is not in the allowed set`;
}

function checkTarPaths(entries: readonly TarFile[]): string | undefined {
  const seen = new Set<string>();
  for (const entry of entries) {
    const problem = checkEntryPath(entry);
    if (problem !== undefined) return problem;
    const key = (
      entry.dir && entry.path.endsWith('/') ? entry.path.slice(0, -1) : entry.path
    ).toLowerCase();
    if (seen.has(key)) return `duplicate path ${JSON.stringify(entry.path)} (case-insensitive)`;
    seen.add(key);
  }
  return undefined;
}

function checkTarPackageJson(
  entries: readonly TarFile[],
  expected: { name: string; version: string; internalNames: readonly string[] }
): InspectResult {
  const files = entries.filter((e) => !e.dir && e.path === 'package/package.json');
  const [only] = files;
  if (files.length !== 1 || only === undefined) {
    return mismatch('package/package.json is not present exactly once as a regular file');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(only.content.toString('utf8'));
  } catch {
    return mismatch('package/package.json is not JSON');
  }
  const check = checkPackedPackageJson(expected, parsed);
  return check.ok ? { kind: 'ok' } : mismatch(check.errors.join('; '));
}

export function inspectTarball(
  bytes: Buffer,
  expected: { name: string; version: string; internalNames: readonly string[] }
): InspectResult {
  if (bytes.length > MAX_TARBALL_BYTES)
    return mismatch(`tarball is larger than ${MAX_TARBALL_BYTES} bytes`);
  const gunzipped = gunzipSingleMember(bytes);
  if (!gunzipped.ok) return mismatch(gunzipped.what);
  const parsed = parseTar(gunzipped.tar);
  if (parsed.kind !== 'ok') return parsed;
  const pathProblem = checkTarPaths(parsed.entries);
  if (pathProblem !== undefined) return mismatch(pathProblem);
  return checkTarPackageJson(parsed.entries, expected);
}

export interface ArtifactEntry {
  name: string;
  kind: 'file' | 'dir' | 'symlink' | 'other';
  size: number;
}

export function judgeArtifactDir(
  entries: readonly ArtifactEntry[],
  expectedFiles: readonly string[]
): JudgeResult {
  const limits = new Map<string, number>([['manifest.json', MIB]]);
  for (const file of expectedFiles) limits.set(file, MAX_TARBALL_BYTES);
  const seen = new Set<string>();
  for (const e of entries) {
    const limit = limits.get(e.name);
    if (e.kind !== 'file')
      return { kind: 'mismatch', what: `artifact entry ${e.name} is a ${e.kind}` };
    if (limit === undefined)
      return { kind: 'mismatch', what: `artifact has an unexpected file ${e.name}` };
    if (seen.has(e.name)) return { kind: 'mismatch', what: `artifact lists ${e.name} twice` };
    if (e.size > limit)
      return { kind: 'mismatch', what: `artifact file ${e.name} is larger than ${limit} bytes` };
    seen.add(e.name);
  }
  const missing = [...limits.keys()].filter((n) => !seen.has(n));
  return missing.length > 0
    ? { kind: 'mismatch', what: `artifact lacks ${missing.join(', ')}` }
    : { kind: 'ok' };
}

export function compareArtifactWithLog(
  artifactManifest: ReleaseManifest,
  logManifest: LogManifest
): JudgeResult {
  if (artifactManifest.packages.length !== logManifest.packages.length) {
    return { kind: 'mismatch', what: 'artifact and log list a different number of packages' };
  }
  for (const fromLog of logManifest.packages) {
    const fromArtifact = artifactManifest.packages.find((p) => p.name === fromLog.name);
    if (fromArtifact === undefined) {
      return { kind: 'mismatch', what: `artifact manifest lacks ${fromLog.name}` };
    }
    if (fromArtifact.file !== fromLog.file || fromArtifact.integrity !== fromLog.integrity) {
      return {
        kind: 'mismatch',
        what: `${fromLog.name}: artifact manifest differs from the log (file or integrity)`,
      };
    }
  }
  return { kind: 'ok' };
}

// --- パッケージの状態、approve の計画、stage の判定の合成 (K11、K12) ---

export function classifyPackageState(input: {
  name: string;
  version: string;
  view: RegistryResponse;
  publishedIntegrity: string | undefined;
  stage: PickStageResult;
  logIntegrity: string;
}): Check<PackageState> {
  const { name, version, view, publishedIntegrity, stage, logIntegrity } = input;
  if (view.kind === 'error') return fail(`${name}: registry lookup failed: ${view.message}`);
  if (view.kind === 'found' && view.versions.includes(version)) {
    // 公開済みなら stage list の形の違いで詰まらない
    if (publishedIntegrity === undefined) {
      return fail(`${name}@${version} is published but its dist.integrity could not be read`);
    }
    return ok({
      name,
      kind: publishedIntegrity === logIntegrity ? 'published' : 'published-wrong',
    });
  }
  switch (stage.kind) {
    case 'one':
      return ok({ name, kind: 'staged', stageId: stage.id });
    case 'many':
      return ok({ name, kind: 'staged-ambiguous' });
    case 'none':
      return ok({ name, kind: 'missing' });
    case 'shape-unknown':
    case 'mismatch':
      return fail(`${name}: stage list ${stage.kind}: ${stage.what}`);
  }
}

type WithoutPublished<T> = T extends unknown ? Omit<T, 'published'> : never;

export type ApprovePlan =
  | { kind: 'approve'; targets: { name: string; stageId: string }[] }
  | { kind: 'done' }
  | { kind: 'wait'; names: string[] }
  | { kind: 'stop'; observation: StopObservation };

const isPublishedState = (s: PackageState): boolean =>
  s.kind === 'published' || s.kind === 'published-wrong';

// 上から順に最初に当たる行を使う (spec K12)。非連続の判定は missing の待機より先に行う
export function planApprove(states: readonly PackageState[], waitExhausted: boolean): ApprovePlan {
  const published = states.filter(isPublishedState).map((s) => s.name);
  const stop = (observation: WithoutPublished<StopObservation>): ApprovePlan => ({
    kind: 'stop',
    observation: { ...observation, published } as StopObservation,
  });
  const wrong = states.find((s) => s.kind === 'published-wrong');
  if (wrong) return stop({ kind: 'published-wrong', name: wrong.name });
  const ambiguous = states.find((s) => s.kind === 'staged-ambiguous');
  if (ambiguous) {
    return stop({
      kind: 'staged-mismatch',
      name: ambiguous.name,
      what: `${ambiguous.name} has more than one staged item`,
    });
  }
  let lastPublished = -1;
  states.forEach((s, i) => {
    if (isPublishedState(s)) lastPublished = i;
  });
  const gaps = states.slice(0, Math.max(lastPublished, 0)).filter((s) => !isPublishedState(s));
  if (gaps.length > 0)
    return stop({ kind: 'published-out-of-order', names: gaps.map((s) => s.name) });
  const missing = states.filter((s) => s.kind === 'missing');
  if (missing.length > 0) {
    if (!waitExhausted) return { kind: 'wait', names: missing.map((s) => s.name) };
    if (missing.length === states.length) return stop({ kind: 'stage-none' });
    return stop({
      kind: 'staged-mismatch',
      what: `no staged item for ${missing.map((s) => s.name).join(', ')}`,
    });
  }
  const targets = states.flatMap((s) =>
    s.kind === 'staged' ? [{ name: s.name, stageId: s.stageId }] : []
  );
  return targets.length === 0 ? { kind: 'done' } : { kind: 'approve', targets };
}

export type JudgeStagedResult =
  | { kind: 'ok'; validatedIds: ReadonlyMap<string, string> }
  | { kind: 'shape-unknown'; what: string }
  | { kind: 'mismatch'; name?: string; what: string };

export interface StagedArtifact {
  entries: readonly ArtifactEntry[];
  manifest: unknown;
  files: readonly { file: string; integrity: string }[];
}

function judgeArtifact(
  artifact: StagedArtifact,
  logManifest: LogManifest,
  expected: { tag: string; names: readonly string[] }
): JudgeResult {
  const dir = judgeArtifactDir(
    artifact.entries,
    logManifest.packages.map((p) => p.file)
  );
  if (dir.kind !== 'ok') return dir;
  const verified = verifyManifest(artifact.manifest, artifact.files, expected);
  if (!verified.ok) return { kind: 'mismatch', what: verified.errors.join('; ') };
  return compareArtifactWithLog(verified.value, logManifest);
}

function judgeTarget(
  target: { name: string; tarball: Buffer },
  logManifest: LogManifest,
  expected: { version: string; names: readonly string[] }
): InspectResult {
  const fromLog = logManifest.packages.find((p) => p.name === target.name);
  if (fromLog === undefined) return mismatch(`${target.name} is not in the log manifest`);
  if (sha512Integrity(target.tarball) !== fromLog.integrity) {
    return mismatch(`${target.name}: staged tarball sha512 differs from the log manifest`);
  }
  return inspectTarball(target.tarball, {
    name: target.name,
    version: expected.version,
    internalNames: expected.names,
  });
}

// K11 の 2〜6 の合成。最初の外れを返す
export function judgeStaged(input: {
  logManifest: LogManifest;
  expected: { tag: string; version: string; distTag: DistTag; names: readonly string[] };
  artifact?: StagedArtifact;
  targets: readonly { name: string; stageId: string; tarball: Buffer }[];
}): JudgeStagedResult {
  const { logManifest, expected, artifact, targets } = input;
  const log = judgeLogManifest(logManifest, expected);
  if (log.kind !== 'ok') return log;
  if (artifact !== undefined) {
    const judged = judgeArtifact(artifact, logManifest, expected);
    if (judged.kind !== 'ok') return judged;
  }
  const validatedIds = new Map<string, string>();
  for (const target of targets) {
    const result = judgeTarget(target, logManifest, expected);
    if (result.kind === 'shape-unknown') {
      return { kind: 'shape-unknown', what: `${target.name}: ${result.what}` };
    }
    if (result.kind === 'mismatch')
      return { kind: 'mismatch', name: target.name, what: result.what };
    validatedIds.set(target.name, target.stageId);
  }
  return { kind: 'ok', validatedIds };
}

// --- E409、approve の後の判定 (K13、K14) ---

export function isE409(stderr: string): boolean {
  return /\bE409\b/.test(stderr);
}

export interface ViewDist {
  distTags: Readonly<Record<string, string>>;
  integrity: string;
  hasAttestations: boolean;
}

export type ParseViewDistResult =
  | { kind: 'ok'; dist: ViewDist }
  | { kind: 'shape-unknown'; what: string };

// `npm view <name>@<ver> dist-tags dist.integrity dist.attestations --json` は要素 1 つの配列で、
// "dist.integrity" はドット付きの 1 つのキー、"dist.attestations" は無いときキーごと省かれる (research §5b)
export function parseViewDist(raw: string): ParseViewDistResult {
  const unknown = (what: string): ParseViewDistResult => ({ kind: 'shape-unknown', what });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return unknown('npm view output is not JSON');
  }
  const element: unknown = Array.isArray(json) && json.length === 1 ? json[0] : undefined;
  if (!isRecord(element)) return unknown('npm view output is not an array with exactly one object');
  const tags = element['dist-tags'];
  const integrity = element['dist.integrity'];
  if (!isRecord(tags) || !Object.values(tags).every((v) => typeof v === 'string')) {
    return unknown('"dist-tags" is not a dictionary of strings');
  }
  if (typeof integrity !== 'string') return unknown('"dist.integrity" is not a string');
  return {
    kind: 'ok',
    dist: {
      distTags: Object.fromEntries(Object.entries(tags) as [string, string][]),
      integrity,
      hasAttestations: Object.hasOwn(element, 'dist.attestations'),
    },
  };
}

export function judgePostCheck(
  items: readonly { name: string; dist: ParseViewDistResult }[],
  expected: { version: string; distTag: DistTag; integrities: ReadonlyMap<string, string> },
  releaseExists: boolean,
  published: Published
): StopObservation[] {
  const out: StopObservation[] = [];
  const add = (
    check: 'integrity' | 'dist-tag' | 'release' | 'shape',
    what: string,
    name?: string
  ): void => {
    out.push({
      kind: 'post-check',
      check,
      ...(name === undefined ? {} : { name }),
      what,
      published,
    });
  };
  const seen = new Set<string>();
  for (const { name, dist } of items) {
    seen.add(name);
    if (dist.kind !== 'ok') {
      add('shape', `${name}: ${dist.what}`, name);
      continue;
    }
    const wanted = expected.integrities.get(name);
    if (wanted === undefined || dist.dist.integrity !== wanted) {
      add(
        'integrity',
        `${name}@${expected.version}: dist.integrity differs from the validated one`,
        name
      );
    }
    const tags = dist.dist.distTags;
    if (!Object.hasOwn(tags, expected.distTag) || tags[expected.distTag] !== expected.version) {
      add('dist-tag', `${name}: dist-tag ${expected.distTag} is not ${expected.version}`, name);
    }
  }
  for (const name of expected.integrities.keys()) {
    if (!seen.has(name)) add('shape', `${name}: no npm view result`, name);
  }
  if (!releaseExists) add('release', 'the GitHub Release does not exist');
  return out;
}

// --- 止まるときの分類 (K15) ---

// route ごとの releasing.md の見出しの接頭辞 (見出しは後ろに説明が続く)
export const RELEASING_SECTIONS: Readonly<Record<StopRoute, string>> = {
  F1: '### F1:',
  F2: '### F2:',
  F3: '### F3:',
  F4: '### F4:',
  rerun: '## 止まったとき',
  manual: '## 手作業の手順',
};

interface Cell {
  route: StopRoute;
  // F3 (部分公開) の可能性を併記するか
  f3: boolean;
}

const cell = (route: StopRoute): Cell => ({ route, f3: false });
// 表の「—」(通常は起きない組み合わせ) と「manual (F3 の可能性)」
const MANUAL_F3: Cell = { route: 'manual', f3: true };

interface StopRow {
  zero: Cell;
  some: Cell;
  reason: string;
  next: Partial<Record<StopRoute, string>> & { fallback: string };
}

const BY_HAND =
  'Check the published packages and the stage list by hand, then follow the manual steps in releasing.md';
const RERUN_NEXT = { fallback: 'Run the same command again' };

function postCheckRow(obs: Extract<StopObservation, { kind: 'post-check' }>): StopRow {
  const reason = `post-approve check (${obs.check}) failed: ${obs.what}`;
  switch (obs.check) {
    case 'integrity':
      return {
        zero: MANUAL_F3,
        some: cell('F3'),
        reason,
        next: {
          F3: 'The published tarball differs from the validated bytes; deprecate and release a patch (F3)',
          fallback: BY_HAND,
        },
      };
    case 'dist-tag':
      return {
        zero: MANUAL_F3,
        some: cell('manual'),
        reason,
        next: { fallback: 'Fix the dist-tag with npm dist-tag add' },
      };
    case 'release':
      return {
        zero: MANUAL_F3,
        some: cell('rerun'),
        reason,
        next: {
          rerun:
            'Re-run the github-release job; if the tag is re-created, delete the Release first',
          fallback: BY_HAND,
        },
      };
    case 'shape':
      return {
        zero: cell('manual'),
        some: MANUAL_F3,
        reason,
        next: { fallback: 'Read the saved raw output, record it in ADR-029, and continue by hand' },
      };
  }
}

const F_FAILURE_NEXT = {
  F1: 'Fix the cause and retag with --tag-only (F1); if the cause is release.yml, follow F4',
  F2: 'Check the stage list, reject what is staged, then retag (F1 steps 3-4)',
  F3: 'Reject what is unapproved, deprecate what is published, and release a patch (F3)',
  F4: 'Check the workflow trigger conditions (F4)',
  fallback: BY_HAND,
};

function describeStop(obs: StopObservation): StopRow {
  switch (obs.kind) {
    case 'run-not-found':
      return {
        zero: cell('F4'),
        some: MANUAL_F3,
        reason: 'No Release workflow run was found for the tag commit within the wait',
        next: F_FAILURE_NEXT,
      };
    case 'job-failed':
      return obs.job === 'validate'
        ? {
            zero: cell('F1'),
            some: MANUAL_F3,
            reason: 'The validate job failed',
            next: F_FAILURE_NEXT,
          }
        : {
            zero: cell('F2'),
            some: cell('F3'),
            reason: 'The npm-stage job failed',
            next: F_FAILURE_NEXT,
          };
    case 'unexpected-run-shape':
    case 'shape-unknown':
      return {
        zero: cell('manual'),
        some: MANUAL_F3,
        reason: `Unexpected output shape: ${obs.what}`,
        next: { fallback: 'Read the saved raw output, record it in ADR-029, and continue by hand' },
      };
    case 'staged-mismatch':
      return {
        zero: cell('F2'),
        some: cell('F3'),
        reason: `Staged content check failed: ${obs.what}`,
        next: F_FAILURE_NEXT,
      };
    case 'stage-none':
      return {
        zero: cell('F2'),
        some: MANUAL_F3,
        reason: 'No package is staged',
        next: {
          F2: 'Nothing to reject; check the npm-stage job log and retag (F1 steps 3-4)',
          fallback: BY_HAND,
        },
      };
    case 'published-out-of-order':
      return {
        zero: MANUAL_F3,
        some: cell('F3'),
        reason: `Published packages are not a prefix of the manifest order (unpublished before the last published: ${obs.names.join(', ')})`,
        next: {
          fallback:
            'Rerun in a few minutes (the registry read may lag); if it is unchanged, follow F3',
        },
      };
    case 'published-wrong':
      return {
        zero: MANUAL_F3,
        some: cell('F3'),
        reason: `${obs.name} is published with an integrity that differs from the validated one`,
        next: { F3: F_FAILURE_NEXT.F3, fallback: BY_HAND },
      };
    case 'approve-failed':
      return {
        zero: cell('rerun'),
        some: cell('rerun'),
        reason: `npm stage approve failed for ${obs.name}: ${obs.what}`,
        next: RERUN_NEXT,
      };
    case 'interrupted':
      return { zero: cell('rerun'), some: cell('rerun'), reason: 'Interrupted', next: RERUN_NEXT };
    case 'attempt-changed':
      return {
        zero: cell('rerun'),
        some: cell('rerun'),
        reason: 'The workflow run was re-run during the check',
        next: RERUN_NEXT,
      };
    case 'command-failed':
      return {
        zero: cell('rerun'),
        some: cell('rerun'),
        reason: `A command failed: ${obs.what}`,
        next: { fallback: 'Run the same command again; if it repeats, read the output' },
      };
    case 'trust-eotp':
      return {
        zero: cell('rerun'),
        some: cell('rerun'),
        reason: 'The npm 2FA skip expired (or was not chosen)',
        next: {
          fallback:
            'Run again and choose "skip 2FA for 5 minutes" in the interactive authentication',
        },
      };
    case 'trust-mismatch':
      return {
        zero: cell('manual'),
        some: cell('manual'),
        reason: `Trusted publisher settings differ: ${obs.what}`,
        next: {
          fallback: 'Read the six outputs, then follow steps 3 / 3a of the one-time migration',
        },
      };
    case 'post-check':
      return postCheckRow(obs);
    default:
      return assertNever(obs);
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled stop observation: ${JSON.stringify(value)}`);
}

function resolveCell(row: StopRow, published: Published): Cell {
  if (published === 'unknown') {
    // 公開の有無が分からない: 0 でも 1 以上でも同じ route ならそれ、分かれるなら手作業 (F3 の可能性を併記)
    return { route: row.zero.route === row.some.route ? row.zero.route : 'manual', f3: true };
  }
  return published.length === 0 ? row.zero : row.some;
}

export function classifyStop(obs: StopObservation): ClassifiedStop {
  const row = describeStop(obs);
  const { route, f3 } = resolveCell(row, obs.published);
  return {
    route,
    reason: row.reason,
    next: row.next[route] ?? row.next.fallback,
    section: RELEASING_SECTIONS[route],
    mayBeF3: f3,
  };
}

const ROUTE_RANK: Readonly<Record<StopRoute, number>> = {
  F3: 3,
  manual: 2,
  rerun: 1,
  F1: 0,
  F2: 0,
  F4: 0,
};

// K14 の先頭に出す代表: F3 > manual > rerun > F1 / F2 / F4 (同順位は先のもの)
export function pickRepresentative(
  stops: readonly [ClassifiedStop, ...ClassifiedStop[]]
): ClassifiedStop {
  let best = stops[0];
  for (const s of stops) {
    if (ROUTE_RANK[s.route] > ROUTE_RANK[best.route]) best = s;
  }
  return best;
}

// --- 一時ディレクトリの削除の判定 (K11) ---

const TEMP_PREFIX = 'kanbun-release-';

// 再帰の削除が、引数の取り違えで別の場所に向かないための多重防御
export function isSafeTempPath(
  candidate: string,
  created: ReadonlySet<string>,
  tmpRoot: string
): boolean {
  return (
    posix.isAbsolute(candidate) &&
    created.has(candidate) &&
    !candidate.split('/').includes('..') &&
    !candidate.endsWith('/') &&
    posix.dirname(candidate) === tmpRoot &&
    posix.basename(candidate).startsWith(TEMP_PREFIX)
  );
}
