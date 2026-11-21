// wand/verify.js
// Self-verifying downloads for lossy links (BLE). Serial passes the first time;
// a lossy BLE link triggers automatic re-downloads instead of silently returning bad data.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Most common field count across rows (the "expected" shape). */
export function modalLength(rows) {
  const freq = new Map();
  for (const r of rows) freq.set(r.length, (freq.get(r.length) || 0) + 1);
  let best = 0, bestN = -1;
  for (const [len, n] of freq) if (n > bestN) { best = len; bestN = n; }
  return best;
}

/** Rows whose field count differs from the rest: the signature of two rows merged by a lost chunk. */
export function countSuspectRows(rows) {
  if (!rows.length) return 0;
  const m = modalLength(rows);
  return rows.filter((r) => r.length !== m).length;
}

const signature = (rows) => JSON.stringify(rows);

// Rows that start with a strictly increasing integer (record number) can be merged across attempts.
const isSeqKeyed = (rows) =>
  rows.length > 0 &&
  rows.every((r) => /^\d+$/.test(String(r[0] ?? ""))) &&
  rows.every((r, i) => i === 0 || Number(r[0]) > Number(rows[i - 1][0]));

/**
 * Run `fetchOnce(attempt, maxAttempts)` (returns an array of raw rows) until the data is trustworthy.
 *
 * A lossy BLE link drops different rows on every attempt, so a perfectly clean download may never
 * happen. When rows carry an increasing record number, results are MERGED across attempts:
 *   - done when the merged set reaches `expectedCount` (if known), otherwise
 *   - done when an attempt (after the first) adds no new rows.
 * Otherwise (no usable record numbers) one download must be well-formed and either match
 * `expectedCount` or be identical to the previous download.
 *
 * Throws instead of returning data that may be missing rows.
 */
export async function verifiedDownload(fetchOnce, { expectedCount = null, maxAttempts = 6, session = null } = {}) {
  const expected = (expectedCount !== null && expectedCount !== "" && Number.isFinite(Number(expectedCount)))
    ? Number(expectedCount) : null;

  const merged = new Map(); // record number -> row
  let keyedAll = true;
  let prevSig = null;
  let noNewStreak = 0;
  let best = null, lastErr = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let rows;
    const droppedBefore = session?.stats?.droppedFragments ?? null;
    try {
      rows = await fetchOnce(attempt, maxAttempts);
    } catch (e) {
      lastErr = e;
      console.warn(`[wand] download attempt ${attempt}/${maxAttempts} failed:`, e?.message || e);
      session?.resetRx?.();
      await sleep(500);
      session?.resetRx?.();
      prevSig = null;
      continue;
    }

    // Drop merged rows (wrong field count) before anything else.
    const m = modalLength(rows);
    const clean = rows.filter((r) => r.length === m);
    const suspect = rows.length - clean.length;

    // Did the session see truncated frames during this attempt? null = unknown (no stats available).
    const dropped = droppedBefore === null ? null : (session.stats.droppedFragments - droppedBefore);
    // A first pass with no dropped fragments and no merged rows needs no confirming second pass
    // (only when there is no expected count to check against).
    const cleanFirstPass = attempt === 1 && expected === null && dropped === 0 && suspect === 0;

    if (keyedAll && !isSeqKeyed(clean)) keyedAll = false;

    if (keyedAll) {
      let added = 0;
      for (const r of clean) {
        if (!merged.has(r[0])) { merged.set(r[0], r); added++; }
      }
      noNewStreak = added === 0 ? noNewStreak + 1 : 0;
      console.info(`[wand] attempt ${attempt}/${maxAttempts}: got ${clean.length} rows, +${added} new, ${merged.size} total` +
        (expected !== null ? ` of ${expected}` : "") + (suspect ? `, ${suspect} malformed dropped` : "") +
        (dropped ? `, ${dropped} truncated frames` : ""));

      const done = expected !== null
        ? merged.size >= expected
        : (cleanFirstPass || (attempt >= 2 && added === 0));
      if (done) return [...merged.values()].sort((a, b) => Number(a[0]) - Number(b[0]));
      continue;
    }

    // Fallback: whole-download verification.
    const sig = signature(rows);
    const countOk = expected !== null && rows.length === expected;
    const repeatOk = prevSig !== null && sig === prevSig;
    if (suspect === 0 && (countOk || repeatOk || cleanFirstPass)) return rows;
    console.warn(`[wand] attempt ${attempt}/${maxAttempts}: ${rows.length} rows` +
      (expected !== null ? ` (expected ${expected})` : "") + `, ${suspect} malformed`);
    if (!best || suspect < best.suspect || (suspect === best.suspect && rows.length > best.rows)) {
      best = { rows: rows.length, suspect };
    }
    prevSig = suspect === 0 ? sig : null;
  }

  // Keyed merge that never reached the expected count: accept only if it has stopped growing
  // (the device's count probably disagrees with the task list), and say so.
  if (keyedAll && merged.size && noNewStreak >= 2) {
    console.warn(`[wand] merged ${merged.size} rows; stable across attempts` +
      (expected !== null ? ` but expected ${expected}` : ""));
    return [...merged.values()].sort((a, b) => Number(a[0]) - Number(b[0]));
  }

  const detail = keyedAll && merged.size
    ? ` Got ${merged.size}${expected !== null ? ` of ${expected}` : ""} rows.`
    : best ? ` Best attempt: ${best.rows} rows${expected !== null ? ` of ${expected}` : ""}, ${best.suspect} malformed.`
    : (lastErr ? ` Last error: ${lastErr.message || lastErr}` : "");
  throw new Error(`Download could not be verified after ${maxAttempts} attempts (lossy link?).${detail}`);
}

/**
 * Timeouts for bulk downloads (hundreds to thousands of records).
 *  - timeoutMsOverride: INACTIVITY limit (resets whenever data arrives)
 *  - absoluteTimeoutMs: hard cap on total time per download attempt
 * The cap scales with the expected row count when known (generous: ~150 ms/row, i.e. a slow
 * 9600 baud link), otherwise a fixed 10 minutes. Clamped to 1..30 minutes.
 */
export function bulkTimeouts(expectedRows = null) {
  const n = Number(expectedRows);
  const abs = Number.isFinite(n) && n > 0 ? 60000 + n * 150 : 10 * 60000;
  return {
    timeoutMsOverride: 20000,
    absoluteTimeoutMs: Math.min(30 * 60000, Math.max(60000, abs)),
  };
}
