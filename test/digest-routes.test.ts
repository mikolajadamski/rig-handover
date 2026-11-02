import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

const base = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60 };

// runs/ is read-only (AGENTS.md): anything but the two real nights goes in a temp dir.
function appWith(night: string, body: string) {
  const dir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
  writeFileSync(join(dir, `${night}.jsonl`), body);
  return createApp({ ...base, runsDir: dir });
}

const real = createApp({ ...base, runsDir: 'runs' });

type Api = { night: string; rows: DigestRow[]; badLines: number };

describe('digest routes on a real night', () => {
  it('serves the page with 200', async () => {
    const res = await real.request('/digest/2026-10-28');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('fixtures/refresh');
  });

  it('serves the JSON with 200', async () => {
    const res = await real.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Api;
    expect(body.night).toBe('2026-10-28');
    expect(body.rows).toHaveLength(5);
  });

  it('page and JSON report the same jobs in the same order', async () => {
    const html = await (await real.request('/digest/2026-10-28')).text();
    const body = (await (await real.request('/api/digest/2026-10-28')).json()) as Api;
    const jobs = body.rows.map((r) => r.job);
    expect(jobs).toEqual([...jobs].sort());
    const positions = jobs.map((j) => html.indexOf(`<td>${j}</td>`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

describe('digest routes on a night with no file', () => {
  it('404s the page', async () => {
    expect((await real.request('/digest/2026-01-01')).status).toBe(404);
  });

  it('404s the JSON', async () => {
    expect((await real.request('/api/digest/2026-01-01')).status).toBe(404);
  });
});

describe('digest routes on the empty night', () => {
  const app = appWith('2026-10-30', '');

  it('renders "nothing ran" with 200', async () => {
    const res = await app.request('/digest/2026-10-30');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('returns an empty row list with 200', async () => {
    const res = await app.request('/api/digest/2026-10-30');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-10-30', rows: [], badLines: 0 });
  });
});

describe('digest routes on a night with a bad line', () => {
  const app = appWith(
    '2026-10-30',
    [
      '{"at":"2026-10-30T23:00:00+01:00","job":"b","status":"ok","owner":"rook"}',
      'not json at all',
      '{"at":"2026-10-30T23:02:00+01:00","job":"a","status":"fail","owner":null,"error":"boom"}',
    ].join('\n'),
  );

  it('still serves the page with 200 and says a line was skipped', async () => {
    const res = await app.request('/digest/2026-10-30');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('1 bad line skipped');
    expect(html.indexOf('<td>a</td>')).toBeLessThan(html.indexOf('<td>b</td>'));
  });

  it('still serves the JSON with 200 and counts the bad line', async () => {
    const res = await app.request('/api/digest/2026-10-30');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Api;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['a', 'b']);
  });
});
