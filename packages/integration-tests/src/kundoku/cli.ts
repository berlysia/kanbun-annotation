/**
 * 取得 CLI の入口 (`node src/kundoku/cli.ts`。Node の型の除去で動くので、構文は型の注釈だけにする)。
 * import しただけで走るので、テストからは import しない。commit と sha256 は source-pin.ts の定数で、
 * 引数では変えられない。@kanbun-skam/kojiki の dist を使うので、先に build が要る。
 */

import { runKundokuUpdateSource } from './update-source.ts';

process.exitCode = await runKundokuUpdateSource((line) => console.log(line));
