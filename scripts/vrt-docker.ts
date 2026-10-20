/**
 * Run the visual regression tests inside the Playwright Docker image.
 *
 * Usage:
 *   pnpm test:visual:docker [playwright arguments...]
 *   UPDATE_SNAPSHOTS=1 pnpm test:visual:docker      # update baselines
 *
 * The host's headless Chromium can hang in `toHaveScreenshot`, and baselines taken
 * on one OS do not match another. The official image gives a fixed environment.
 * The host's node_modules is used as is (nothing is installed in the image).
 */
import { spawn } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const INTEGRATION_DIR = 'packages/integration-tests';
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export type ImageResult = { ok: true; image: string } | { ok: false; reason: string };

export function getPlaywrightImage(playwrightVersion: string): ImageResult {
  if (!VERSION_PATTERN.test(playwrightVersion)) {
    return {
      ok: false,
      reason: `@playwright/test in ${INTEGRATION_DIR}/package.json must be an exact version like 1.58.0, got ${JSON.stringify(playwrightVersion)}`,
    };
  }
  return { ok: true, image: `mcr.microsoft.com/playwright:v${playwrightVersion}-noble` };
}

export function buildDockerArgs(options: {
  repoRoot: string;
  image: string;
  uid: number;
  gid: number;
  playwrightArgs: readonly string[];
}): string[] {
  const { repoRoot, image, uid, gid, playwrightArgs } = options;
  // No --network option: the default bridge network is needed because the rendered
  // pages load Google Fonts. No --env-file, --privileged, --cap-add or docker socket.
  return [
    'run',
    '--rm',
    '--init',
    // Playwright recommends --ipc=host for Chromium; without it Chromium can run out of
    // shared memory and crash.
    '--ipc=host',
    '-u',
    `${uid}:${gid}`,
    '-e',
    'HOME=/tmp',
    // Without a value, docker passes the host's value only when it is set.
    '-e',
    'UPDATE_SNAPSHOTS',
    '--mount',
    `type=bind,src=${repoRoot},dst=/work`,
    '-w',
    `/work/${INTEGRATION_DIR}`,
    image,
    './node_modules/.bin/playwright',
    'test',
    ...playwrightArgs,
  ];
}

export interface HostFacts {
  repoRoot: string;
  uid: number;
  dockerAvailable: boolean;
  // undefined: the path does not exist
  testResults: { isSymlink: boolean; ownerUid: number } | undefined;
  rendererDistExists: boolean;
}

export function checkPreconditions(facts: HostFacts): string[] {
  const problems: string[] = [];
  if (!facts.dockerAvailable) {
    problems.push('docker was not found in PATH. Install Docker and try again.');
  }
  if (facts.repoRoot.includes(',')) {
    problems.push(
      `The repository path contains ',' (${facts.repoRoot}), which breaks docker's --mount. Move the repository to a path without ','.`
    );
  }
  const testResultsPath = join(facts.repoRoot, INTEGRATION_DIR, 'test-results');
  const results = facts.testResults;
  if (results?.isSymlink) {
    problems.push(
      `${testResultsPath} is a symlink. Remove it yourself after checking where it points: rm ${testResultsPath}`
    );
  } else if (results !== undefined && results.ownerUid !== facts.uid) {
    problems.push(
      `${testResultsPath} is owned by uid ${results.ownerUid}, not you (uid ${facts.uid}). Remove it with: sudo rm -rf ${testResultsPath}`
    );
  }
  if (!facts.rendererDistExists) {
    problems.push(
      'packages/skam-html-renderer/dist is missing (the VRT imports the built packages). Run: pnpm build'
    );
  }
  return problems;
}

function readPlaywrightVersion(): string {
  const pkg: unknown = JSON.parse(
    readFileSync(join(REPO_ROOT, INTEGRATION_DIR, 'package.json'), 'utf8')
  );
  const deps = (pkg as { devDependencies?: Record<string, string> }).devDependencies;
  return deps?.['@playwright/test'] ?? '';
}

function isDockerAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('docker', ['--version'], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

function lstatOrUndefined(path: string): Stats | undefined {
  try {
    return lstatSync(path);
  } catch {
    return undefined;
  }
}

function fail(messages: readonly string[]): never {
  for (const message of messages) console.error(`vrt-docker: ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  if (uid === undefined || gid === undefined) fail(['This script needs a POSIX host (uid/gid).']);

  const imageResult = getPlaywrightImage(readPlaywrightVersion());
  if (!imageResult.ok) fail([imageResult.reason]);

  const stat = lstatOrUndefined(join(REPO_ROOT, INTEGRATION_DIR, 'test-results'));
  const problems = checkPreconditions({
    repoRoot: REPO_ROOT,
    uid,
    dockerAvailable: await isDockerAvailable(),
    testResults: stat && { isSymlink: stat.isSymbolicLink(), ownerUid: stat.uid },
    rendererDistExists: existsSync(join(REPO_ROOT, 'packages/skam-html-renderer/dist')),
  });
  if (problems.length > 0) fail(problems);

  const args = buildDockerArgs({
    repoRoot: REPO_ROOT,
    image: imageResult.image,
    uid,
    gid,
    playwrightArgs: process.argv.slice(2),
  });
  const child = spawn('docker', args, { stdio: 'inherit' });
  child.on('error', (error) => fail([`failed to start docker: ${error.message}`]));
  child.on('close', (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
  });
}

if (import.meta.main) {
  await main();
}
