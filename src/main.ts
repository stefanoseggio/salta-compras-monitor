import { Actor, log } from 'apify';

import { selectRecordsToProcess } from './delta.js';
import { fetchDetail } from './fetchDetail.js';
import { fetchListing } from './fetchListing.js';
import { loadDeltaState, saveDeltaState } from './state.js';
import type { ActorInput, PublicacionRecord } from './types.js';

const RESULT_EVENT_NAME = 'result';
const EVENT_TYPE_NEW_LISTING = 'NEW_LISTING';

await Actor.init();
await run();
await Actor.exit();

async function run(): Promise<void> {
    const input = (await Actor.getInput<ActorInput>()) ?? ({} as ActorInput);
    const { fetchDetail: shouldFetchDetail = true, maxItems = 100, onlyNew = false, dateRange } = input;

    const deltaState = await loadDeltaState();
    const seenIds = new Set(deltaState.seenIds);

    // Always a full fetch up to maxItems, never an early-stopped one: this
    // source's listing sorts by Fecha/Hora Apertura (opening deadline), not
    // by creation order, so a genuinely new publication can land on any
    // page - see AGENTS.md for the live evidence. onlyNew is applied below
    // as a post-filter over this full result, not as a pagination shortcut.
    const listing = await fetchListing(maxItems);
    log.info(`Total publicaciones listadas: ${listing.length}`);

    const scrapedAt = new Date().toISOString();
    const selected = selectRecordsToProcess(listing, seenIds, { onlyNew, dateRange, now: new Date(scrapedAt) });

    let pushed = 0;
    for (const { item, isNew } of selected) {
        const detail = shouldFetchDetail ? await fetchDetail(item.detailUrl) : null;

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
            event_type: EVENT_TYPE_NEW_LISTING,
            scraped_at: scrapedAt,
            is_new: isNew,
            source_url: item.detailUrl,
        };

        await Actor.pushData(record);
        pushed += 1;

        const { eventChargeLimitReached } = await Actor.charge({ eventName: RESULT_EVENT_NAME, count: 1 });
        if (eventChargeLimitReached) {
            log.info('Charge limit reached - stopping.');
            break;
        }
    }

    // Every id fetchListing walked past counts as "seen" going forward, not
    // just the ones that passed onlyNew/dateRange filters this run - a
    // record filtered out today must still be recognized tomorrow.
    await saveDeltaState(
        deltaState.seenIds,
        listing.map((item) => item.id),
        scrapedAt,
    );

    log.info(`Cargados ${pushed} items al dataset.`);
}
