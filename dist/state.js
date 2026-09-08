import { Actor } from 'apify';
// Fixed, unique-to-this-actor store name (matches the `salta-compras-monitor`
// package name) - deliberately NOT the run's own default key-value store,
// which is isolated per run and would not survive between scheduled runs.
export const DELTA_STATE_STORE_NAME = 'salta-compras-monitor-delta-state';
const STATE_KEY = 'STATE';
// A few thousand is enough to cover every publication ever recorded during a normal
// recurring-run cadence without the state growing unbounded.
const MAX_SEEN_IDS = 5000;
const EMPTY_STATE = { entries: {}, lastRunAt: null };
async function defaultStore() {
    return Actor.openKeyValueStore(DELTA_STATE_STORE_NAME);
}
function isValidState(value) {
    if (!value || typeof value !== 'object')
        return false;
    const v = value;
    return typeof v.entries === 'object' && v.entries !== null;
}
export async function loadDeltaState(store) {
    const kv = store ?? (await defaultStore());
    const state = await kv.getValue(STATE_KEY);
    // A v1-shaped state ({ seenIds: string[] }) fails isValidState and is treated as absent -
    // the first v2 run on an existing schedule re-baselines rather than crashing on the old
    // shape. Disclosed in CHANGELOG.md.
    return isValidState(state) ? state : { ...EMPTY_STATE };
}
/**
 * Merges this run's observed (id, entry) pairs into the previously persisted state, then
 * caps it. Capped by DESCENDING NUMERIC id, not by fetch/page order - see AGENTS.md for why
 * this source's listing order (sorted by upcoming bid-opening deadline, not creation) makes
 * the id itself the only field that plausibly tracks creation order.
 *
 * Every id fetchListing walked past this run (not just the ones that passed onlyNew/dateRange)
 * must be included in `observed` - a record filtered out today must still be recognized as
 * seen by a future onlyNew run, or it would incorrectly resurface.
 */
export async function saveDeltaState(previous, observed, lastRunAt, store) {
    const kv = store ?? (await defaultStore());
    const entries = { ...previous.entries };
    for (const { id, entry } of observed)
        entries[id] = entry;
    const cappedIds = Object.keys(entries)
        .sort((a, b) => Number(b) - Number(a))
        .slice(0, MAX_SEEN_IDS);
    const cappedEntries = {};
    for (const id of cappedIds)
        cappedEntries[id] = entries[id];
    const next = { entries: cappedEntries, lastRunAt };
    await kv.setValue(STATE_KEY, next);
    return next;
}
//# sourceMappingURL=state.js.map