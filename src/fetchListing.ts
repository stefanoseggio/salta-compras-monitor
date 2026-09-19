import { log } from 'apify';
import type { CheerioAPI } from 'cheerio';
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
// Verified live 2026-09-04 (and captured byte-for-byte in
// test/fixtures/listing_empty.html, a real one-past-the-last-page response): a genuine
// "no more results" page still server-renders the full `#frmfiltrobusqueda` search filter
// form - it just has zero `<article class="publicacion">` blocks. That marker's presence is
// therefore a real, fixture-verified way to tell a genuine zero-result listing page apart
// from a response that returned HTTP 200 without actually being the listing page at all (a
// bot-check interstitial, a redirect to an unrelated page, or a site markup change so
// drastic that parseListing's own selectors - and this one - both come up empty). See
// ListingResult.suspectEmptyResult below.
export function looksLikeListingPage($: CheerioAPI): boolean {
    return $('#frmfiltrobusqueda').length > 0;
}

export interface ListingResult {
    items: ListingItem[];
    /**
     * True when maxItems cut the walk short (the loop stopped because the cap was reached,
     * not because the site ran out of pages). False means this walk reached a genuine
     * zero-<article> page - i.e. it is a complete census of every currently-vigente
     * publication, not a partial one. Used by src/main.ts to decide whether it is safe to
     * infer "no longer vigente" (CLOSED) for a previously-seen id absent from this walk - see
     * AGENTS.md "Delta engine v2": that inference is only trustworthy against a complete walk.
     */
    truncatedByMaxItems: boolean;
    /**
     * True when the zero-<article> page that stopped this walk is NOT trustworthy as a
     * genuine "nothing more to see" result:
     *  - it did not even look like the real listing page (`looksLikeListingPage` returned
     *    false - missing the `#frmfiltrobusqueda` marker every real response, including a
     *    genuine past-the-end page, carries), which means the fetch most likely hit a
     *    bot-check interstitial, got redirected somewhere else, or the site's markup changed
     *    out from under parseListing; OR
     *  - it happened on the very FIRST page (offset 0), before this walk ever confirmed even
     *    one real result. Per the documented pagination behaviour (every real offset up to
     *    the true last page returns >=1 article - see AGENTS.md finding 7), a zero-<article>
     *    reading reached without ever having seen a non-empty page first is not the
     *    established end-of-pagination case at all.
     * False for the well-established, verified-safe case this actor has always relied on: a
     * structurally-valid zero-<article> page reached AFTER at least one earlier offset
     * already returned real items.
     * A zero-article HTTP 200 is otherwise indistinguishable from a genuine end-of-data page
     * - src/main.ts weighs this flag against whether there is previously tracked state a
     * false "everything is gone" reading would wrongly wipe. See its `detectClosed` call in
     * src/delta.ts and AGENTS.md.
     */
    suspectEmptyResult: boolean;
}

export async function fetchListing(maxItems: number): Promise<ListingResult> {
    const results: ListingItem[] = [];
    const seenIds = new Set<string>();
    let suspectEmptyResult = false;

    for (let offset = 0; results.length < maxItems; offset += PAGE_SIZE) {
        const response = await fetchWithRetry(`${LISTING_URL_BASE}/${offset}`);
        const html = await response.text();
        const $ = cheerio.load(html);
        const items = parseListing($);

        if (items.length === 0) {
            const structurallyValid = looksLikeListingPage($);
            if (!structurallyValid || offset === 0) {
                suspectEmptyResult = true;
                const why = structurallyValid
                    ? 'es la primera pagina de la caminata (nunca se vio ni un resultado real antes)'
                    : 'no tiene la forma esperada de la pagina de listado (posible bot-check, redireccion, o cambio de estructura del sitio)';
                log.warning(`offset=${offset}: 0 publicaciones y la respuesta ${why} - resultado sospechoso, no se trata como fin de paginacion genuino.`);
            } else {
                log.info(`offset=${offset}: sin mas resultados - fin de la paginacion.`);
            }
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
        log.info(
            `offset=${offset}: ${items.length} publicaciones (${added} nuevas, ${items.length - added} ya vistas en una pagina anterior).`,
        );
    }

    // The ONLY way this loop ends with fewer than maxItems results is the natural
    // zero-<article> stop condition above - the for-loop's own condition
    // (`results.length < maxItems`) guarantees it never exits any other way while still
    // short of the cap. So `results.length < maxItems` is conclusive proof of a complete
    // census; `results.length === maxItems` is NOT conclusive proof of the opposite (the
    // exact page that filled the cap might also have been the last real page) - when unsure,
    // this reports truncated, which is the safe direction for src/main.ts's CLOSED inference.
    const truncatedByMaxItems = results.length >= maxItems;

    return { items: results, truncatedByMaxItems, suspectEmptyResult };
}
