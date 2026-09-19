import { Actor, log } from 'apify';

import { detectClosed, selectRecordsToProcess } from './delta.js';
import { fetchDetail } from './fetchDetail.js';
import { fetchListing } from './fetchListing.js';
import { fingerprintOf } from './fingerprint.js';
import type { SeenEntry } from './state.js';
import { loadDeltaState, saveDeltaState } from './state.js';
import type { ActorInput, ListingItem, PublicacionDetail, PublicacionRecord } from './types.js';

const EVENT_DETAIL = 'result';
const EVENT_SUMMARY = 'result-summary';

function toEntry(item: ListingItem, hash: string): SeenEntry {
    return { hash, titulo: item.titulo, tipoPublicacion: item.tipoPublicacion, numeroPublicacion: item.numeroPublicacion, organismo: item.organismo };
}

await Actor.init();
try {
    await run();
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.exception(error instanceof Error ? error : new Error(message), 'Run failed');
    await Actor.setValue('LAST_ERROR', { message, at: new Date().toISOString() });
    await Actor.fail(`Salta Compras Monitor extraction failed: ${message}`);
}
await Actor.exit();

async function run(): Promise<void> {
    const input = (await Actor.getInput<ActorInput>()) ?? ({} as ActorInput);
    const { fetchDetail: shouldFetchDetail = true, maxItems = 100, onlyNew = false, eventTypes, dateRange } = input;

    const state = await loadDeltaState();

    // Always a full fetch up to maxItems, never an early-stopped one: this
    // source's listing sorts by Fecha/Hora Apertura (opening deadline), not
    // by creation order, so a genuinely new publication can land on any
    // page - see AGENTS.md for the live evidence. onlyNew is applied below
    // as a post-filter over this full result, not as a pagination shortcut.
    const { items: listing, truncatedByMaxItems, suspectEmptyResult } = await fetchListing(maxItems);
    log.info(`Total publicaciones listadas: ${listing.length}${truncatedByMaxItems ? ' (maxItems reached - not a complete census)' : ''}`);

    // Detail is fetched for every walked item when shouldFetchDetail=true, not only the ones
    // that will end up delivered - detecting UPDATED requires re-reading the detail page of
    // every already-known item too, the same accepted cost as this fleet's recheckKnown
    // pattern on sibling actors. Use fetchDetail=false for a cheap listing-only delta monitor.
    const withDetail: { item: ListingItem; detail: PublicacionDetail | null }[] = [];
    for (const item of listing) {
        const detail = shouldFetchDetail ? await fetchDetail(item.detailUrl) : null;
        withDetail.push({ item, detail });
    }

    const scrapedAt = new Date().toISOString();
    const listSelectTypes = eventTypes?.filter((t): t is 'NEW_LISTING' | 'UPDATED' => t !== 'CLOSED');
    const selected = selectRecordsToProcess(withDetail, state, {
        onlyNew,
        eventTypes: listSelectTypes,
        dateRange,
        now: new Date(scrapedAt),
    });

    const walkedIds = new Set(listing.map((item) => item.id));
    const closedAllowed = !eventTypes || eventTypes.includes('CLOSED');
    const { closed, skippedReason } = detectClosed({ state, walkedIds, truncatedByMaxItems, suspectEmptyResult, closedAllowed, scrapedAt });
    const previouslyTrackedCount = Object.keys(state.entries).length;
    if (skippedReason === 'truncated' && previouslyTrackedCount > 0) {
        log.info('Skipping CLOSED detection this run: the walk was truncated by maxItems, so it is not a complete census.');
    } else if (skippedReason === 'suspect-empty-result') {
        // The confirmed bug this guards against: fetchListing came back with a zero-article
        // HTTP 200 that isn't trustworthy (bot-check page, redirect, or a site structure
        // change) - not a genuine "every publication closed" event. Emitting CLOSED here and
        // letting the save below prune these ids would silently wipe every previously
        // tracked publication from the persisted state on nothing more than a single flaky
        // fetch. See src/fetchListing.ts's suspectEmptyResult and src/delta.ts's detectClosed.
        log.warning(
            `Skipping CLOSED detection this run: fetchListing's zero-result reading looks like a fetch failure rather than a genuine empty register, and ${previouslyTrackedCount} publications were previously tracked. Leaving their state untouched so a real subsequent run can still detect genuine closures.`,
        );
    }

    let pushed = 0;
    const byEventType: Record<string, number> = {};
    const observed: { id: string; entry: SeenEntry }[] = [];

    for (const { item, detail, eventType, isNew, hash } of selected) {
        const record: PublicacionRecord = {
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
    for (const record of closed) delete baseEntries[record.record_id];
    for (const { item, detail } of withDetail) {
        observed.push({ id: item.id, entry: toEntry(item, fingerprintOf(item, detail)) });
    }
    await saveDeltaState({ entries: baseEntries, lastRunAt: state.lastRunAt }, observed, scrapedAt);

    log.info(
        `Cargados ${pushed} items al dataset (${Object.entries(byEventType)
            .map(([type, count]) => `${type}=${count}`)
            .join(', ')}).`,
    );
}
