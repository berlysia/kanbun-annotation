// check-release / release の統合テスト用に、2 パッケージ (@fx/a ← @fx/b) の小さな pnpm workspace を一時ディレクトリに作る。
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, sep } from 'node:path';

const PREFIX = 'skam-fx-';

export interface WorkspaceOptions {
  version: string;
  changelogHeads?: { a?: string; b?: string };
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writePackage(
  root: string,
  dir: string,
  name: string,
  options: WorkspaceOptions,
  dependencies: Record<string, string>,
  head: string | undefined
): void {
  const base = join(root, 'packages', dir);
  mkdirSync(join(base, 'dist'), { recursive: true });
  const manifest: Record<string, unknown> = {
    name,
    version: options.version,
    type: 'module',
    main: 'dist/index.js',
    files: ['dist'],
  };
  if (Object.keys(dependencies).length > 0) manifest['dependencies'] = dependencies;
  writeJson(join(base, 'package.json'), manifest);
  writeFileSync(join(base, 'dist', 'index.js'), 'export const x = 1;\n');
  writeFileSync(
    join(base, 'CHANGELOG.md'),
    `# ${name}\n\n${head ?? `## ${options.version}`}\n\n- a change\n`
  );
}

export function makeWorkspace(options: WorkspaceOptions): string {
  const root = mkdtempSync(join(tmpdir(), PREFIX));
  writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
  writeJson(join(root, 'package.json'), {
    name: 'fixture-root',
    private: true,
    version: '0.0.0',
    packageManager: 'pnpm@10.27.0',
  });
  writeFileSync(join(root, 'LICENSE'), 'MIT License\n\nFixture license text.\n');
  mkdirSync(join(root, '.changeset'));
  writeJson(join(root, '.changeset', 'config.json'), { fixed: [['@fx/a', '@fx/b']] });
  writePackage(root, 'a', '@fx/a', options, {}, options.changelogHeads?.a);
  writePackage(root, 'b', '@fx/b', options, { '@fx/a': 'workspace:*' }, options.changelogHeads?.b);
  // pnpm pack は workspace:* を解決するために install 済みであることを求める (外部の依存はないのでオフラインで済む)
  const install = spawnSync('pnpm', ['install', '--offline', '--ignore-scripts'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (install.status !== 0) {
    throw new Error(`pnpm install failed in the fixture:\n${install.stdout}\n${install.stderr}`);
  }
  return root;
}

export function removeWorkspace(path: string): void {
  // 消す対象が tmpdir 直下の skam-fx-* であることを確かめてから消す
  const real = realpathSync(path);
  if (
    dirname(real) !== realpathSync(tmpdir()) ||
    !basename(real).startsWith(PREFIX) ||
    real.endsWith(sep)
  ) {
    throw new Error(`refused to remove unexpected path ${real}`);
  }
  rmSync(real, { recursive: true, force: true });
}
