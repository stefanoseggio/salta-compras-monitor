import { Actor, log } from 'apify';
import { selectRecordsToProcess } from './delta.js';
import { fetchDetail } from './fetchDetail.js';
import { fetchListing } from './fetchListing.js';
import { fingerprintOf } from './fingerprint.js';
import { loadDeltaState, saveDeltaState } from './state.js';
const EVENT_DETAIL = 'result';
const EVENT_SUMMARY = 'result-summary';
function toEntry(item, hash) {
    return { hash, titulo: item.titulo, tipoPublicacion: item.tipoPublicacion, numeroPublicacion: item.numeroPublicacion, organismo: item.organismo };
}
function detailUrlFor(id) {
    return `https://compras.salta.gob.ar/publico/publicacionactual/verpublicacion1/${id}/0`;
}
/**
 * A previously-seen id absent from this run's COMPLETE walk (fetchListing was not truncated
 * by maxItems) has left the vigentes list - closed, resolved, expired or withdrawn. The
 * source does not distinguish which, so this actor reports it as CLOSED without guessing
 * further. Only trustworthy against a complete walk - see src/fetchListing.ts and
 * AGENTS.md "Delta engine v2": a maxItems-truncated walk simply didn't look at every
 * currently-vigente publication, so an id's absence there proves nothing.
 */
function findClosed(state, walkedIds, scrapedAt) {
    const closed = [];
    for (const [id, entry] of Object.entries(state.entries)) {
        if (walkedIds.has(id))
            continue;
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
    return closed;
}
await Actor.init();
await run();
await Actor.exit();
async function run() {
    const input = (await Actor.getInput()) ?? {};
    const { fetchDetail: shouldFetchDetail = true, maxItems = 100, onlyNew = false, eventTypes, dateRange } = input;
    const state = await loadDeltaState();
    // Always a full fetch up to maxItems, never an early-stopped one: this
    // source's listing sorts by Fecha/Hora Apertura (opening deadline), not
    // by creation order, so a genuinely new publication can land on any
    // page - see AGENTS.md for the live evidence. onlyNew is applied below
    // as a post-filter over this full result, not as a pagination shortcut.
    const { items: listing, truncatedByMaxItems } = await fetchListing(maxItems);
    log.info(`Total publicaciones listadas: ${listing.length}${truncatedByMaxItems ? ' (maxItems reached - not a complete census)' : ''}`);
    // Detail is fetched for every walked item when shouldFetchDetail=true, not only the ones
    // that will end up delivered - detecting UPDATED requires re-reading the detail page of
    // every already-known item too, the same accepted cost as this fleet's recheckKnown
    // pattern on sibling actors. Use fetchDetail=false for a cheap listing-only delta monitor.
    const withDetail = [];
    for (const item of listing) {
        const detail = shouldFetchDetail ? await fetchDetail(item.detailUrl) : null;
        withDetail.push({ item, detail });
    }
    const scrapedAt = new Date().toISOString();
    const listSelectTypes = eventTypes?.filter((t) => t !== 'CLOSED');
    const selected = selectRecordsToProcess(withDetail, state, {
        onlyNew,
        eventTypes: listSelectTypes,
        dateRange,
        now: new Date(scrapedAt),
    });
    const walkedIds = new Set(listing.map((item) => item.id));
    const closedAllowed = !eventTypes || eventTypes.includes('CLOSED');
    const closed = truncatedByMaxItems || !closedAllowed ? [] : findClosed(state, walkedIds, scrapedAt);
    if (truncatedByMaxItems && Object.keys(state.entries).length > 0) {
        log.info('Skipping CLOSED detection this run: the walk was truncated by maxItems, so it is not a complete census.');
    }
    let pushed = 0;
    const byEventType = {};
    const observed = [];
    for (const { item, detail, eventType, isNew, hash } of selected) {
        const record = {
            titulo: item.titulo,
            tipoPublicacion: item.tipoPublicacion,
            numeroPublicacion: item.numeroPublicacion,
            fechaApertura: item.fechaApertura,
            horaApertura: item.horaApertura,
            objeto: item.objeto,
            organismo: item.organismo,
            expediente: item.expediente,
            consultaPliego: item.consultaPliego,
            consultas: item.consultas,
            detail,
            record_id: item.id,
            event_type: eventType,
            scraped_at: scrapedAt,
            is_new: isNew,
            source_url: item.detailUrl,
            contentHash: hash,
        };
        // pushData's own eventName argument performs the PPE charge - a separate Actor.charge()
        // call after it would double-charge the customer. Its return value is the sole source
        // of truth for whether the charge limit was reached (mirrors santafe-compras-monitor's
        // verified pattern).
        const { eventChargeLimitReached } = await Actor.pushData(record, detail ? EVENT_DETAIL : EVENT_SUMMARY);
        pushed += 1;
        byEventType[eventType] = (byEventType[eventType] ?? 0) + 1;
        if (eventChargeLimitReached) {
            log.info('Charge limit reached - stopping.');
            break;
        }
    }
    for (const record of closed) {
        const { eventChargeLimitReached } = await Actor.pushData(record, EVENT_SUMMARY);
        pushed += 1;
        byEventType.CLOSED = (byEventType.CLOSED ?? 0) + 1;
        if (eventChargeLimitReached) {
            log.info('Charge limit reached - stopping.');
            break;
        }
    }
    // Every id fetchListing walked past counts as "seen" going forward, not just the ones
    // that passed onlyNew/dateRange/eventTypes filters this run - a record filtered out
    // today must still be recognized as seen tomorrow, with its up-to-date fingerprint.
    // Closed ids are removed from the base state first (in one write, not two) so a
    // publication that is later re-published under the same id is recognized as NEW_LISTING
    // again rather than silently staying "seen" forever under its stale, pre-closure hash.
    const baseEntries = { ...state.entries };
    for (const record of closed)
        delete baseEntries[record.record_id];
    for (const { item, detail } of withDetail) {
        observed.push({ id: item.id, entry: toEntry(item, fingerprintOf(item, detail)) });
    }
    await saveDeltaState({ entries: baseEntries, lastRunAt: state.lastRunAt }, observed, scrapedAt);
    log.info(`Cargados ${pushed} items al dataset (${Object.entries(byEventType)
        .map(([type, count]) => `${type}=${count}`)
        .join(', ')}).`);
}
//# sourceMappingURL=main.js.map