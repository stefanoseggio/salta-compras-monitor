import { describe, expect, it } from 'vitest';

import { fetchDetail } from '../src/fetchDetail.js';
import { fetchListing } from '../src/fetchListing.js';

// Live checks against the real site - skipped in CI (same lesson as the
// other actors in this portfolio: don't make CI depend on an external
// host with no uptime guarantee).
describe.skipIf(process.env.CI)('live fetchListing + fetchDetail against the real Salta portal', () => {
    it('fetches a real listing page with well-formed items', async () => {
        const items = await fetchListing(5);

        expect(items.length).toBeGreaterThan(0);
        expect(items.length).toBeLessThanOrEqual(5);
        for (const item of items) {
            expect(item.id).toMatch(/^\d+$/);
            expect(item.titulo).toBeTruthy();
            expect(item.objeto).toBeTruthy();
            expect(item.detailUrl).toContain(item.id);
        }
    }, 30_000);

    it('paginates across multiple listing pages and de-duplicates by id', async () => {
        const items = await fetchListing(12);
        expect(items.length).toBeGreaterThan(5); // proves it advanced past the 5-item page size
        const ids = items.map((i) => i.id);
        expect(new Set(ids).size).toBe(ids.length); // no duplicates across pages, despite the site's own overlap
    }, 30_000);

    it('fetches and parses a real detail page end-to-end', async () => {
        const items = await fetchListing(1);
        expect(items.length).toBe(1);

        const detail = await fetchDetail(items[0].detailUrl);
        expect(detail).not.toBeNull();
        expect(Object.keys(detail!.fields).length).toBeGreaterThan(0);
        expect(detail!.fields.Objeto).toBeTruthy();
    }, 30_000);
});
