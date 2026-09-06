import { Actor } from 'apify';

// Fixed, unique-to-this-actor store name (matches the `salta-compras-monitor`
// package name) - deliberately NOT the run's own default key-value store,
// which is isolated per run and would not survive between scheduled runs.
export const DELTA_STATE_STORE_NAME = 'salta-compras-monitor-delta-state';

const STATE_KEY = 'STATE';

// A few thousand is enough to cover every publication ever recorded during
// a normal recurring-run cadence without the state growing unbounded - see
// the sort-before-cap note below for why this number, not fetch order,
// decides which ids survive a trim.
const MAX_SEEN_IDS = 5000;

export interface DeltaState {
    seenIds: string[];
    lastRunAt: string | null;
}

const EMPTY_STATE: DeltaState = { seenIds: [], lastRunAt: null };

// Minimal shape actually used from apify's KeyValueStore, so tests can pass
// a plain in-memory fake instead of touching real Apify storage.
export interface DeltaStateStore {
    getValue<T>(key: string): Promise<T | null>;
    setValue<T>(key: string, value: T | null): Promise<void>;
}

async function defaultStore(): Promise<DeltaStateStore> {
    return Actor.openKeyValueStore(DELTA_STATE_STORE_NAME);
}

export async function loadDeltaState(store?: DeltaStateStore): Promise<DeltaState> {
    const kv = store ?? (await defaultStore());
    const state = await kv.getValue<DeltaState>(STATE_KEY);
    if (!state || !Array.isArray(state.seenIds)) return { ...EMPTY_STATE, seenIds: [] };
    return state;
}

// Merges this run's observed ids (every id fetchListing walked past, not
// just the ones that passed onlyNew/dateRange filters - a filtered-out
// record still needs to count as "seen" or a later onlyNew run would
// re-surface it) into the previously persisted set, then caps it.
//
// Capped by DESCENDING NUMERIC id, not by fetch/page order. This source's
// listing sorts by Fecha/Hora Apertura (an upcoming bid-opening deadline),
// which is unrelated to when a publication was created (verified live
// 2026-09-06: offset=245 held publications with lower ids than offset=0's,
// simply because their opening date happens to fall later - see
// AGENTS.md). The publication id itself is the only field that plausibly
// tracks creation order (it looks like a plain auto-increment primary key),
// so trimming keeps the highest-numbered - i.e. most recently created, and
// therefore most likely to still be open and worth de-duplicating against -
// ids rather than an arbitrary slice of fetch order.
export async function saveDeltaState(
    previousSeenIds: string[],
    observedIds: string[],
    lastRunAt: string,
    store?: DeltaStateStore,
): Promise<DeltaState> {
    const kv = store ?? (await defaultStore());
    const merged = Array.from(new Set([...previousSeenIds, ...observedIds]));
    merged.sort((a, b) => Number(b) - Number(a));
    const capped = merged.slice(0, MAX_SEEN_IDS);
    const next: DeltaState = { seenIds: capped, lastRunAt };
    await kv.setValue(STATE_KEY, next);
    return next;
}
