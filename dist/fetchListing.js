import { log } from 'apify';
import * as cheerio from 'cheerio';
import { fetchWithRetry } from './http.js';
import { parseListing } from './parsers/listing.js';
const LISTING_URL_BASE = 'https://compras.salta.gob.ar/publico/publicacionactual/panelfiltrobusqueda';
// Fixed by the site, not a request parameter - verified live 2026-09-04:
// every offset from 0 to 245 returns exactly 5 <article> blocks, the true
// last page (offset 250) returns 1.
const PAGE_SIZE = 5;
export async function fetchListing(maxItems) {
    const results = [];
    const seenIds = new Set();
    for (let offset = 0; results.length < maxItems; offset += PAGE_SIZE) {
        const response = await fetchWithRetry(`${LISTING_URL_BASE}/${offset}`);
        const html = await response.text();
        const $ = cheerio.load(html);
        const items = parseListing($);
        if (items.length === 0) {
            log.info(`offset=${offset}: sin mas resultados - fin de la paginacion.`);
            break;
        }
        let added = 0;
        for (const item of items) {
            if (results.length >= maxItems)
                break;
            if (seenIds.has(item.id))
                continue;
            seenIds.add(item.id);
            results.push(item);
            added += 1;
        }
        log.info(`offset=${offset}: ${items.length} publicaciones (${added} nuevas, ${items.length - added} ya vistas en una pagina anterior).`);
    }
    // The ONLY way this loop ends with fewer than maxItems results is the natural
    // zero-<article> stop condition above - the for-loop's own condition
    // (`results.length < maxItems`) guarantees it never exits any other way while still
    // short of the cap. So `results.length < maxItems` is conclusive proof of a complete
    // census; `results.length === maxItems` is NOT conclusive proof of the opposite (the
    // exact page that filled the cap might also have been the last real page) - when unsure,
    // this reports truncated, which is the safe direction for src/main.ts's CLOSED inference.
    const truncatedByMaxItems = results.length >= maxItems;
    return { items: results, truncatedByMaxItems };
}
//# sourceMappingURL=fetchListing.js.map