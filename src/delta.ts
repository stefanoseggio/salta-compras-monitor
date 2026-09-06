import type { DateRangeOption, ListingItem } from './types.js';

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
    dateRange?: DateRangeOption;
    now: Date;
}

export interface SelectedRecord {
    item: ListingItem;
    isNew: boolean;
}

// Pure decision logic, kept separate from main.ts's Actor.pushData/fetchDetail
// side effects so it's directly unit-testable. `isNew` is computed from the
// seen-set as it stood at the START of this run for every record that
// reaches this far, regardless of onlyNew - so a full, non-delta run still
// tells the consumer which of its results happen to be new (per spec).
//
// No early-stop: this walks the full `listing` array (already capped at
// maxItems by fetchListing) rather than short-circuiting once already-seen
// ids are reached - see AGENTS.md for why early-stop pagination is unsafe
// for this source (its listing sorts by opening date, not creation order).
export function selectRecordsToProcess(
    listing: ListingItem[],
    seenIds: ReadonlySet<string>,
    options: SelectOptions,
): SelectedRecord[] {
    const { onlyNew, dateRange, now } = options;
    const selected: SelectedRecord[] = [];

    for (const item of listing) {
        const isNew = !seenIds.has(item.id);

        if (dateRange && !isWithinDateRange(item.fechaApertura, item.horaApertura, dateRange, now)) continue;
        if (onlyNew && !isNew) continue;

        selected.push({ item, isNew });
    }

    return selected;
}
