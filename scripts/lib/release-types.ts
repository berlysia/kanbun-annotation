// リリース script 群が共有する型と、型と一緒に使う定数。何も import しない (純粋関数と、結線する側の両方がここを向く)。

export type Check<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export interface WorkspacePackage {
  name: string;
  dir: string;
  version: string;
  private: boolean;
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
}

export type RegistryResponse =
  | { kind: 'found'; versions: string[]; latest: string | undefined }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string };

export type ReleaseLookup =
  | { kind: 'found' }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string };

export type DistTag = 'latest' | 'next';

export interface ReleaseManifest {
  schemaVersion: 1;
  tag: string;
  version: string;
  distTag: DistTag;
  packages: { name: string; file: string; integrity: string }[];
}

export interface GitResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
  // pipe の上限を超えて子を止めたとき。シグナルで終わった場合と区別するための印
  exceeded?: true;
}

// 前半の子のコマンドの失敗。停止の表示が error の欄を作る材料 (外部の文字列は stderr だけ)
export interface ChildFailure {
  command: string; // `<cmd> <args>` (リポジトリが組み立てた文字列)
  status: number | null;
  stderr: string; // 保持した stderr (inherit のときは '')
  captured: boolean; // stderr を受けたか (inherit なら false)
  rerun?: string; // 段ごとに流した verify の失敗した段 (`pnpm <名前>`、package.json の値)
}

// 子の出力の解析の失敗 (changeset status の JSON など) は failure 無しで errors だけ
export type FrontCheck<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[]; failure?: ChildFailure };

export type StopRoute = 'F1' | 'F2' | 'F3' | 'F4' | 'rerun' | 'manual';

// 'unknown' は公開の有無を観測できなかったこと (0 件とは区別する)
export type Published = readonly string[] | 'unknown';

export type PackageState =
  | { name: string; kind: 'staged'; stageId: string }
  | { name: string; kind: 'published' | 'published-wrong' | 'staged-ambiguous' | 'missing' };

// 失敗したコマンドの stderr を運ぶ (停止の表示が error の欄に使う)
export interface TrustFailure {
  command: string;
  status: number | null;
  stderr: string;
}

export type TrustResult =
  | { kind: 'ok' }
  | { kind: 'eotp'; failure?: TrustFailure }
  | { kind: 'command-failed'; what: string; failure?: TrustFailure }
  | { kind: 'shape-unknown'; what: string; rawPath?: string }
  | { kind: 'mismatch'; what: string };

export type ErrorSource = 'local-stderr' | 'job-log' | 'none';
export type ErrorTool = 'npm' | 'gh' | 'git' | 'other';

export interface ErrorExcerpt {
  command: string; // リポジトリが組み立てた文字列。外部の値を含まない
  exit: number | null;
  // error を作った箇所が知っている値。停止の型 (FrontStop、entry-stopped、ClassifiedStop) は
  // error を運ぶので、diagnose はここから StopSite を組み立てられる
  source: ErrorSource;
  tool: ErrorTool;
  lines: readonly string[]; // 表示する行 (切り出しを通した値)
  matched: readonly string[]; // 規則に渡す行
  logUnreadable?: true;
  rawPath?: string;
}

// decideEntry / decideEntryWithStatus が止まる行。RC の stopAt の引数もこの型にし、行の一覧を型で固定する
export const ENTRY_STOP_ROWS = [0, 2, 3, 4, 5, 6, 9, 10, 12, 13, 14] as const;
export type EntryStopRow = (typeof ENTRY_STOP_ROWS)[number];
export const NO_COMMAND = '(no command)';

export type EntryWhere =
  | { kind: 'row'; row: EntryStopRow }
  | { kind: 'flags' | 'tty' | 'tooling' | 'repo' | 'pre-state' | 'dirty' | 'after-push-input' };

export type FrontStage =
  | '1 prerequisites'
  | '2 versioning'
  | '3 publish preconditions'
  | '4 consumer test'
  | '5 confirmation'
  | '6 record'
  | '7 push';

export type AfterPushSite = {
  side: 'after-push';
  where: StopObservation['kind'];
  job?: 'validate' | 'npm-stage'; // job-failed のとき
  check?: 'integrity' | 'dist-tag' | 'release' | 'shape'; // post-check のとき
};

export type StopSite =
  | { side: 'entry'; where: EntryWhere }
  | { side: 'front'; where: FrontStage }
  | AfterPushSite;

export interface Cause {
  id: string;
  cause: string;
  check: string;
}

export type NonEmpty<T> = readonly [T, ...T[]];

export interface StopReport {
  headline: string;
  error: ErrorExcerpt;
  causes: NonEmpty<Cause>;
  remedies: NonEmpty<string>;
  section?: string;
  notes: readonly string[];
}

// plan-2 が ReleaseOutcome の front-stopped に載せる。それまで knip の未使用の export に数えないための @public
/** @public */
export interface FrontStop {
  stage: FrontStage;
  reason: string;
  error: ErrorExcerpt;
  recovery?: string;
  rerun?: string; // 段ごとに流した verify の失敗した段 (`pnpm <名前>`、package.json の値)
}

export type StopObservation = { published: Published; error?: ErrorExcerpt } & (
  | { kind: 'run-not-found' }
  | { kind: 'job-failed'; job: 'validate' | 'npm-stage' }
  | { kind: 'unexpected-run-shape'; what: string; rawPath?: string }
  | { kind: 'shape-unknown'; what: string; rawPath?: string }
  | { kind: 'staged-mismatch'; name?: string; what: string }
  | { kind: 'stage-none' }
  | { kind: 'published-out-of-order'; names: readonly string[] }
  | { kind: 'published-wrong'; name: string }
  | { kind: 'approve-failed'; name: string; what: string }
  | { kind: 'interrupted' }
  | { kind: 'attempt-changed' }
  | { kind: 'command-failed'; what: string }
  | { kind: 'trust-eotp' }
  | { kind: 'trust-mismatch'; what: string }
  | {
      kind: 'post-check';
      check: 'integrity' | 'dist-tag' | 'release' | 'shape';
      name?: string;
      what: string;
    }
);

export interface ClassifiedStop {
  route: StopRoute;
  reason: string;
  next: string;
  section: string;
  mayBeF3: boolean;
  site: AfterPushSite;
  error?: ErrorExcerpt;
  what?: string;
}

export type AfterPushResult =
  | { kind: 'stopped'; stop: ClassifiedStop }
  | { kind: 'declined' }
  | { kind: 'post-check-failed'; stops: readonly [ClassifiedStop, ...ClassifiedStop[]] }
  | { kind: 'completed' };

export type Outcome =
  | { kind: 'entry-stopped'; reason: string }
  | { kind: 'front-stopped'; stage: string; reason: string; recovery?: string }
  | { kind: 'after-push-stopped'; stop: ClassifiedStop }
  | { kind: 'declined' }
  | { kind: 'post-check-failed'; stops: readonly [ClassifiedStop, ...ClassifiedStop[]] }
  | { kind: 'completed' };
