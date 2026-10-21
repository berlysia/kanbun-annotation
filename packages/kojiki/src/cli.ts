/**
 * 取得 CLI の入口 (build の後は dist/update-source.js)。import しただけで走るので、テストや index.ts
 * からは import しない。host と rev は source-pin.ts / update-source.ts の定数で、引数では変えられない。
 */

import { KOJIKI_CACHE_PATH } from './build-document.ts';
import { KOJIKI_SOURCE_SHA256 } from './source-pin.ts';
import { fetchWikitext, runUpdateSource } from './update-source.ts';

process.exitCode = await runUpdateSource({
  cachePath: KOJIKI_CACHE_PATH,
  expectedSha256: KOJIKI_SOURCE_SHA256,
  fetchPage: fetchWikitext,
  log: (line) => console.log(line),
});
