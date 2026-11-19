// ISLA FORTUNA — the entrypoint (Node 22, standard library only).
// The game is the plain static files under game/: index.html and its ES
// modules, plus the vendored three.js build under game/vendor/ — no network
// request at run time. This program hands it in: it copies game/ and
// screenshots/ from beside this file into /output and writes
// /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library.
//
// Play it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The folder this file lives in, and the folder the grader collects.
const root = fileURLToPath(new URL('.', import.meta.url));
const output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Empty the CONTENTS of the output dir, but NEVER delete the dir itself:
// the grader runs as uid 65534 and cannot delete /output, so a rmSync on
// the dir would fail the run. Removing the entries inside is safe.
mkdirSync(output, { recursive: true });
for (const entry of readdirSync(output)) {
  rmSync(join(output, entry), { recursive: true, force: true });
}

cpSync(join(root, 'game'), join(output, 'game'), { recursive: true });
mkdirSync(join(output, 'screenshots'), { recursive: true });
if (existsSync(join(root, 'screenshots'))) {
  cpSync(join(root, 'screenshots'), join(output, 'screenshots'), { recursive: true });
}

// The gate's own caps, as the kit states them: the dossier text is capped, and so
// are the screenshots and the game tree. Anything over a cap is refused, so the
// program refuses first instead of handing in a bad entry.
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
