// 6 パッケージを pack し、空の利用者プロジェクトに npm install して、Node と TypeScript から使えることを確かめる。
// 先に `pnpm build` が済んでいること (ルートの `pnpm test:consumer` が行う)。
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  copyFileSync,
  lstatSync,
  rmSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const PUBLIC = [
  'skam',
  'skam-xml-parser',
  'skam-xml-stringify',
  'skam-html-renderer',
  'skam-canvas-renderer',
  'skam-web-component',
];
const FORBIDDEN_SCRIPTS = ['prepare', 'prepack', 'prepublish', 'prepublishOnly', 'postpack'];
const ALLOWED_TOP_LEVEL = new Set(['dist', 'package.json', 'README.md', 'CHANGELOG.md', 'LICENSE']);
// 親にあれば引き継ぐ環境変数 (token を含む変数は渡さない)
const PASS_THROUGH = [
  'HTTPS_PROXY',
  'https_proxy',
  'HTTP_PROXY',
  'http_proxy',
  'NO_PROXY',
  'no_proxy',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'NPM_CONFIG_CAFILE',
  'npm_config_cafile',
  'npm_config_registry',
  'NPM_CONFIG_REGISTRY',
];

const failures = [];
const check = (cond, message) => {
  if (!cond) failures.push(message);
};
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

function listFiles(dir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...listFiles(join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

function run(cmd, args, options) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  return result;
}

function runChecked(label, cmd, args, options) {
  const result = run(cmd, args, options);
  if (result.status !== 0) {
    failures.push(
      `${label} failed (exit ${result.status})\n${result.stdout ?? ''}\n${result.stderr ?? ''}`
    );
  } else if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  return result;
}

function main(tmp) {
  const versions = new Map();
  for (const p of PUBLIC) {
    const pkg = readJson(join(repoRoot, 'packages', p, 'package.json'));
    versions.set(pkg.name, pkg.version);
    for (const script of FORBIDDEN_SCRIPTS)
      check(!(pkg.scripts && script in pkg.scripts), `${p}: has a ${script} script`);
  }
  if (failures.length > 0) return;

  // 1. pack (親の環境のまま。HOME を替えると corepack が pnpm を取りに行って失敗しうる。
  //    pack はネットワークを使わず、上でパッケージのスクリプトがないことを確かめている)
  const tarballDir = join(tmp, 'tarballs');
  mkdirSync(tarballDir);
  for (const p of PUBLIC) {
    const r = runChecked(`pnpm pack ${p}`, 'pnpm', ['pack', '--pack-destination', tarballDir], {
      cwd: join(repoRoot, 'packages', p),
    });
    if (r.status !== 0) return;
  }

  // 2. app/package.json
  const appDir = join(tmp, 'app');
  mkdirSync(appDir);
  const tarballFor = (name) => {
    const stem = name.replace(/^@/, '').replace('/', '-');
    const file = readdirSync(tarballDir).find((f) => f === `${stem}-${versions.get(name)}.tgz`);
    if (!file) throw new Error(`no tarball for ${name}`);
    return `file:${join(tarballDir, file)}`;
  };
  const dependencies = {};
  for (const name of versions.keys()) dependencies[name] = tarballFor(name);
  // overrides で 6 つの名前を同じ tarball に固定する理由:
  // `pnpm pack` は `workspace:*` をその時点の版 (リポジトリの version) に書き換えるが、その版は
  // registry にまだ無いことがある。固定しないと、内部依存が registry に取りに行って失敗するか、別の版が入る。
  const overrides = { ...dependencies };
  writeFileSync(
    join(appDir, 'package.json'),
    JSON.stringify({ type: 'module', private: true, dependencies, overrides }, null, 2)
  );

  // 3. npm install (第三者のコードを取り込むので、最小の環境変数で実行する)
  const home = join(tmp, 'home');
  mkdirSync(home);
  // npm は user と global に同じファイルを指すと "double-loading config" で止まるので、空のファイルを 2 つ作る
  const userNpmrc = join(tmp, 'empty-user.npmrc');
  const globalNpmrc = join(tmp, 'empty-global.npmrc');
  writeFileSync(userNpmrc, '');
  writeFileSync(globalNpmrc, '');
  const env = {
    PATH: process.env.PATH ?? '',
    HOME: home,
    NPM_CONFIG_USERCONFIG: userNpmrc,
    NPM_CONFIG_GLOBALCONFIG: globalNpmrc,
    NPM_CONFIG_UPDATE_NOTIFIER: 'false',
  };
  for (const k of PASS_THROUGH) if (process.env[k] !== undefined) env[k] = process.env[k];

  const install = runChecked(
    'npm install',
    'npm',
    ['install', '--no-audit', '--no-fund', '--ignore-scripts', '--cache', join(tmp, 'npm-cache')],
    { cwd: appDir, env }
  );
  if (install.status !== 0) return;

  // 4. インストール結果の検査
  const ls = run('npm', ['ls', '--all', '--json'], { cwd: appDir, env });
  console.log('--- npm ls --all --json ---');
  console.log(ls.stdout);
  console.log('--- end npm ls ---');
  for (const [name, version] of versions) {
    const dir = join(appDir, 'node_modules', name);
    const stat = lstatSync(dir);
    check(stat.isDirectory() && !stat.isSymbolicLink(), `${name}: not a real directory`);
    if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
    check(readJson(join(dir, 'package.json')).version === version, `${name}: version mismatch`);
    for (const file of listFiles(dir)) {
      const top = file.split('/')[0];
      check(ALLOWED_TOP_LEVEL.has(top), `${name}: unexpected file ${file}`);
    }
  }
  if (failures.length > 0) return;

  // 5. 利用者として使う
  for (const f of ['smoke.mjs', 'smoke.ts', 'tsconfig.bundler.json', 'tsconfig.nodenext.json'])
    copyFileSync(join(here, f), join(appDir, f));
  const tsgo = join(repoRoot, 'node_modules', '.bin', 'tsgo');
  runChecked('node smoke.mjs', process.execPath, ['smoke.mjs'], { cwd: appDir, env });
  for (const config of ['tsconfig.bundler.json', 'tsconfig.nodenext.json'])
    runChecked(`tsgo -p ${config}`, tsgo, ['-p', config], { cwd: appDir, env });
}

const tmp = mkdtempSync(join(tmpdir(), 'skam-consumer-'));
try {
  main(tmp);
} catch (e) {
  failures.push(e instanceof Error ? (e.stack ?? e.message) : String(e));
} finally {
  // 消す対象が一時ディレクトリであることを確かめてから消す
  const real = realpathSync(tmp);
  if (real.startsWith(realpathSync(tmpdir()) + sep) && basename(real).startsWith('skam-consumer-'))
    rmSync(tmp, { recursive: true, force: true });
  else failures.push(`refused to remove unexpected path ${real}`);
}
if (failures.length > 0) {
  console.error(`consumer: FAIL\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log('consumer: OK');
}
