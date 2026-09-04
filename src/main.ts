import { Actor, log } from 'apify';

import { fetchDetail } from './fetchDetail.js';
import { fetchListing } from './fetchListing.js';
import type { ActorInput, PublicacionRecord } from './types.js';

const RESULT_EVENT_NAME = 'result';

await Actor.init();
await run();
await Actor.exit();

async function run(): Promise<void> {
    const input = (await Actor.getInput<ActorInput>()) ?? ({} as ActorInput);
    const { fetchDetail: shouldFetchDetail = true, maxItems = 100 } = input;

    const listing = await fetchListing(maxItems);
    log.info(`Total publicaciones listadas: ${listing.length}`);

    let pushed = 0;
    for (const item of listing) {
        const detail = shouldFetchDetail ? await fetchDetail(item.detailUrl) : null;

        const record: PublicacionRecord = {
            ...item,
            detail,
            scrapedAt: new Date().toISOString(),
        };

        await Actor.pushData(record);
        pushed += 1;

        const { eventChargeLimitReached } = await Actor.charge({ eventName: RESULT_EVENT_NAME, count: 1 });
        if (eventChargeLimitReached) {
            log.info('Charge limit reached - stopping.');
            return;
        }
    }

    log.info(`Cargados ${pushed} items al dataset.`);
}
