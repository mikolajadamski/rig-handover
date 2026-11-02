import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

// runs/ is read-only (AGENTS.md): anything but the two real nights goes in a temp dir.
function tempNight(night: string, body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(dir, `${night}.jsonl`), body);
  return dir;
}

describe('readNight on the real nights', () => {
  it('reads 2026-10-28 as 5 jobs and 1 bad line', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night).not.toBeNull();
    expect(night?.rows).toHaveLength(5);
    expect(night?.badLines).toBe(1);
  });

  it('sorts the rows by job', () => {
    expect(readNight('runs', '2026-10-28')?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts retries and takes the last status from the last line', () => {
    const rows = readNight('runs', '2026-10-28')?.rows ?? [];
    const refresh = rows.find((r) => r.job === 'fixtures/refresh');
    expect(refresh).toMatchObject({
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      owner: 'rook',
    });

    const sync = rows.find((r) => r.job === 'lane/sync');
    expect(sync).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok' });
  });

  it('keeps the last error of a failed job', () => {
    const backup = readNight('runs', '2026-10-28')?.rows.find((r) => r.job === 'notes/backup');
    expect(backup).toMatchObject({ runs: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('keeps a row whose owner is null', () => {
    const render = readNight('runs', '2026-10-28')?.rows.find((r) => r.job === 'digest/render');
    expect(render?.owner).toBeNull();
    expect(render?.runs).toBe(1);
  });

  it('keeps the offset from the log and never converts to UTC', () => {
    const refresh = readNight('runs', '2026-10-28')?.rows.find((r) => r.job === 'fixtures/refresh');
    expect(refresh?.firstAt).toBe('2026-10-29T01:30:00+01:00');
    expect(refresh?.lastAt).toBe('2026-10-29T01:37:00+01:00');
  });

  it('reads the quiet night too', () => {
    const night = readNight('runs', '2026-10-27');
    expect(night?.badLines).toBe(0);
    expect(night?.rows.map((r) => r.job)).toEqual([
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });
});

describe('readNight on nights that are not there', () => {
  it('returns null for a night with no file', () => {
    expect(readNight('runs', '2026-01-01')).toBeNull();
  });

  it('returns null for a runs dir that does not exist', () => {
    expect(readNight('no-such-dir', '2026-10-28')).toBeNull();
  });

  it('returns null for a night that is not a date, so a param never reaches the path', () => {
    expect(readNight('runs', '../../etc/passwd')).toBeNull();
    expect(readNight('runs', 'nope')).toBeNull();
  });
});

describe('readNight on odd files', () => {
  it('returns a night with no rows for an empty file', () => {
    const dir = tempNight('2026-10-30', '');
    expect(readNight(dir, '2026-10-30')).toEqual({ night: '2026-10-30', rows: [], badLines: 0 });
  });

  it('does not count a trailing newline as a bad line', () => {
    const dir = tempNight('2026-10-30', '{"at":"2026-10-30T23:00:00+01:00","job":"a","status":"ok","owner":null}\n');
    expect(readNight(dir, '2026-10-30')?.badLines).toBe(0);
  });

  it('counts a line that does not parse and still renders the night', () => {
    const dir = tempNight(
      '2026-10-30',
      [
        '{"at":"2026-10-30T23:00:00+01:00","job":"a","status":"ok","owner":"rook"}',
        '{"at":"2026-10-30T23:01:00+01:00","job":"a","stat',
        'not json at all',
        '{"at":"2026-10-30T23:02:00+01:00","job":"b","status":"fail","owner":null,"error":"boom"}',
      ].join('\n'),
    );
    const night = readNight(dir, '2026-10-30');
    expect(night?.badLines).toBe(2);
    expect(night?.rows.map((r) => r.job)).toEqual(['a', 'b']);
  });

  it('counts a line whose status is not one of the three', () => {
    const dir = tempNight('2026-10-30', '{"at":"2026-10-30T23:00:00+01:00","job":"a","status":"weird","owner":null}');
    expect(readNight(dir, '2026-10-30')).toMatchObject({ rows: [], badLines: 1 });
  });
});

describe('status counts are counted, not derived (issue #9, from review of #5)', () => {
  it('counts a fail that a later line of the same job overrode', () => {
    const dir = tempNight(
      '2026-10-30',
      [
        '{"at":"2026-10-30T23:00:00+01:00","job":"notes/backup","status":"fail","owner":null,"error":"quota exceeded"}',
        '{"at":"2026-10-30T23:05:00+01:00","job":"notes/backup","status":"ok","owner":null}',
      ].join('\n'),
    );
    const row = readNight(dir, '2026-10-30')?.rows[0];
    // The job ends ok, but the night still ran one failure. Deriving ok as runs - retry - fail
    // reported 2 ok and 0 fail here, which is the bug issue #9 fixes.
    expect(row?.lastStatus).toBe('ok');
    expect(row?.statuses).toEqual({ ok: 1, retry: 0, fail: 1 });
    expect(row?.runs).toBe(2);
  });

  it('keeps the real night at 10 ok, 4 retry, 1 fail', () => {
    const rows = readNight('runs', '2026-10-28')?.rows ?? [];
    const total = rows.reduce(
      (sum, row) => ({
        ok: sum.ok + row.statuses.ok,
        retry: sum.retry + row.statuses.retry,
        fail: sum.fail + row.statuses.fail,
      }),
      { ok: 0, retry: 0, fail: 0 },
    );
    expect(total).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('sums the three counts to the night’s good lines', () => {
    const night = readNight('runs', '2026-10-28');
    const rows = night?.rows ?? [];
    const good = rows.reduce((n, row) => n + row.runs, 0);
    const counted = rows.reduce((n, row) => n + row.statuses.ok + row.statuses.retry + row.statuses.fail, 0);
    expect(counted).toBe(good);
    expect(good + (night?.badLines ?? 0)).toBe(16); // every non-blank line in the fixture
  });
});
