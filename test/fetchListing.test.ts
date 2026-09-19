import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as cheerio from 'cheerio';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { extractLastPageOffset, fetchListing, looksLikeListingPage } from '../src/fetchListing.js';

// impit's Impit.fetch() is a native binding, not built on the global `fetch` -
// vi.stubGlobal('fetch', ...) never intercepts it. Mock the `impit` module
// itself instead, so `new Impit()` in src/http.ts returns an object whose
// `.fetch` is this mock. vi.hoisted() is required because vi.mock() factories
// run before the top-level `const` below would otherwise be initialized.
const { fetchMock } = vi.hoisted(() => ({
    fetchMock: vi.fn<(url: string, init: RequestInit) => Promise<Response>>(),
}));
vi.mock('impit', () => ({
    // Must be a real `function`, not an arrow function - `new Impit(...)` in
    // src/http.ts requires a constructible mock implementation.
    Impit: vi.fn().mockImplementation(function ImpitMock() {
        return { fetch: fetchMock };
    }),
}));

const fixturesDir = fileURLToPath(new URL('fixtures', import.meta.url));

function readFixture(name: string): string {
    return readFileSync(`${fixturesDir}/${name}`, 'utf-8');
}

function loadFixture(name: string) {
    return cheerio.load(readFixture(name));
}

// Every real fixture's ">>" (jump-to-last-page) link points at
// `panelfiltrobusqueda/250` (see AGENTS.md / src/fetchListing.ts) - this substring is unique
// per fixture (unlike the bare digits "250", which also show up in an unrelated inline
// `width:250px` style), so rewriting it is a safe way to simulate the site reporting a
// different (smaller) last-page offset without hand-authoring synthetic listing markup that
// would have to fake every one of parseListing's selectors.
function withDeclaredLastPageOffset(html: string, offset: number): string {
    const original = 'panelfiltrobusqueda/250">>';
    if (!html.includes(original)) {
        throw new Error('fixture no longer contains the expected ">>" last-page link - update this test helper');
    }
    return html.replace(original, `panelfiltrobusqueda/${offset}">>`);
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

describe('extractLastPageOffset', () => {
    it('reads the ">>" jump-to-last-page offset off a real early-page response', () => {
        // Both real fixtures were captured live 2026-09-04 with the true last page at
        // offset 250 - re-confirmed live 2026-09-19 (see src/fetchListing.ts comment).
        expect(extractLastPageOffset(loadFixture('listing_offset0.html'))).toBe(250);
        expect(extractLastPageOffset(loadFixture('listing_offset5.html'))).toBe(250);
    });

    it('returns null on the real captured past-the-end page - it has no ">>" link once already there', () => {
        expect(extractLastPageOffset(loadFixture('listing_empty.html'))).toBeNull();
    });

    it('returns null when there is no .pagination widget at all (synthetic - not a captured fixture)', () => {
        const $ = cheerio.load('<html><body><div id="frmfiltrobusqueda"></div></body></html>');
        expect(extractLastPageOffset($)).toBeNull();
    });
});

function fakeResponse(body: string): Response {
    return { ok: true, status: 200, text: async () => body } as unknown as Response;
}

// Reproduces THE BUG THIS PASS FIXES: a mid-walk zero-<article> page that is structurally
// valid (so the pre-existing `looksLikeListingPage` check trusts it) and not at offset 0 (so
// the pre-existing offset===0 check trusts it too) was, before this fix, always accepted as a
// genuine end-of-pagination - even though this source's pagination is known-unstable
// (AGENTS.md finding 1: no stable secondary sort key, ids observed live on two different
// pages) and a shrinking register can produce exactly this shape prematurely. All three
// responses below are real captured fixtures (only the ">>" link's declared offset is
// rewritten - see `withDeclaredLastPageOffset`), not hand-authored markup, so this exercises
// the real `parseListing`/`looksLikeListingPage`/`extractLastPageOffset` parsing path.
describe('fetchListing (mocked HTTP, real fixtures) - suspectEmptyResult vs a premature mid-walk empty page', () => {
    afterEach(() => {
        fetchMock.mockReset();
    });

    it('flags suspectEmptyResult when a structurally-valid, past-offset-0 zero-page arrives at or before the offset the site itself already reported as the true last page', () => {
        // offset=0 tells this walk (via the real ">>" link, rewritten to point at 10 instead
        // of the fixture's real 250) that the true last page starts at offset=10. offset=5 is
        // a real, unmodified non-empty page. offset=10 then comes back empty - which, per what
        // offset=0 just said, should NOT happen yet (offset 10 was supposed to be the true
        // last page, i.e. still have real items). This is the shrinking-register scenario.
        fetchMock.mockImplementation(async (url: string) => {
            const href = url.toString();
            if (href.endsWith('/0')) return fakeResponse(withDeclaredLastPageOffset(readFixture('listing_offset0.html'), 10));
            if (href.endsWith('/5')) return fakeResponse(withDeclaredLastPageOffset(readFixture('listing_offset5.html'), 10));
            if (href.endsWith('/10')) return fakeResponse(readFixture('listing_empty.html'));
            throw new Error(`unexpected offset requested in test: ${href}`);
        });

        return fetchListing(100).then((result) => {
            expect(result.suspectEmptyResult).toBe(true);
            // Both real pages before the premature empty one are still collected - this guard
            // only affects whether the walk's end is TRUSTED as genuine, not what was found.
            // 5 + 5 real cards, minus the 2 real ids the fixtures share across offset=0/offset=5
            // (AGENTS.md finding 1 - the site's own documented pagination overlap).
            expect(result.items).toHaveLength(8);
            expect(fetchMock).toHaveBeenCalledTimes(3);
        });
    });

    it('does NOT flag suspectEmptyResult when the zero-page arrives strictly after the offset the site itself reported (the established genuine-end case is unaffected by this fix)', () => {
        // offset=0 says the true last page starts at offset=5 this time. offset=5 is real and
        // non-empty (consistent with that claim). offset=10 comes back empty - which is now
        // AFTER the reported last page, i.e. exactly the well-established genuine
        // end-of-pagination case this actor has always trusted.
        fetchMock.mockImplementation(async (url: string) => {
            const href = url.toString();
            if (href.endsWith('/0')) return fakeResponse(withDeclaredLastPageOffset(readFixture('listing_offset0.html'), 5));
            if (href.endsWith('/5')) return fakeResponse(withDeclaredLastPageOffset(readFixture('listing_offset5.html'), 5));
            if (href.endsWith('/10')) return fakeResponse(readFixture('listing_empty.html'));
            throw new Error(`unexpected offset requested in test: ${href}`);
        });

        return fetchListing(100).then((result) => {
            expect(result.suspectEmptyResult).toBe(false);
            expect(result.items).toHaveLength(8);
        });
    });
});
