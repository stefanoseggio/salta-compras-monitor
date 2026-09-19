import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as cheerio from 'cheerio';
import { describe, expect, it } from 'vitest';

import { fetchDetail } from '../src/fetchDetail.js';
import { fetchListing, looksLikeListingPage } from '../src/fetchListing.js';

const fixturesDir = fileURLToPath(new URL('fixtures', import.meta.url));

function loadFixture(name: string) {
    return cheerio.load(readFileSync(`${fixturesDir}/${name}`, 'utf-8'));
}

// Pure, fixture-only checks - no network needed, run in CI.
describe('looksLikeListingPage', () => {
    it('is true for a real listing page with results', () => {
        expect(looksLikeListingPage(loadFixture('listing_offset0.html'))).toBe(true);
        expect(looksLikeListingPage(loadFixture('listing_offset5.html'))).toBe(true);
    });

    it('is true for a real, verified past-the-end response even though it has zero articles - this is the genuine "no more results" shape', () => {
        // listing_empty.html is a live-captured one-past-the-last-page response (see AGENTS.md
        // finding 7): zero <article> blocks, but the full #frmfiltrobusqueda search form is
        // still there. This is exactly the case fetchListing must keep trusting as a real
        // end-of-pagination signal.
        const $ = loadFixture('listing_empty.html');
        expect($('article.publicacion').length).toBe(0);
        expect(looksLikeListingPage($)).toBe(true);
    });

    it('is false for a response that is not the listing page at all (synthetic - not a captured fixture)', () => {
        // Stands in for a bot-check interstitial, an unrelated redirect target, or a page
        // whose markup changed so much the search form itself is gone - none of which are
        // real captures, just a minimal negative case for the marker check itself.
        const $ = cheerio.load('<html><body><h1>Just a moment...</h1></body></html>');
        expect(looksLikeListingPage($)).toBe(false);
    });
});

// Live checks against the real site - skipped in CI (same lesson as the
// other actors in this portfolio: don't make CI depend on an external
// host with no uptime guarantee).
describe.skipIf(process.env.CI)('live fetchListing + fetchDetail against the real Salta portal', () => {
    it('fetches a real listing page with well-formed items', async () => {
        const { items, truncatedByMaxItems } = await fetchListing(5);

        expect(items.length).toBeGreaterThan(0);
        expect(items.length).toBeLessThanOrEqual(5);
        expect(truncatedByMaxItems).toBe(true); // the real register has ~250 open publications, far more than 5
        for (const item of items) {
            expect(item.id).toMatch(/^\d+$/);
            expect(item.titulo).toBeTruthy();
            expect(item.objeto).toBeTruthy();
            expect(item.detailUrl).toContain(item.id);
        }
    }, 30_000);

    it('paginates across multiple listing pages and de-duplicates by id', async () => {
        const { items } = await fetchListing(12);
        expect(items.length).toBeGreaterThan(5); // proves it advanced past the 5-item page size
        const ids = items.map((i) => i.id);
        expect(new Set(ids).size).toBe(ids.length); // no duplicates across pages, despite the site's own overlap
    }, 30_000);

    it('reports truncatedByMaxItems=false when maxItems comfortably exceeds the real register', async () => {
        const { truncatedByMaxItems } = await fetchListing(10_000);
        expect(truncatedByMaxItems).toBe(false);
    }, 60_000);

    it('fetches and parses a real detail page end-to-end', async () => {
        const { items } = await fetchListing(1);
        expect(items.length).toBe(1);

        const detail = await fetchDetail(items[0].detailUrl);
        expect(detail).not.toBeNull();
        expect(Object.keys(detail!.fields).length).toBeGreaterThan(0);
        expect(detail!.fields.Objeto).toBeTruthy();
    }, 30_000);
});
