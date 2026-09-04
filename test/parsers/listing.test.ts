import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as cheerio from 'cheerio';
import { describe, expect, it } from 'vitest';

import { parseListing } from '../../src/parsers/listing.js';

const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));

function loadFixture(name: string) {
    return cheerio.load(readFileSync(`${fixturesDir}/${name}`, 'utf-8'));
}

describe('parseListing', () => {
    it('extracts all 5 publication cards from a real listing page with correct fields', () => {
        const $ = loadFixture('listing_offset0.html');
        const items = parseListing($);

        expect(items).toHaveLength(5);

        const first = items[0];
        expect(first.id).toBe('148204');
        expect(first.titulo).toBe('Adjudicación Simple N° 98/2026');
        expect(first.tipoPublicacion).toBe('Adjudicación Simple');
        expect(first.numeroPublicacion).toBe('98/2026');
        expect(first.fechaApertura).toBe('07/09/2026');
        expect(first.horaApertura).toBe('09:00');
        expect(first.objeto).toBe('ADQ. DE UN MOTOR TRIFASICO. PROGRAMA DE FISCALIZACION Y CONTROL');
        expect(first.organismo).toBe('Hospital Señor del Milagro');
        expect(first.expediente).toBe('0100134-173362/2026-0');
        expect(first.consultaPliego).toContain('AVDA SARMIENTO 557');
        expect(first.consultas).toBe('cotizacioneshmilagro@gmail.com TEL 387-4210223');
        expect(first.detailUrl).toBe('https://compras.salta.gob.ar/publico/publicacionactual/verpublicacion1/148204/0');
    });

    it('splits a numero that has no clean "n/aaaa" shape without dropping data', () => {
        const $ = loadFixture('listing_offset0.html');
        const items = parseListing($);

        const segundoLlamado = items.find((item) => item.id === '148021');
        expect(segundoLlamado).toBeDefined();
        expect(segundoLlamado!.tipoPublicacion).toBe('Adjudicación Simple');
        expect(segundoLlamado!.numeroPublicacion).toBe('155 2º LLAM');
    });

    it('returns an empty array for a page past the end of real data', () => {
        const $ = loadFixture('listing_empty.html');
        const items = parseListing($);
        expect(items).toEqual([]);
    });

    it('produces ids that overlap with an adjacent real page (documented pagination quirk)', () => {
        const $0 = loadFixture('listing_offset0.html');
        const $5 = loadFixture('listing_offset5.html');
        const ids0 = new Set(parseListing($0).map((i) => i.id));
        const ids5 = parseListing($5).map((i) => i.id);

        // Verified live 2026-09-04: offset=0 and offset=5 are NOT disjoint -
        // this asserts the real overlap so a future site fix (or a fixture
        // recapture) that removes it doesn't go unnoticed silently.
        const overlap = ids5.filter((id) => ids0.has(id));
        expect(overlap).toEqual(expect.arrayContaining(['148037', '148030']));
    });
});
