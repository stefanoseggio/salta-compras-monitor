import { fingerprintOf } from './fingerprint.js';
import type { DeltaState, SeenEntry } from './state.js';
import type { DateRangeOption, EventType, ListingItem, PublicacionDetail, PublicacionRecord } from './types.js';

const DATE_RANGE_MS: Record<DateRangeOption, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
};

// Salta's only per-publication date field, anywhere (listing header AND
// detail page - checked every `.publicacion-fila-titulo` label present in
// both), is "Fecha/Hora Apertura": the bid-opening deadline, not a
// publication/created date - there is no separate "Fecha de Publicación".
// Format verified against every sampled header: "DD/MM/YYYY" + "HH:MM".
// Parsed as printed, as UTC, with no adjustment for Argentina's real UTC-3
// offset - acceptable at the day-level 24h/7d/30d granularity this input
// offers, but an exact boundary a few hours from a window edge can be off
// by up to 3h. Documented as a known limitation in README.md, not silently
// ignored.
export function parseFechaApertura(fechaApertura: string, horaApertura: string): Date | null {
    const dateMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fechaApertura.trim());
    if (!dateMatch) return null;
    const [, dd, mm, yyyy] = dateMatch;

    const timeMatch = /^(\d{2}):(\d{2})$/.exec(horaApertura.trim());
    const hh = timeMatch ? timeMatch[1] : '00';
    const min = timeMatch ? timeMatch[2] : '00';

    const date = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
}

// For the "vigentes" (currently open) publications this actor covers,
// Fecha/Hora Apertura is overwhelmingly in the FUTURE relative to scrape
// time (verified live 2026-09-06: every one of 10 sampled dates across
// offset=0 and offset=245 was >= today, ranging out to Dec 2028) - the
// mirror image of a backward-dated field. So dateRange here means "opens
// within the next N" (an upcoming-deadline filter), not "published in the
// last N" - see README.md's Delta mode section for the disclosure. A
// record whose date can't be parsed is excluded rather than guessed into
// or out of the window.
export function isWithinDateRange(
    fechaApertura: string,
    horaApertura: string,
    dateRange: DateRangeOption,
    now: Date,
): boolean {
    const date = parseFechaApertura(fechaApertura, horaApertura);
    if (!date) return false;
    const diffMs = date.getTime() - now.getTime();
    return diffMs >= 0 && diffMs <= DATE_RANGE_MS[dateRange];
}

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

function classify(previous: SeenEntry | undefined, hash: string): EventType {
    if (!previous) return 'NEW_LISTING';
    if (previous.hash !== hash) return 'UPDATED';
    return 'UNCHANGED';
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
export function selectRecordsToProcess(
    listing: { item: ListingItem; detail: PublicacionDetail | null }[],
    state: DeltaState,
    options: SelectOptions,
): SelectedRecord[] {
    const { onlyNew, eventTypes, dateRange, now } = options;
    const allowed = eventTypes ? new Set<EventType>(eventTypes) : null;
    const selected: SelectedRecord[] = [];

    for (const { item, detail } of listing) {
        const previous = state.entries[item.id];
        const hash = fingerprintOf(item, detail);
        const eventType = classify(previous, hash);
        const isNew = !previous;

        if (dateRange && !isWithinDateRange(item.fechaApertura, item.horaApertura, dateRange, now)) continue;
        if (onlyNew && eventType === 'UNCHANGED') continue;
        if (allowed && eventType !== 'UNCHANGED' && !allowed.has(eventType)) continue;

        selected.push({ item, detail, eventType, isNew, hash });
    }

    return selected;
}

export function detailUrlFor(id: string): string {
    return `https://compras.salta.gob.ar/publico/publicacionactual/verpublicacion1/${id}/0`;
}

/** Why detectClosed produced no CLOSED records at all this run, distinct from "it ran and genuinely found none" (skippedReason === null with an empty result is that case). Surfaced so src/main.ts can log something specific instead of silently doing nothing. */
export type SkippedClosedReason = 'truncated' | 'suspect-empty-result' | 'event-type-excluded' | null;

export interface DetectClosedOptions {
    state: DeltaState;
    /** Ids fetchListing actually walked past this run. */
    walkedIds: ReadonlySet<string>;
    /** From fetchListing.ListingResult - a walk cut short by maxItems says nothing about ids past where it stopped. */
    truncatedByMaxItems: boolean;
    /**
     * From fetchListing.ListingResult - true when this run's walk ended in a zero-result
     * reading that is not trustworthy (a bot-check page, a redirect, a site structure change,
     * or a suspicious first-page zero - see src/fetchListing.ts). Only actually gates
     * anything when there IS previously tracked state a false CLOSED sweep could wrongly
     * wipe; a cold start with nothing tracked yet has nothing to protect.
     */
    suspectEmptyResult: boolean;
    /** False when the caller explicitly excluded CLOSED via the `eventTypes` input. */
    closedAllowed: boolean;
    scrapedAt: string;
}

export interface DetectClosedResult {
    closed: PublicacionRecord[];
    skippedReason: SkippedClosedReason;
}

/**
 * A previously-seen id absent from this run's walk has (probably) left the vigentes list -
 * closed, resolved, expired or withdrawn. The source does not distinguish which, so this
 * actor reports CLOSED without guessing further.
 *
 * THE BUG THIS GUARDS AGAINST: a zero-article HTTP 200 response (bot-check interstitial,
 * redirect, or a site structure change breaking parseListing) is otherwise indistinguishable
 * from a genuine "the register is empty" reading. Treating it as genuine would report EVERY
 * previously tracked publication as CLOSED and (via src/main.ts's state save) permanently
 * drop them from the persisted delta state - a false mass-closure event plus a silent state
 * wipe, from nothing more than a single flaky fetch.
 *
 * Gated on three independent reasons NOT to trust an id's absence as a real closure:
 *  - `truncatedByMaxItems`: the walk simply didn't look at every currently-vigente
 *    publication (see src/fetchListing.ts).
 *  - `suspectEmptyResult` (with existing state to protect): THIS run's "vigentes" reading is
 *    itself untrustworthy - see src/fetchListing.ts's `suspectEmptyResult`.
 *  - `!closedAllowed`: the caller explicitly excluded CLOSED via `eventTypes`.
 * In every skipped case `closed` is `[]` and src/main.ts's save leaves the previously tracked
 * entries exactly as they were, so a later, healthy run can still detect a genuine closure
 * instead of this run's suspect reading silently erasing the record of what was open. See
 * AGENTS.md "Delta engine v2".
 */
export function detectClosed(options: DetectClosedOptions): DetectClosedResult {
    const { state, walkedIds, truncatedByMaxItems, suspectEmptyResult, closedAllowed, scrapedAt } = options;

    if (truncatedByMaxItems) return { closed: [], skippedReason: 'truncated' };
    if (!closedAllowed) return { closed: [], skippedReason: 'event-type-excluded' };

    const hasExistingState = Object.keys(state.entries).length > 0;
    if (suspectEmptyResult && hasExistingState) return { closed: [], skippedReason: 'suspect-empty-result' };

    const closed: PublicacionRecord[] = [];
    for (const [id, entry] of Object.entries(state.entries)) {
        if (walkedIds.has(id)) continue;
        closed.push({
            titulo: entry.titulo,
            tipoPublicacion: entry.tipoPublicacion,
            numeroPublicacion: entry.numeroPublicacion,
            fechaApertura: '',
            horaApertura: '',
            objeto: '',
            organismo: entry.organismo,
            expediente: '',
            consultaPliego: '',
            consultas: '',
            detail: null,
            record_id: id,
            event_type: 'CLOSED',
            scraped_at: scrapedAt,
            is_new: false,
            source_url: detailUrlFor(id),
            contentHash: entry.hash,
        });
    }
    return { closed, skippedReason: null };
}
