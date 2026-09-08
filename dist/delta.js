import { fingerprintOf } from './fingerprint.js';
const DATE_RANGE_MS = {
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
export function parseFechaApertura(fechaApertura, horaApertura) {
    const dateMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fechaApertura.trim());
    if (!dateMatch)
        return null;
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
export function isWithinDateRange(fechaApertura, horaApertura, dateRange, now) {
    const date = parseFechaApertura(fechaApertura, horaApertura);
    if (!date)
        return false;
    const diffMs = date.getTime() - now.getTime();
    return diffMs >= 0 && diffMs <= DATE_RANGE_MS[dateRange];
}
function classify(previous, hash) {
    if (!previous)
        return 'NEW_LISTING';
    if (previous.hash !== hash)
        return 'UPDATED';
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
export function selectRecordsToProcess(listing, state, options) {
    const { onlyNew, eventTypes, dateRange, now } = options;
    const allowed = eventTypes ? new Set(eventTypes) : null;
    const selected = [];
    for (const { item, detail } of listing) {
        const previous = state.entries[item.id];
        const hash = fingerprintOf(item, detail);
        const eventType = classify(previous, hash);
        const isNew = !previous;
        if (dateRange && !isWithinDateRange(item.fechaApertura, item.horaApertura, dateRange, now))
            continue;
        if (onlyNew && eventType === 'UNCHANGED')
            continue;
        if (allowed && eventType !== 'UNCHANGED' && !allowed.has(eventType))
            continue;
        selected.push({ item, detail, eventType, isNew, hash });
    }
    return selected;
}
//# sourceMappingURL=delta.js.map