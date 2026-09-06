import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as cheerio from 'cheerio';
import { describe, expect, it } from 'vitest';

import { isWithinDateRange, parseFechaApertura, selectRecordsToProcess } from '../src/delta.js';
import { parseListing } from '../src/parsers/listing.js';

const fixturesDir = fileURLToPath(new URL('fixtures', import.meta.url));

function loadListingFixture(name: string) {
    const $ = cheerio.load(readFileSync(`${fixturesDir}/${name}`, 'utf-8'));
    return parseListing($);
}

describe('selectRecordsToProcess', () => {
    it('marks every record is_new=true on a cold run (empty seen-set)', () => {
        const items = loadListingFixture('listing_offset0.html');
        const selected = selectRecordsToProcess(items, new Set(), {
            onlyNew: false,
            now: new Date('2026-09-07T00:00:00Z'),
        });

        expect(selected).toHaveLength(items.length);
        expect(selected.every((r) => r.isNew)).toBe(true);
    });

    it('onlyNew with a fully-seen state returns zero records', () => {
        const items = loadListingFixture('listing_offset0.html');
        const seenIds = new Set(items.map((i) => i.id));

        const selected = selectRecordsToProcess(items, seenIds, {
            onlyNew: true,
            now: new Date('2026-09-07T00:00:00Z'),
        });

        expect(selected).toHaveLength(0);
    });

    it('a full (onlyNew=false) run still reports is_new correctly per record against a partially-seen state', () => {
        const items = loadListingFixture('listing_offset0.html');
        const seenIds = new Set([items[0].id]);

        const selected = selectRecordsToProcess(items, seenIds, {
            onlyNew: false,
            now: new Date('2026-09-07T00:00:00Z'),
        });

        // Nothing is dropped by is_new bookkeeping alone.
        expect(selected).toHaveLength(items.length);
        expect(selected.find((r) => r.item.id === items[0].id)?.isNew).toBe(false);
        expect(selected.filter((r) => r.isNew)).toHaveLength(items.length - 1);
    });

    it('onlyNew returns only the unseen subset when the seen-set is partial', () => {
        const items = loadListingFixture('listing_offset0.html');
        const seenIds = new Set([items[0].id, items[1].id]);

        const selected = selectRecordsToProcess(items, seenIds, {
            onlyNew: true,
            now: new Date('2026-09-07T00:00:00Z'),
        });

        expect(selected).toHaveLength(items.length - 2);
        expect(selected.every((r) => r.isNew)).toBe(true);
        expect(selected.some((r) => r.item.id === items[0].id)).toBe(false);
    });

    it('dateRange excludes records whose opening date falls outside the window', () => {
        const items = loadListingFixture('listing_offset0.html'); // all fechaApertura = 07/09/2026, 09:00/09:30
        const farNow = new Date('2026-01-01T00:00:00Z'); // months before the fixture's opening date

        const selected = selectRecordsToProcess(items, new Set(), { onlyNew: false, dateRange: '24h', now: farNow });

        expect(selected).toHaveLength(0);
    });

    it('dateRange includes records whose opening date falls inside the window', () => {
        const items = loadListingFixture('listing_offset0.html');
        const closeNow = new Date('2026-09-06T12:00:00Z'); // within 24h of 07/09/2026 09:00/09:30 UTC

        const selected = selectRecordsToProcess(items, new Set(), { onlyNew: false, dateRange: '24h', now: closeNow });

        expect(selected).toHaveLength(items.length);
    });

    it('dateRange and onlyNew apply independently and can combine', () => {
        const items = loadListingFixture('listing_offset0.html');
        const seenIds = new Set([items[0].id]);
        const closeNow = new Date('2026-09-06T12:00:00Z');

        const selected = selectRecordsToProcess(items, seenIds, { onlyNew: true, dateRange: '24h', now: closeNow });

        expect(selected).toHaveLength(items.length - 1);
        expect(selected.some((r) => r.item.id === items[0].id)).toBe(false);
    });
});

describe('parseFechaApertura / isWithinDateRange', () => {
    it('parses a well-formed date and time as UTC', () => {
        const date = parseFechaApertura('07/09/2026', '09:30');
        expect(date?.toISOString()).toBe('2026-09-07T09:30:00.000Z');
    });

    it('defaults to midnight when horaApertura is missing or malformed', () => {
        const date = parseFechaApertura('07/09/2026', '');
        expect(date?.toISOString()).toBe('2026-09-07T00:00:00.000Z');
    });

    it('returns null for a malformed date', () => {
        expect(parseFechaApertura('not-a-date', '09:00')).toBeNull();
        expect(parseFechaApertura('13/08/2921', '09:00')).not.toBeNull(); // a real (typo'd) source value - parses fine, out-of-range is a date-window concern, not a parse failure
    });

    it('excludes a record whose date cannot be parsed instead of guessing', () => {
        expect(isWithinDateRange('not-a-date', '09:00', '24h', new Date('2026-09-06T00:00:00Z'))).toBe(false);
    });

    it('is inclusive of both window boundaries', () => {
        const now = new Date('2026-09-06T00:00:00Z');
        expect(isWithinDateRange('06/09/2026', '00:00', '24h', now)).toBe(true); // exactly now
        expect(isWithinDateRange('07/09/2026', '00:00', '24h', now)).toBe(true); // exactly +24h
        expect(isWithinDateRange('07/09/2026', '00:01', '24h', now)).toBe(false); // just past +24h
        expect(isWithinDateRange('05/09/2026', '23:59', '24h', now)).toBe(false); // just before now (already open)
    });
});
