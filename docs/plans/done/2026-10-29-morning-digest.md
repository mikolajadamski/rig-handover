---
plan: morning-digest
status: done
owner: rook
opened: 2026-10-29
closed: 2026-11-07
---

# Morning digest

The night's run log is a JSONL file nobody reads. By breakfast someone has to know what ran,
what retried, what failed, and whose it was, without opening `runs/`. rig already serves the
status board; the digest is one more page on it.

Out of scope: notifications, history across nights, auth (rig only listens on localhost).

## 1. Run log reader

Read `runs/<night>.jsonl` into one row per job: job, owner, runs, retries, last status, last
error, first and last time. One JSON object per line (`at`, `job`, `status`: `ok | retry | fail`,
`owner`, optional `error`).

- A line that doesn't parse is counted, never thrown. The night still renders.
- `owner` can be `null`. Keep the row; show the owner as `—`.
- Lives in `src/digest/`. Commit `src/digest/types.ts` first (the `DigestRow` type and the
  `readNight(runsDir, night)` signature), so every part of section 2 can start against it.

Done when: reader tests pass on `runs/2026-10-28.jsonl` (5 jobs, 1 bad line).

## 2. Digest page

Four small parts. Each needs only `src/digest/types.ts` from section 1, so once that is in they
can go to four workers at once. Small, well-specified work: a cheaper model is fine here.

### 2a. Page

`GET /digest/:night` renders the rows with the usual layout: one table, sorted by job, retries of
3 or more and any `fail` marked. A night with no file returns 404; an empty file renders
"nothing ran".

Done when: `/digest/2026-10-28` renders locally.

### 2b. JSON

`GET /api/digest/:night` returns the same rows as JSON. Agents read this one; the page and the
JSON must never disagree (ADR 0001).

Done when: the JSON for 2026-10-28 has the same jobs, in the same order, as the page.

### 2c. Board link

The status board links each night on disk to its digest, with its ok / retry / fail counts beside
it.

Done when: both nights on disk link to a digest that renders.

### 2d. Route tests

Route tests for 2a and 2b: 200, 404 for a night with no file, the empty night, a night with a bad
line. Use a temp runs dir; `runs/` is read-only.

Done when: `pnpm test` is green with the new tests.

## 3. Preview for review

The reviewer reads the page from a copy, not from the lane. Run rig and save `/digest/2026-10-28` as
one HTML file, lane banner included (a command, not a browser's "save as"; the page is
self-contained, ADR 0001). Put it on your own public host, one where you can upload over it later (any bucket
or static host, ADR 0003), so it opens from a public HTTPS link. Send the reviewer the link and the
issues for this plan.

Done when: the preview link is sent to the reviewer.

## 4. Clean up

The preview carries this lane's marker on a public link (ADR 0003). Take the marker off: save the
page again with `LANE_MARKER` unset (the banner reads "no marker set") and upload it over the same
link. Move this plan to `docs/plans/done/` with its issue list.

Done when: the preview link no longer shows the lane marker.

## Issues

| # | Issue | Blocked by | Worker | Closed |
|---|-------|-----------|--------|--------|
| 1 | Digest types: `DigestRow` and `readNight` signature | — | claude-code · opus-5 · high | 2026-11-02 |
| 2 | Run log reader: `readNight` over `runs/<night>.jsonl` | #1 | claude-code · opus-5 · high | 2026-11-02 |
| 3 | Digest page: `GET /digest/:night` | #1, #2 | claude-code · sonnet-5.5 · low | 2026-11-02 |
| 4 | Digest JSON: `GET /api/digest/:night` | #1, #2 | claude-code · sonnet-5.5 · low | 2026-11-02 |
| 5 | Board links each night to its digest | #1, #2 | claude-code · sonnet-5.5 · low | 2026-11-02 |
| 6 | Route tests for the digest page and JSON | #3, #4 | claude-code · sonnet-5.5 · low | 2026-11-02 |
| 7 | Preview for review | #3, #5 | claude-code · opus-5 · medium | 2026-11-07 |
| 8 | Clean up: marker off, plan to `docs/plans/done/` | #7 | claude-code · opus-5 · medium | 2026-11-07 |
| 9 | Exact status counts: count lines, do not derive them | — | claude-code · opus-5 · high | 2026-11-02 |

Section 1 became two issues, #1 and #2, so the four parts of section 2 could start against the
committed contract instead of waiting for the reader. #3, #4 and #5 then ran as three workers at
once, one branch and one worktree each.

#9 came from review of #5, not from the plan. The board's ok count was derived as
`runs - retry - fail`, with `fail` taken from each job's last status. That is exact on both nights
in `runs/` and wrong for a job that fails and then succeeds the same night: the failed run was
counted as ok. `DigestRow` now counts its own lines by status.

#7 was closed once on "the link is sent" and had to be reopened: sending the link is not the
review. It closed when the reviewer had actually read the page. The preview went up on 2 November
and lost its marker on 7 November, as soon as the review was in (ADR 0003).
