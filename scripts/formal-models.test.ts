/**
 * docs/formal/<topic>/formal.json の形式検査を、pnpm test:scripts の一部として流す。
 * 新しい検査は docs/formal/<topic>/formal.json を足せば、このファイルを直さずに拾われる。
 * 落ちたときの直し方は docs/formal/README.md にある。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkCovers,
  judgeOutcome,
  parseManifest,
  resolveInRepo,
  runTlaCheck,
} from './lib/formal-models.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const formalRoot = join(repoRoot, 'docs', 'formal');

const manifests = existsSync(formalRoot)
  ? readdirSync(formalRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(formalRoot, entry.name, 'formal.json'))
      .filter((file) => existsSync(file))
  : [];

test('docs/formal has at least one manifest (an empty run is not a pass)', () => {
  assert.ok(manifests.length > 0, `no formal.json under ${formalRoot}`);
});

for (const manifestPath of manifests) {
  const dir = dirname(manifestPath);
  const topic = dir.slice(formalRoot.length + 1);
  const { checks } = parseManifest(
    readFileSync(manifestPath, 'utf8'),
    `docs/formal/${topic}/formal.json`
  );

  // EXTENDS で読む同じディレクトリの .tla。どれもリポジトリの中の実体であることを確かめてから読む
  const modules: Record<string, string> = {};
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.tla'))) {
    modules[name.slice(0, -'.tla'.length)] = readFileSync(
      resolveInRepo(dir, name, repoRoot),
      'utf8'
    );
  }

  for (const check of checks) {
    test(`formal ${topic}/${check.id}: ${check.expect}`, async () => {
      const source = readFileSync(resolveInRepo(dir, check.model, repoRoot), 'utf8');
      const config = readFileSync(resolveInRepo(dir, check.cfg, repoRoot), 'utf8');
      const outcome = await runTlaCheck({
        source,
        config,
        modules,
        ...(check.timeoutSec === undefined ? {} : { timeoutSec: check.timeoutSec }),
      });
      const judgement = judgeOutcome(check, outcome);
      assert.ok(judgement.ok, judgement.message);
    });

    if (check.sync !== undefined) {
      const sync = check.sync;
      test(`formal ${topic}/${check.id}: the covered files match the model`, () => {
        const judgement = checkCovers(sync, repoRoot);
        assert.ok(judgement.ok, judgement.message);
      });
    }
  }
}
