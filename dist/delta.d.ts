import type { DeltaState } from './state.js';
import type { DateRangeOption, EventType, ListingItem, PublicacionDetail } from './types.js';
export declare function parseFechaApertura(fechaApertura: string, horaApertura: string): Date | null;
export declare function isWithinDateRange(fechaApertura: string, horaApertura: string, dateRange: DateRangeOption, now: Date): boolean;
export interface SelectOptions {
    onlyNew: boolean;
    eventTypes?: Exclude<EventType, 'UNCHANGED' | 'CLOSED'>[];
    dateRange?: DateRangeOption;
    now: Date;
}
export interface SelectedRecord {
    item: ListingItem;
    detail: PublicacionDetail | null;
    eventType: EventType;
    isNew: boolean;
    hash: string;
}
/**
 * Pure decision logic for the items a full listing walk returned this run - kept separate
 * from main.ts's Actor.pushData/fetchDetail side effects so it's directly unit-testable.
 * `isNew`/`eventType` are computed from `state` as it stood at the START of this run for
 * every record that reaches this far, regardless of onlyNew - so a full, non-delta run still
 * tells the consumer exactly what changed (per the fleet's UMS spec).
 *
 * CLOSED is NOT produced here - it requires comparing against ids that are ABSENT from this
 * run's walk, which this function never sees. See src/main.ts's `findClosed`.
 *
 * No early-stop: this walks the full `listing` array (already capped at maxItems by
 * fetchListing) rather than short-circuiting once already-seen ids are reached - see
 * AGENTS.md for why early-stop pagination is unsafe for this source (its listing sorts by
 * opening date, not creation order).
 */
export declare function selectRecordsToProcess(listing: {
    item: ListingItem;
    detail: PublicacionDetail | null;
}[], state: DeltaState, options: SelectOptions): SelectedRecord[];
//# sourceMappingURL=delta.d.ts.map