import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunLine, RunStatus } from './types.js';

const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];
const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const MISSING = new Set(['ENOENT', 'ENOTDIR', 'EISDIR']);

function isStatus(value: string): value is RunStatus {
  return (STATUSES as readonly string[]).includes(value);
}

function errorCode(error: unknown): string | null {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : null;
}

// The edge of the program: everything past this returns a typed RunLine or nothing
// (docs/styleguide.md). A line that fails any check is a bad line, not a thrown error.
function parseLine(raw: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { at, job, status, owner, error } = value as Record<string, unknown>;
  if (typeof at !== 'string' || typeof job !== 'string') return null;
  if (typeof status !== 'string' || !isStatus(status)) return null;
  if (owner !== undefined && owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;
  const line: RunLine = { at, job, status, owner: owner ?? null };
  return error === undefined ? line : { ...line, error };
}

/**
 * Read `runs/<night>.jsonl` into one row per job.
 *
 * `null` means there is no such night: no file on disk, or a `night` that is not a date.
 * Checking the shape here keeps a route param out of the file path even if a caller forgets
 * to validate it.
 *
 * Aggregation runs in file order, because a run log is appended as the night goes:
 * `firstAt` is the job's first line, `lastAt`, `lastStatus` and `lastError` its last.
 * `owner` is the first non-null owner the job shows, or `null` (the view renders `—`).
 */
export const readNight: ReadNight = (runsDir: string, night: string): Night | null => {
  if (!NIGHT.test(night)) return null;

  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    const code = errorCode(error);
    if (code !== null && MISSING.has(code)) return null;
    throw error;
  }

  let badLines = 0;
  const byJob = new Map<string, DigestRow>();

  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue; // blank lines, the trailing newline included, are not lines
    const line = parseLine(raw);
    if (line === null) {
      badLines += 1;
      continue;
    }
    const row = byJob.get(line.job);
    if (row === undefined) {
      byJob.set(line.job, {
        job: line.job,
        owner: line.owner,
        runs: 1,
        retries: line.status === 'retry' ? 1 : 0,
        lastStatus: line.status,
        lastError: line.error ?? null,
        firstAt: line.at,
        lastAt: line.at,
      });
      continue;
    }
    row.runs += 1;
    if (line.status === 'retry') row.retries += 1;
    row.lastStatus = line.status;
    row.lastError = line.error ?? null;
    row.lastAt = line.at;
    if (row.owner === null) row.owner = line.owner;
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines };
};
