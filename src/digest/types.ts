// The contract every part of plan.md § 2 is built against. Committed before the reader
// (issue #1) so the page, the JSON, the board and the route tests can start in parallel.
//
// Two decisions live here, because they are what keeps the page and the JSON from disagreeing
// (ADR 0001):
//
// 1. `Night.rows` arrive sorted by job. Sorting is the reader's job, never a view's.
// 2. `readNight` returns `null` for a night with no file, so a caller can tell "no file" (404)
//    from "the file is empty" ("nothing ran"). An empty file is a `Night` with no rows.

export type RunStatus = 'ok' | 'retry' | 'fail';

/** One parsed line of `runs/<night>.jsonl`. Input is parsed at the edge; after that, trust it. */
export type RunLine = {
  /** ISO 8601 with the offset the log wrote. Never converted to UTC (docs/styleguide.md). */
  at: string;
  job: string;
  status: RunStatus;
  /** The log writes `null` for an unowned job. The row stays; the view shows `—`. */
  owner: string | null;
  error?: string;
};

/** One row per job for one night. */
export type DigestRow = {
  job: string;
  owner: string | null;
  /** Every line for this job, whatever its status. */
  runs: number;
  /** Lines with status `retry`. 3 or more is marked on the page. */
  retries: number;
  /** Status of this job's last line, in file order. */
  lastStatus: RunStatus;
  /** Error of this job's last line, or `null` when that line carried none. */
  lastError: string | null;
  /** First and last `at` for this job, in file order, offset kept. */
  firstAt: string;
  lastAt: string;
};

/** One night, read. `rows` are sorted by job. */
export type Night = {
  night: string;
  rows: DigestRow[];
  /** Lines that did not parse. Counted, never thrown: the night still renders. */
  badLines: number;
};

/**
 * Read one night into rows. `null` means the night has no file on disk.
 * Implemented in `src/digest/read.ts` (issue #2).
 */
export type ReadNight = (runsDir: string, night: string) => Night | null;
