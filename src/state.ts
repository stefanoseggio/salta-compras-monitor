import { Actor } from 'apify';

// Fixed, unique-to-this-actor store name (matches the `salta-compras-monitor`
// package name) - deliberately NOT the run's own default key-value store,
// which is isolated per run and would not survive between scheduled runs.
export const DELTA_STATE_STORE_NAME = 'salta-compras-monitor-delta-state';

const STATE_KEY = 'STATE';

// A few thousand is enough to cover every publication ever recorded during a normal
// recurring-run cadence without the state growing unbounded.
const MAX_SEEN_IDS = 5000;

/**
 * v2: a small snapshot per id, not a bare seen-id list. `hash` is what makes UPDATED
 * detection possible (compare against fingerprintOf() on a later run). The four display
 * fields are kept so a CLOSED event (see src/delta.ts) - reported for a previously-seen id
 * that is absent from a later COMPLETE walk, i.e. genuinely no longer vigente - can still
 * name what closed, since the publication itself is presumably no longer fetchable once it
 * has left the vigentes list.
 */
export interface SeenEntry {
    hash: string;
    titulo: string;
    tipoPublicacion: string;
    numeroPublicacion: string;
    organismo: string;
}

export interface DeltaState {
    entries: Record<string, SeenEntry>;
    lastRunAt: string | null;
}

const EMPTY_STATE: DeltaState = { entries: {}, lastRunAt: null };

// Minimal shape actually used from apify's KeyValueStore, so tests can pass
// a plain in-memory fake instead of touching real Apify storage.
export interface DeltaStateStore {
    getValue<T>(key: string): Promise<T | null>;
    setValue<T>(key: string, value: T | null): Promise<void>;
}

async function defaultStore(): Promise<DeltaStateStore> {
    return Actor.openKeyValueStore(DELTA_STATE_STORE_NAME);
}

function isValidState(value: unknown): value is DeltaState {
    if (!value || typeof value !== 'object') return false;
    const v = value as Partial<DeltaState>;
    return typeof v.entries === 'object' && v.entries !== null;
}

export async function loadDeltaState(store?: DeltaStateStore): Promise<DeltaState> {
    const kv = store ?? (await defaultStore());
    const state = await kv.getValue<unknown>(STATE_KEY);
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
export async function saveDeltaState(
    previous: DeltaState,
    observed: { id: string; entry: SeenEntry }[],
    lastRunAt: string,
    store?: DeltaStateStore,
): Promise<DeltaState> {
    const kv = store ?? (await defaultStore());

    const entries: Record<string, SeenEntry> = { ...previous.entries };
    for (const { id, entry } of observed) entries[id] = entry;

    const cappedIds = Object.keys(entries)
        .sort((a, b) => Number(b) - Number(a))
        .slice(0, MAX_SEEN_IDS);

    const cappedEntries: Record<string, SeenEntry> = {};
    for (const id of cappedIds) cappedEntries[id] = entries[id];

    const next: DeltaState = { entries: cappedEntries, lastRunAt };
    await kv.setValue(STATE_KEY, next);
    return next;
}
