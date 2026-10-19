// release が止まったときの表示の純粋関数。ファイル・ネットワーク・子プロセスには触れない。
// import できるのは release-check.ts と release-sanitize.ts と release-types.ts だけ (構造テストが固定する)。

import { removeEscapeSequences, redactSecrets } from './release-sanitize.ts';
import { sanitizeForTerminal } from './release-check.ts';
import { NO_COMMAND } from './release-types.ts';
import type {
  Cause,
  EntryStopRow,
  EntryWhere,
  ErrorExcerpt,
  ErrorTool,
  FrontStage,
  NonEmpty,
  StopObservation,
  StopReport,
  StopSite,
} from './release-types.ts';

// --- 行の切り出し (エラーの欄に出す外部の文字列) ---
// 順序: 1 行を先に切る → (job の log なら) 接頭辞を除く → エスケープ列を除く → 制御文字を除く
// → secret をマスクする → 行を選ぶ → 最後の 12 行を 300 コードポイントで切る。
// マスクは選別と切り詰めの前に行う。切り詰めがトークンの途中に当たって断片が残るのを防ぐため。

const RAW_LINE_LIMIT = 4096;
const DISPLAY_LINE_LIMIT = 300;
const DISPLAY_LINE_COUNT = 12;

const LINE_BREAK = /\r\n|[\n\r\u{2028}\u{2029}]/u;
// `<job>\t<step>\t<BOM?><ISO 時刻> ` (実物は時刻の直前に BOM が入る)
const JOB_LOG_PREFIX = /^[^\t]*\t[^\t]*\t\u{feff}?\d{4}-\d{2}-\d{2}T[\d:.]+Z ?/u;
// 先頭から n コードポイントまで。サロゲートペアを割らない。長い入力でも n に比例した時間で終わる
function takeCodePoints(text: string, n: number): string {
  if (text.length <= n) return text;
  let index = 0;
  for (let count = 0; count < n && index < text.length; count++) {
    index += (text.codePointAt(index) ?? 0) > 0xffff ? 2 : 1;
  }
  return text.slice(0, index);
}

function cleanLine(raw: string, jobLog: boolean): string {
  let line = takeCodePoints(raw, RAW_LINE_LIMIT);
  if (jobLog) line = line.replace(/^\u{feff}/u, '').replace(JOB_LOG_PREFIX, '');
  return redactSecrets(sanitizeForTerminal(removeEscapeSequences(line)));
}

const isBlank = (line: string): boolean => line.trim() === '';

// `env:` の段: 内容が `env:` の行から、内容の先頭が空白でない最初の行の前まで (空の行は段の中)
function dropExcludedLines(lines: readonly string[]): string[] {
  const kept: string[] = [];
  let inEnv = false;
  for (const line of lines) {
    if (inEnv) {
      if (line === '' || /^\s/.test(line)) continue;
      inEnv = false;
    }
    if (line === 'env:') {
      inEnv = true;
      continue;
    }
    if (line.startsWith('npm verbose stack') || line.startsWith('::add-mask::')) continue;
    kept.push(line);
  }
  return kept;
}

const JOB_LOG_MATCH = ['npm error', 'npm ERR!', '##[error]', 'npm verbose oidc'] as const;
const LOCAL_STDERR_MATCH = ['npm error', 'npm ERR!', 'fatal:', 'error:'] as const;

const startsWithAny = (line: string, prefixes: readonly string[]): boolean =>
  prefixes.some((prefix) => line.startsWith(prefix));

const displayLine = (line: string): string => takeCodePoints(line, DISPLAY_LINE_LIMIT);
const lastLines = (lines: readonly string[]): string[] =>
  lines.slice(-DISPLAY_LINE_COUNT).map(displayLine);

function cleanLines(text: string, jobLog: boolean): string[] {
  return text.split(LINE_BREAK).map((raw) => cleanLine(raw, jobLog));
}

export function excerptLocalStderr(
  command: string,
  exit: number | null,
  stderr: string,
  options: { tool: ErrorTool }
): ErrorExcerpt {
  const lines = dropExcludedLines(cleanLines(stderr, false)).filter((line) => !isBlank(line));
  return {
    command,
    exit,
    source: 'local-stderr',
    tool: options.tool,
    lines: lastLines(lines),
    matched: lines.filter((line) => startsWithAny(line, LOCAL_STDERR_MATCH)).map(displayLine),
  };
}

// exit は gh の `--log-failed` の出力からは分からないので null
export function excerptJobLog(command: string, log: string): ErrorExcerpt {
  const lines = dropExcludedLines(cleanLines(log, true)).filter((line) => !isBlank(line));
  const matched = lines.filter((line) => startsWithAny(line, JOB_LOG_MATCH));
  return {
    command,
    exit: null,
    source: 'job-log',
    tool: 'gh',
    lines: lastLines(matched.length > 0 ? matched : lines),
    matched: matched.map(displayLine),
  };
}

// 判定だけの停止と、観測の `what` / `errors` の行に使う。行は選ばず、規則にも渡さない
export function excerptDetail(
  command: string,
  exit: number | null,
  detailLines: readonly string[]
): ErrorExcerpt {
  const lines = detailLines
    .flatMap((detail) => cleanLines(detail, false))
    .filter((line) => !isBlank(line));
  return {
    command,
    exit,
    source: 'none',
    tool: 'other',
    lines: lastLines(lines),
    matched: [],
  };
}

// 観測の what を error.lines の先頭に足す (先頭の 12 行を残す)。matched は規則に渡す行なので変えない
export function prependDetail(error: ErrorExcerpt | undefined, what: string): ErrorExcerpt {
  const detail = excerptDetail(NO_COMMAND, null, [what]);
  if (error === undefined) return detail;
  return { ...error, lines: [...detail.lines, ...error.lines].slice(0, DISPLAY_LINE_COUNT) };
}

// --- 診断 (spec K2) ---
// 規則の表を上から評価し、当たったものを表の順に最大 3 件返す。どれにも当たらなければ場所ごとの
// 既定の候補を 1 件返す。規則が見るのは site、error.command / source / tool / matched /
// logUnreadable / rawPath だけで、error.lines (表示用の行) は見ない。
// 文に入れてよいのは定数だけ (外部の値は補間しない)。`<name>` はパッケージ名の代わりの文字列そのもの。

const MAX_CAUSES = 3;

interface Diagnosis {
  cause: string;
  check: string;
}

interface Rule {
  id: string;
  remedy: string;
  diagnose(site: StopSite, error: ErrorExcerpt): Diagnosis | undefined;
}

const matchedHas = (error: ErrorExcerpt, ...needles: readonly string[]): boolean =>
  error.matched.some((line) => needles.some((needle) => line.includes(needle)));

const isNpmStageJobFailure = (site: StopSite): boolean =>
  site.side === 'after-push' && site.where === 'job-failed' && site.job === 'npm-stage';

const TRUST_EXPIRED_CHECK =
  'On npmjs.com, open each package: Settings > Trusted publishing, and look for "This trusted publisher configuration has expired"';
const TRUST_EXPIRED_REMEDY =
  'Only for packages confirmed expired on npmjs.com: find the id with `npm trust list <name> --json`, run `npm trust revoke <name> --id <id>`, then `npm trust github <name> --file release.yml --repo berlysia/kanbun-annotation --env npm --allow-stage-publish -y`, and continue with F2 in docs/releasing.md (this script does not run these commands)';

const RULES: readonly Rule[] = [
  {
    id: 'trust-expired',
    remedy: TRUST_EXPIRED_REMEDY,
    diagnose(site, error) {
      if (!isNpmStageJobFailure(site)) return undefined;
      const common = { check: TRUST_EXPIRED_CHECK };
      const sign = matchedHas(
        error,
        'npm error code E401',
        'npm error code ENEEDAUTH',
        'package not found'
      );
      if (sign) {
        const strong = matchedHas(error, 'package not found');
        return {
          ...common,
          cause: strong
            ? 'The trusted publisher setting of a package has expired or was deleted (the log has `package not found`, a strong sign)'
            : 'The trusted publisher setting of a package has expired or was deleted (the log has an authentication error)',
        };
      }
      if (error.logUnreadable === true) {
        return {
          ...common,
          cause:
            'The job log could not be read, so this cause from 0.2.0 is checked first: the trusted publisher setting of a package has expired or was deleted',
        };
      }
      return undefined;
    },
  },
  {
    id: 'web-auth-timeout',
    remedy: 'Run the same command again and finish the authentication in the page that opens',
    diagnose(_site, error) {
      if (error.source !== 'local-stderr' || error.tool !== 'npm') return undefined;
      const hit = error.matched.some((l) => l.includes('/-/v1/done') && l.includes('404'));
      if (!hit) return undefined;
      return {
        cause: 'The browser authentication did not finish in time',
        check: 'Did you finish the authentication in the page npm opened?',
      };
    },
  },
  {
    id: 'npm-login',
    remedy: 'Run `npm login`, then run the same command again',
    diagnose(_site, error) {
      if (error.source !== 'local-stderr' || error.tool !== 'npm') return undefined;
      if (!matchedHas(error, 'npm error code E401', 'npm error code ENEEDAUTH')) return undefined;
      return {
        cause: 'The local npm is not logged in, or its token has expired',
        check: '`npm whoami`',
      };
    },
  },
  {
    id: 'git-remote',
    remedy:
      'Fix the connection, the credentials or the remote setting, then run the same command again',
    diagnose(_site, error) {
      const remoteCommand =
        error.command.startsWith('git ls-remote') || error.command.startsWith('git fetch');
      if (error.tool !== 'git' || !remoteCommand) return undefined;
      return {
        cause: 'origin cannot be reached (network, authentication or the remote setting)',
        check: '`git ls-remote origin`',
      };
    },
  },
  {
    id: 'output-shape',
    remedy:
      'Record it under "結果" in ADR-029, then continue with "## 手作業の手順" in docs/releasing.md',
    diagnose(site, error) {
      const afterPushShape =
        site.side === 'after-push' &&
        (site.where === 'shape-unknown' || site.where === 'unexpected-run-shape');
      const trustShape = error.command.startsWith('npm trust list') && error.rawPath !== undefined;
      if (!afterPushShape && !trustShape) return undefined;
      return {
        cause:
          'The shape of the npm or gh output differs from what this script expects (as the `npm view` array did in 0.2.0)',
        check:
          'Open the saved raw output (escape sequences are removed and known token shapes are masked; a secret spanning lines, such as a PEM body, is not)',
      };
    },
  },
];

// --- 場所ごとの既定の候補 (型で網羅を強制する) ---

interface Default extends Diagnosis {
  id: string;
  remedy: string;
}

const RERUN_REMEDY = 'Run the same command again; if it repeats, read the lines under error:';

const def = (id: string, cause: string, check: string, remedy: string): Default => ({
  id,
  cause,
  check,
  remedy,
});

const SHAPE_DEFAULT = (id: string): Default =>
  def(
    id,
    'The shape of the npm or gh output differs from what this script expects',
    'Open the saved raw output (escape sequences are removed and known token shapes are masked; a secret spanning lines, such as a PEM body, is not)',
    'Record it under "結果" in ADR-029, then continue with "## 手作業の手順" in docs/releasing.md'
  );

type PlainAfterPushKind = Exclude<StopObservation['kind'], 'job-failed' | 'post-check'>;

const AFTER_PUSH_DEFAULTS: Readonly<Record<PlainAfterPushKind, Default>> = {
  'run-not-found': def(
    'default:after-push:run-not-found',
    'No Release run exists for the tag commit: the workflow did not start or has not appeared yet',
    'Open the Actions tab and look for a Release run on the tag; check the trigger conditions in release.yml',
    'With 0 published, check the workflow trigger (F4); otherwise check the published packages and the stage list by hand'
  ),
  'unexpected-run-shape': SHAPE_DEFAULT('default:after-push:unexpected-run-shape'),
  'shape-unknown': SHAPE_DEFAULT('default:after-push:shape-unknown'),
  'staged-mismatch': def(
    'default:after-push:staged-mismatch',
    'A staged package differs from the validated content',
    'Read the lines under error: and compare with `npm stage list <name> --json`',
    'Reject what is staged and retag (F1 steps 3-4); if some packages are published, follow F3'
  ),
  'stage-none': def(
    'default:after-push:stage-none',
    'No package is staged on npm',
    'Read the npm-stage job log in the Actions tab',
    'There is nothing to reject; fix the cause and retag (F1 steps 3-4)'
  ),
  'published-out-of-order': def(
    'default:after-push:published-out-of-order',
    'The published packages are not a prefix of the manifest order; the registry read may lag',
    '`npm view <name> versions --json` for each package, in the manifest order',
    'Run again in a few minutes; if it is unchanged, follow F3'
  ),
  'published-wrong': def(
    'default:after-push:published-wrong',
    'A package is published with an integrity that differs from the validated one',
    '`npm view <name>@<version> dist.integrity` against the validate job log',
    'Follow F3: reject what is unapproved, deprecate what is published, and release a patch'
  ),
  'approve-failed': def(
    'default:after-push:approve-failed',
    '`npm stage approve` failed (a cancelled or mistyped 2FA, or E409 retries used up); the stage stays valid',
    'Read the lines under error:',
    'Run the same command again; it continues from where it stopped'
  ),
  interrupted: def(
    'default:after-push:interrupted',
    'The run was interrupted (Ctrl-C) at a wait or retry boundary',
    'Nothing is broken',
    'Run the same command again'
  ),
  'attempt-changed': def(
    'default:after-push:attempt-changed',
    'The workflow run was re-run while it was being checked',
    'Open the run in the Actions tab and look at its attempts',
    'Run the same command again'
  ),
  'command-failed': def(
    'default:after-push:command-failed',
    'A command failed while checking the release',
    'Read the command and the lines under error:',
    RERUN_REMEDY
  ),
  'trust-eotp': def(
    'default:after-push:trust-eotp',
    'The npm 2FA skip expired (or was not chosen)',
    'Did you choose "skip 2FA for 5 minutes" in the interactive authentication?',
    'Run again and choose "skip 2FA for 5 minutes" in the interactive authentication'
  ),
  'trust-mismatch': def(
    'default:after-push:trust-mismatch',
    'The trusted publisher settings differ from the expected single entry',
    'Read the six outputs shown above',
    'Follow steps 3 / 3a of the one-time migration in docs/releasing.md'
  ),
};

const JOB_FAILED_DEFAULTS: Readonly<Record<'validate' | 'npm-stage', Default>> = {
  validate: def(
    'default:after-push:job-failed:validate',
    'The validate job failed',
    'Read the lines under error:; if the log could not be read, open the run in the Actions tab',
    'Fix the cause and retag with --tag-only (F1); if the cause is release.yml, follow F4'
  ),
  'npm-stage': def(
    'default:after-push:job-failed:npm-stage',
    'The npm-stage job failed for a reason other than a trust or authentication error',
    'Read the lines under error:, then check what is staged with `npm stage list <name> --json`',
    'Reject what is staged and retag (F1 steps 3-4); if some packages are published, follow F3'
  ),
};

const POST_CHECK_DEFAULTS: Readonly<
  Record<'integrity' | 'dist-tag' | 'release' | 'shape', Default>
> = {
  integrity: def(
    'default:after-push:post-check:integrity',
    'The published tarball differs from the validated bytes',
    '`npm view <name>@<version> dist.integrity` against the validate job log',
    'Deprecate what is published and release a patch (F3)'
  ),
  'dist-tag': def(
    'default:after-push:post-check:dist-tag',
    'A dist-tag does not point at the released version',
    '`npm view <name> dist-tags --json`',
    'Fix it with `npm dist-tag add <name>@<version> <tag>`'
  ),
  release: def(
    'default:after-push:post-check:release',
    'The GitHub Release does not exist',
    'Open the github-release job in the Actions tab',
    'Re-run the github-release job; if the tag has to be created again, delete the Release first'
  ),
  shape: def(
    'default:after-push:post-check:shape',
    'The registry answer for a package could not be read in the expected shape',
    'Read the lines under error:',
    'Do the "### approve の後の確認" steps in docs/releasing.md by hand'
  ),
};

const FRONT_DEFAULTS: Readonly<Record<FrontStage, Default>> = {
  '1 prerequisites': def(
    'default:front:1 prerequisites',
    'A prerequisite check failed (git state, trust settings or `pnpm verify`)',
    'Read the command and the lines under error:; run a failed verify step alone (see try:)',
    'Fix what the lines under error: show, then run the same command again; nothing has been changed yet. If the trust check asked for 2FA again, run again and choose "skip 2FA for 5 minutes" at the authentication prompt'
  ),
  '2 versioning': def(
    'default:front:2 versioning',
    '`changeset version` or a check after it failed; the working tree may hold version changes',
    'Read the command and the lines under error:; `git status`',
    'Restore the working tree with the undo command shown, fix the cause, then run again'
  ),
  '3 publish preconditions': def(
    'default:front:3 publish preconditions',
    'A publish precondition failed (package versions, CHANGELOG, registry or tag)',
    'Read the command and the lines under error:',
    'Restore the working tree with the undo command shown, fix the cause, then run again'
  ),
  '4 consumer test': def(
    'default:front:4 consumer test',
    'The consumer test with the new tarballs failed',
    'Run `pnpm test:consumer` alone and read its output',
    'Restore the working tree with the undo command shown, fix the cause, then run again'
  ),
  '5 confirmation': def(
    'default:front:5 confirmation',
    'The confirmation was declined or could not be asked',
    'Did you answer N?',
    'Restore the working tree with the undo command shown; run again when you are ready'
  ),
  '6 record': def(
    'default:front:6 record',
    'The release commit or the tag could not be created',
    '`git status` and `git log -1`',
    'Restore with the undo command shown, fix the cause, then run again'
  ),
  '7 push': def(
    'default:front:7 push',
    '`git push` was rejected or failed; origin is unchanged',
    'Read the lines under error:; `git ls-remote origin`',
    'Undo the local commit and tag with the command shown (`git tag -d vX.Y.Z && git reset --hard origin/master`), fix the cause, then run again'
  ),
};

const ENTRY_ROW_DEFAULTS: Readonly<Record<EntryStopRow, Default>> = {
  0: def(
    'default:entry:row0',
    'The state of origin or the registry could not be read',
    'Read the lines under error:; `git ls-remote origin`, `npm view <name> versions --json`',
    'Fix the network or the authentication, then run the same command again'
  ),
  2: def(
    'default:entry:row2',
    'The release of this version is unfinished',
    '`git ls-remote --tags origin` and `npm view <name> versions --json`',
    'Run `git switch --detach vX.Y.Z` if HEAD differs from the tag, then run again without flags to finish it'
  ),
  3: def(
    'default:entry:row3',
    'The local tag exists at HEAD but not on origin: the push failed',
    '`git tag -l vX.Y.Z` and `git ls-remote --tags origin`',
    'Run `git tag -d vX.Y.Z && git reset --hard origin/master`; to tag again with --tag-only, delete the tag first'
  ),
  4: def(
    'default:entry:row4',
    'A stale local tag exists',
    '`git tag -l vX.Y.Z` and `git rev-parse vX.Y.Z`',
    'Run `git tag -d vX.Y.Z`, then run again'
  ),
  5: def(
    'default:entry:row5',
    '--tag-only was given but the tag is already released',
    '`git ls-remote --tags origin`',
    'To tag it again, delete the tag by the F1 steps in docs/releasing.md first'
  ),
  6: def(
    'default:entry:row6',
    '--tag-only was given but some packages are already published',
    '`npm view <name> versions --json` for each package',
    'Retagging (F1) needs 0 published packages; follow the F3 steps'
  ),
  9: def(
    'default:entry:row9',
    '`changeset status` failed',
    'Read the lines under error:',
    'Fix the cause shown, then run the same command again'
  ),
  10: def(
    'default:entry:row10',
    '`changeset status` is inconsistent with the repository',
    'Read the lines under error:',
    'Fix the cause shown, then run the same command again'
  ),
  12: def(
    'default:entry:row12',
    'The version is bumped but there is no tag',
    '`git tag -l vX.Y.Z`',
    'Run `pnpm run release -- --tag-only`'
  ),
  13: def(
    'default:entry:row13',
    'Pre mode has only consumed changesets',
    '`.changeset/pre.json` and the pending changesets',
    'Add a new changeset, or run `pnpm run release -- --exit-pre` to release the stable version'
  ),
  14: def(
    'default:entry:row14',
    'There is nothing to release',
    '`pnpm changeset status`',
    'Write a changeset, then run again'
  ),
};

const ENTRY_KIND_DEFAULTS: Readonly<Record<Exclude<EntryWhere['kind'], 'row'>, Default>> = {
  flags: def(
    'default:entry:flags',
    'The arguments are unknown or conflict with each other',
    'Read the lines under error:',
    'Fix the arguments; --tag-only, --pre <tag> and --exit-pre cannot be combined'
  ),
  tty: def(
    'default:entry:tty',
    'stdin and stdout are not both a terminal',
    'Is the command run from a terminal (not a pipe or a redirect)?',
    'Run it in a terminal'
  ),
  tooling: def(
    'default:entry:tooling',
    'The npm or gh version, or the registry setting, is outside the supported range',
    '`npm --version`, `gh --version`, `npm config get registry`',
    'Update the tool or fix the setting, then run again'
  ),
  repo: def(
    'default:entry:repo',
    'The repository or the package metadata is inconsistent (for example, the six package versions differ)',
    'Read the lines under error:',
    'Check the versions; do not bump `package.json` versions by hand'
  ),
  'pre-state': def(
    'default:entry:pre-state',
    'The state of git, the tags or the registry could not be combined into a decision',
    'Read the lines under error:',
    'Fix the cause shown, then run the same command again'
  ),
  dirty: def(
    'default:entry:dirty',
    'The working tree is not clean',
    '`git status`',
    'Revert or commit the changes, then run again'
  ),
  'after-push-input': def(
    'default:entry:after-push-input',
    'The input for the second half (the tag commit or the manifest order) could not be prepared',
    'Read the lines under error:',
    'Fix the cause shown, then run the same command again'
  ),
};

function defaultFor(site: StopSite): Default {
  if (site.side === 'front') return FRONT_DEFAULTS[site.where];
  if (site.side === 'entry') {
    return site.where.kind === 'row'
      ? ENTRY_ROW_DEFAULTS[site.where.row]
      : ENTRY_KIND_DEFAULTS[site.where.kind];
  }
  if (site.where === 'job-failed') return JOB_FAILED_DEFAULTS[site.job ?? 'npm-stage'];
  if (site.where === 'post-check') return POST_CHECK_DEFAULTS[site.check ?? 'shape'];
  return AFTER_PUSH_DEFAULTS[site.where];
}

// remediesFor が id から対処を引くための表 (規則と既定の候補の対処を 1 か所に集める)
const REMEDY_BY_ID: ReadonlyMap<string, string> = new Map<string, string>([
  ...RULES.map((rule): [string, string] => [rule.id, rule.remedy]),
  ...[
    ...Object.values(AFTER_PUSH_DEFAULTS),
    ...Object.values(JOB_FAILED_DEFAULTS),
    ...Object.values(POST_CHECK_DEFAULTS),
    ...Object.values(FRONT_DEFAULTS),
    ...Object.values(ENTRY_ROW_DEFAULTS),
    ...Object.values(ENTRY_KIND_DEFAULTS),
  ].map((d): [string, string] => [d.id, d.remedy]),
]);

export function diagnose(site: StopSite, error: ErrorExcerpt): NonEmpty<Cause> {
  const hits: Cause[] = [];
  for (const rule of RULES) {
    const hit = rule.diagnose(site, error);
    if (hit !== undefined) hits.push({ id: rule.id, cause: hit.cause, check: hit.check });
    if (hits.length === MAX_CAUSES) break;
  }
  const [first, ...rest] = hits;
  if (first !== undefined) return [first, ...rest];
  const fallback = defaultFor(site);
  return [{ id: fallback.id, cause: fallback.cause, check: fallback.check }];
}

export function remediesFor(causes: NonEmpty<Cause>): NonEmpty<string> {
  const remedies = causes.map((c) => REMEDY_BY_ID.get(c.id) ?? RERUN_REMEDY);
  const [first, ...rest] = remedies;
  return [first ?? RERUN_REMEDY, ...rest];
}

// --- 停止の整形 (spec K1) ---
// 外部の行 (error.lines) は必ず `  | ` で始まる。利用者向けの行 (`try:` や `$ `) を装えない。

const EXTERNAL_LINE_BREAK = /\r\n|[\n\r\u{2028}\u{2029}]/u;

function formatErrorLines(error: ErrorExcerpt): string[] {
  const out: string[] = [];
  if (error.command !== NO_COMMAND) {
    // 取れた job の log は、gh が成功して返した中身 (job が失敗したのであって、コマンドは失敗していない)。
    // 読めなかったときは、gh の失敗なので exit を出す
    const jobLogRead = error.source === 'job-log' && error.logUnreadable !== true;
    const exit = error.exit === null ? 'exit: signal or not started' : `exit ${error.exit}`;
    out.push(jobLogRead ? `  $ ${error.command}` : `  $ ${error.command} (${exit})`);
  }
  const external = error.lines.flatMap((line) => line.split(EXTERNAL_LINE_BREAK));
  if (external.length === 0) out.push('  | (no error output)');
  for (const line of external) out.push(`  | ${line}`);
  if (error.rawPath !== undefined) {
    out.push(
      `  raw output (escape sequences removed, known token shapes masked): ${error.rawPath}`
    );
  }
  return out;
}

export function formatStopReport(report: StopReport): string[] {
  return [
    report.headline,
    'error:',
    ...formatErrorLines(report.error),
    'possible causes:',
    ...report.causes.flatMap((c) => [`  - ${c.cause}`, `    check: ${c.check}`]),
    'try:',
    ...report.remedies.map((remedy) => `  - ${remedy}`),
    ...(report.section === undefined ? [] : [`see docs/releasing.md: ${report.section}`]),
    ...report.notes.map((note) => `note: ${note}`),
  ];
}

// --- 進み方の行 (spec K7) ---

export const STAGE_COUNT = 11;

// 段の名前と、段の始めに出す内容の SSoT。前半の stop(stage, ...) は name、後半の段の始めは what を使う。
// 段 8 の tag は表に埋めず、呼び出し側が検証済みの値で足す
export const STAGES = {
  1: { name: '1 prerequisites', what: 'check git, trust and pnpm verify' },
  2: { name: '2 versioning', what: 'bump versions with changesets' },
  3: { name: '3 publish preconditions', what: 'check publish preconditions' },
  4: { name: '4 consumer test', what: 'run the consumer test with the new tarballs' },
  5: { name: '5 confirmation', what: 'confirm' },
  6: { name: '6 record', what: 'commit and tag' },
  7: { name: '7 push', what: 'push' },
  8: { name: '8 find run', what: 'find the Release run for the tag and check its jobs' },
  9: { name: '9 check staged', what: 'check the staged packages against the validate job log' },
  10: { name: '10 approve', what: 're-check trust and approve' },
  11: { name: '11 check published', what: 'check the published packages' },
} as const satisfies Record<1 | 2 | 3 | 4 | 5 | 6 | 7, { name: FrontStage; what: string }> &
  Record<8 | 9 | 10 | 11, { name: string; what: string }>;

export function formatStageStart(n: number, what: string): string {
  return `stage ${n}/${STAGE_COUNT}: ${what}`;
}

export function formatOk(evidence: string): string {
  return `  ok: ${evidence}`;
}

export function formatEntry(text: string): string {
  return `entry: ${text}`;
}

// elapsedMs は、これから入る sleep が終わる時点の値 (now() - start + intervalMs)。
// attempt は終えた probe の回数 (この行の直後に attempt + 1 回目の probe が走る)
export function formatWaiting(
  label: string,
  elapsedMs: number,
  budget: { ms: number } | { attempts: number; attempt: number }
): string {
  const limit =
    'ms' in budget ? `${budget.ms / 1000}s` : `attempt ${budget.attempt}/${budget.attempts}`;
  return `  waiting for ${label}: ${Math.floor(elapsedMs / 1000)}s / ${limit}`;
}
