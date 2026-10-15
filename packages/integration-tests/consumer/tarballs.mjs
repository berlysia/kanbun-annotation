// consumer/run.mjs が使う、公開する tarball の一覧と集合の検査。
// 一覧の正本は .changeset/config.json の fixed[0]。manifest.json は scripts/check-release.ts の pack が書く。
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function readPublicNames(repoRoot) {
  const config = JSON.parse(readFileSync(join(repoRoot, '.changeset', 'config.json'), 'utf8'));
  const group = config.fixed?.[0];
  if (!Array.isArray(group) || group.length === 0 || !group.every((n) => typeof n === 'string')) {
    throw new Error('.changeset/config.json: fixed[0] must be a non-empty list of names');
  }
  return group;
}

export function loadTarballSet(dir) {
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath))
    throw new Error(`${manifestPath} does not exist (manifest.json is required)`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest === null || typeof manifest !== 'object' || manifest.schemaVersion !== 1) {
    throw new Error(`manifest schemaVersion must be 1, got ${manifest?.schemaVersion}`);
  }
  if (typeof manifest.version !== 'string' || !Array.isArray(manifest.packages)) {
    throw new Error('manifest needs a string version and a packages array');
  }
  const listed = manifest.packages.map((p) => p.file);
  const present = readdirSync(dir).filter((f) => f.endsWith('.tgz'));
  const problems = [
    ...present
      .filter((f) => !listed.includes(f))
      .map((f) => `${f} is in the directory but not in the manifest`),
    ...listed
      .filter((f) => !present.includes(f))
      .map((f) => `${f} is in the manifest but not in the directory`),
  ];
  if (problems.length > 0) throw new Error(`tarball set mismatch: ${problems.join('; ')}`);
  return { version: manifest.version, files: listed, packages: manifest.packages };
}

export function checkLicense(tarballPath, rootLicensePath) {
  const r = spawnSync('tar', ['-xzOf', tarballPath, 'package/LICENSE'], {
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`${tarballPath}: package/LICENSE is missing`);
  if (!r.stdout.equals(readFileSync(rootLicensePath))) {
    throw new Error(`${tarballPath}: package/LICENSE differs from the root LICENSE`);
  }
}
