// `changeset version` を scratch (HEAD の展開コピー) で実行し、0.2.0 への版上げを確かめる。
// 作業ツリーは書き換えない。ネットワークを使いうる (pnpm install) ので、CI には入れない。
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  realpathSync,
} from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve, dirname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PUBLIC = [
  'skam',
  'skam-xml-parser',
  'skam-xml-stringify',
  'skam-html-renderer',
  'skam-canvas-renderer',
  'skam-web-component',
];
const PRIVATE = ['playground', 'integration-tests', 'baseline-check', 'skam-screenshot'];
const CANONICAL_URL =
  'https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md';
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

function readTableIds() {
  const text = readFileSync(join(repoRoot, 'docs/migration-0.1-to-0.2.md'), 'utf8');
  const ids = [];
  for (const line of text.split('\n')) {
    const m = /^\|\s*(M\d+)\s*\|/.exec(line);
    if (m) ids.push(m[1]);
  }
  return ids;
}

function extractHead(scratch) {
  const archive = spawnSync('git', ['archive', 'HEAD'], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (archive.status !== 0) throw new Error(`git archive failed: ${archive.stderr}`);
  const tar = spawnSync('tar', ['-x', '-C', scratch], { input: archive.stdout });
  if (tar.status !== 0) throw new Error(`tar failed: ${tar.stderr}`);
}

function main() {
  const ids = readTableIds();
  check(ids.length > 0, 'the migration table has no rows');

  const scratch = mkdtempSync(join(tmpdir(), 'skam-version-'));
  try {
    extractHead(scratch);

    const home = join(scratch, 'home');
    mkdirSync(home);
    const npmrc = join(scratch, 'empty.npmrc');
    writeFileSync(npmrc, '');
    const pnpm = execFileSync('which', ['pnpm'], { encoding: 'utf8' }).trim();
    const env = {
      PATH: process.env.PATH ?? '',
      HOME: home,
      NPM_CONFIG_USERCONFIG: npmrc,
      // HOME を替えると corepack が pnpm を取りに行くので、本物の HOME のキャッシュを使う
      COREPACK_HOME: process.env.COREPACK_HOME ?? join(homedir(), '.cache', 'node', 'corepack'),
    };
    for (const k of PASS_THROUGH) if (process.env[k] !== undefined) env[k] = process.env[k];
    const run = (cmd, args) =>
      execFileSync(cmd, args, {
        cwd: scratch,
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

    // changeset version が git を必要とする場合に備える (2a)
    run('git', ['init', '-q']);
    run('git', ['add', '-A']);
    run('git', [
      '-c',
      'user.email=x@example.invalid',
      '-c',
      'user.name=x',
      'commit',
      '-qm',
      'scratch',
    ]);

    run(pnpm, ['install', '--frozen-lockfile', '--ignore-scripts']);
    run(pnpm, ['changeset', 'version']);

    for (const p of PUBLIC) {
      const dir = join(scratch, 'packages', p);
      check(readJson(join(dir, 'package.json')).version === '0.2.0', `${p}: version is not 0.2.0`);
      const changelog = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8');
      const firstHeading = changelog.split('\n').find((l) => l.startsWith('## '));
      check(firstHeading === '## 0.2.0', `${p}: CHANGELOG starts with ${firstHeading}`);
      for (const id of ids)
        check(new RegExp(`\\b${id}\\b`).test(changelog), `${p}: CHANGELOG lacks ${id}`);
      check(changelog.includes(CANONICAL_URL), `${p}: CHANGELOG lacks the migration URL`);
      const lines = changelog.split('\n').filter((l) => /- M\d+ \(/.test(l)).length;
      check(lines === ids.length, `${p}: ${lines} "- Mxx (" lines, expected ${ids.length}`);
    }
    for (const p of PRIVATE) {
      const before = readJson(join(repoRoot, 'packages', p, 'package.json')).version;
      const after = readJson(join(scratch, 'packages', p, 'package.json')).version;
      check(before === after, `${p}: private version changed ${before} -> ${after}`);
    }

    // tarball の package.json (scratch には dist がないので、確かめるのは package.json だけ)
    const packs = join(scratch, 'packs');
    mkdirSync(packs);
    for (const p of PUBLIC)
      execFileSync(pnpm, ['pack', '--pack-destination', packs], {
        cwd: join(scratch, 'packages', p),
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    const tarballs = readdirSync(packs).filter((f) => f.endsWith('.tgz'));
    check(tarballs.length === PUBLIC.length, `packed ${tarballs.length} tarballs`);
    for (const t of tarballs) {
      const pkg = JSON.parse(
        execFileSync('tar', ['-xzOf', join(packs, t), 'package/package.json'], { encoding: 'utf8' })
      );
      for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
        for (const [name, range] of Object.entries(pkg[field] ?? {})) {
          check(!String(range).startsWith('workspace:'), `${t}: ${field}.${name} is ${range}`);
          if (name.startsWith('@kanbun-skam/'))
            check(/^\^?0\.2\.0$/.test(String(range)), `${t}: ${field}.${name} is ${range}`);
        }
      }
    }
  } catch (e) {
    failures.push(`${e instanceof Error ? e.message : String(e)}`);
    if (e && typeof e === 'object' && 'stderr' in e && e.stderr) failures.push(String(e.stderr));
  } finally {
    // 消す対象が scratch であることを確かめてから消す
    const real = realpathSync(scratch);
    if (real.startsWith(realpathSync(tmpdir()) + sep) && basename(real).startsWith('skam-version-'))
      rmSync(scratch, { recursive: true, force: true });
    else failures.push(`refused to remove unexpected path ${real}`);
  }
}

main();
if (failures.length > 0) {
  console.error(`check-version-bump: FAIL\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log('check-version-bump: OK');
}
