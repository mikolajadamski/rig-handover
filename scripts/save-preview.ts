// Save one rig page as one self-contained HTML file (plan.md § 3).
//
// A command, not a browser's "save as": the page has no client JS and one inline stylesheet
// (ADR 0001), so the bytes the server renders are the whole page.
//
//   pnpm preview                      -> var/preview/index.html, lane banner from .env
//   pnpm preview --no-marker          -> the same page with LANE_MARKER unset (plan.md § 4)
//   pnpm preview /digest/2026-10-27   -> another route
//
// The output goes under var/, which .gitignore already excludes: no preview belongs in the
// repo, because there the marker cannot be taken off again (ADR 0003).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const noMarker = args.includes('--no-marker');

// Before the app is imported, so lane() sees the environment we mean (ADR 0003 clean-up).
if (noMarker) delete process.env.LANE_MARKER;

const { createApp } = await import('../src/app.js');
const { loadConfig } = await import('../src/config.js');
const { lane } = await import('../src/lane.js');

const route = args.find((a) => a.startsWith('/')) ?? '/digest/2026-10-28';
const out = args.find((a) => a.startsWith('var/')) ?? 'var/preview/index.html';

const res = await createApp(loadConfig()).request(route);
if (res.status !== 200) {
  console.error(`rig · ${route} answered ${res.status}, nothing saved`);
  process.exit(1);
}

const html = await res.text();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);

const marker = lane().marker;
console.log(`rig · saved ${route} -> ${out} · ${html.length} bytes · banner: ${marker ?? 'no marker set'}`);
