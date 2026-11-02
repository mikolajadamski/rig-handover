import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/read.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightEntry[];
};

// Counts are run lines by status, from the same reader the digest page uses.
// `counts` is null when the night fails to read; the board shows `—`.
export type NightEntry = {
  night: string;
  counts: { ok: number; retry: number; fail: number } | null;
};

function nightEntry(runsDir: string, night: string): NightEntry {
  try {
    const read = readNight(runsDir, night);
    if (read === null) return { night, counts: null };
    // Lines, not jobs. DigestRow keeps no per-status line count, so: retry = sum of retries,
    // fail = jobs whose last line failed, ok = the remaining lines. A fail line that a later
    // line of the same job overrode is not visible to the reader and is counted as ok.
    let runs = 0;
    let retry = 0;
    let fail = 0;
    for (const row of read.rows) {
      runs += row.runs;
      retry += row.retries;
      if (row.lastStatus === 'fail') fail += 1;
    }
    return { night, counts: { ok: runs - retry - fail, retry, fail } };
  } catch {
    return { night, counts: null };
  }
}

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((n) => nightEntry(config.runsDir, n)),
  };
}
