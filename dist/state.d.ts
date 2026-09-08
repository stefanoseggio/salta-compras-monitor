export declare const DELTA_STATE_STORE_NAME = "salta-compras-monitor-delta-state";
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
export interface DeltaStateStore {
    getValue<T>(key: string): Promise<T | null>;
    setValue<T>(key: string, value: T | null): Promise<void>;
}
export declare function loadDeltaState(store?: DeltaStateStore): Promise<DeltaState>;
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
export declare function saveDeltaState(previous: DeltaState, observed: {
    id: string;
    entry: SeenEntry;
}[], lastRunAt: string, store?: DeltaStateStore): Promise<DeltaState>;
//# sourceMappingURL=state.d.ts.map