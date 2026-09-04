import { log } from 'apify';
import * as cheerio from 'cheerio';

import { fetchWithRetry } from './http.js';
import { parseListing } from './parsers/listing.js';
import type { ListingItem } from './types.js';

const LISTING_URL_BASE = 'https://compras.salta.gob.ar/publico/publicacionactual/panelfiltrobusqueda';
// Fixed by the site, not a request parameter - verified live 2026-09-04:
// every offset from 0 to 245 returns exactly 5 <article> blocks, the true
// last page (offset 250) returns 1.
const PAGE_SIZE = 5;

// Verified live 2026-09-04: the listing endpoint is a plain server-rendered
// GET per offset, no session/postback needed. An offset beyond the real
// data range (e.g. 255, one past the confirmed last page at 250) returns
// HTTP 200 with zero <article> blocks rather than an error or a redirect -
// used here as the natural stop condition instead of trusting the
// pagination widget's own page-count links.
//
// Finding NOT in the original recon notes: paging by offset is NOT stable.
// Comparing live offset=0 and offset=5 responses, ids 148037 and 148030
// appeared on BOTH pages (the underlying query has no deterministic
// secondary sort key once multiple records share the same Fecha/Hora
// Apertura, so consecutive LIMIT/OFFSET calls can return overlapping rows -
// and, in principle, on a live-changing dataset, occasionally skip one
// too). De-duplicating by id is mandatory when walking multiple pages; see
// AGENTS.md for why this also means a multi-page walk can't be guaranteed
// perfectly gap-free.
export async function fetchListing(maxItems: number): Promise<ListingItem[]> {
    const results: ListingItem[] = [];
    const seenIds = new Set<string>();

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
            if (results.length >= maxItems) break;
            if (seenIds.has(item.id)) continue;
            seenIds.add(item.id);
            results.push(item);
            added += 1;
        }
        log.info(`offset=${offset}: ${items.length} publicaciones (${added} nuevas, ${items.length - added} ya vistas en una pagina anterior).`);
    }

    return results;
}
