// リリース script 群が共有する型。何も import しない (純粋関数と、結線する側の両方がここを向く)。

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
}

export type StopRoute = 'F1' | 'F2' | 'F3' | 'F4' | 'rerun' | 'manual';

// 'unknown' は公開の有無を観測できなかったこと (0 件とは区別する)
export type Published = readonly string[] | 'unknown';

export type PackageState =
  | { name: string; kind: 'staged'; stageId: string }
  | { name: string; kind: 'published' | 'published-wrong' | 'staged-ambiguous' | 'missing' };

export type TrustResult =
  | { kind: 'ok' }
  | { kind: 'eotp' }
  | { kind: 'command-failed'; what: string }
  | { kind: 'shape-unknown'; what: string; rawPath?: string }
  | { kind: 'mismatch'; what: string };

export type StopObservation = { published: Published } & (
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
