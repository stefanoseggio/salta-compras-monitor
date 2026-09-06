import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as cheerio from 'cheerio';
import { describe, expect, it } from 'vitest';

import { parseDetail } from '../../src/parsers/detail.js';

const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));

function loadFixture(name: string) {
    return cheerio.load(readFileSync(`${fixturesDir}/${name}`, 'utf-8'));
}

describe('parseDetail', () => {
    it('extracts the field set present on this publication (no Costo Pliego here)', () => {
        const $ = loadFixture('detail_148204.html');
        const detail = parseDetail($);

        expect(detail.fields.Objeto).toBe('ADQ. DE UN MOTOR TRIFASICO. PROGRAMA DE FISCALIZACION Y CONTROL');
        expect(detail.fields['Organismo Gestor']).toBe('Secretaria de Procedimientos de Contrataciones');
        expect(detail.fields['Organismo Originante y Destino']).toBe('Hospital Señor del Milagro');
        expect(detail.fields.Expediente).toBe('0100134-173362/2026-0');
        expect(detail.fields.Consultas).toBe('cotizacioneshmilagro@gmail.com TEL 387-4210223');
        expect(detail.fields['Costo Pliego']).toBeUndefined();
    });

    it('resolves pdfUrl and archivosAdjuntos to absolute URLs, separating the auto-generated PDF from real attachments', () => {
        const $ = loadFixture('detail_148204.html');
        const detail = parseDetail($);

        expect(detail.pdfUrl).toBe('https://compras.salta.gob.ar/publico/publicacionactual/pdfunapublicacion/148204');
        expect(detail.archivosAdjuntos).toHaveLength(2);
        expect(detail.archivosAdjuntos[0]).toEqual({
            nombre: 'PLIEGO Y CONDICIONES PP 198-26 -AS 98-26 - ADQ. DE MOTOR- FISCALIZACION.',
            url: 'https://compras.salta.gob.ar/publico/publicacionactual/descargarArchivoAdjunto/01092026154027.pdf',
        });
        expect(detail.archivosAdjuntos[1].url).toMatch(/\.xlsx$/);
    });

    it('picks up Costo Pliego when present, and correctly parses an old (2021) record with 2 attachments', () => {
        const $ = loadFixture('detail_36236.html');
        const detail = parseDetail($);

        expect(detail.fields['Costo Pliego']).toBe('$ 0,00');
        expect(detail.fields.Objeto).toBe('adquisicion articulos de limpieza');
        expect(detail.fields['Organismo Originante y Destino']).toBe('E.N.R.E.J.A');
        expect(detail.archivosAdjuntos).toHaveLength(2);
        expect(detail.archivosAdjuntos[0].nombre).toBe(
            'Pliego de condiciones generales y especificaciones técnicas - limpieza',
        );
        expect(detail.archivosAdjuntos[0].url).not.toBe(detail.archivosAdjuntos[1].url);
    });
});
