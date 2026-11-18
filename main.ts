// GOLDEN TIDE 3D — the entrypoint (Node 22, standard library only).
// The game itself is the plain static files under game/: index.html and its
// ES modules, plus the vendored three.js build under game/vendor/ — no
// network request at run time. This program hands it in: it copies game/ and
// screenshots/ from beside this file into /output and writes
// /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library.
//
// Play it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The folder this file lives in, and the folder the grader collects.
const root = fileURLToPath(new URL('.', import.meta.url));
const output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(output, { recursive: true });
cpSync(join(root, 'game'), join(output, 'game'), { recursive: true });
mkdirSync(join(output, 'screenshots'), { recursive: true });
if (existsSync(join(root, 'screenshots'))) {
  cpSync(join(root, 'screenshots'), join(output, 'screenshots'), { recursive: true });
}

// The gate's own caps, as the kit states them: the dossier text is capped, and so
// are the screenshots and the game tree. Anything over a cap is refused, so the
// dossier is built with the same numbers the gate checks.
writeFileSync(
  join(output, 'dossier.json'),
  buildDossier(output, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
