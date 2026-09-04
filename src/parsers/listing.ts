import type { CheerioAPI } from 'cheerio';

import type { ListingItem } from '../types.js';

const DETAIL_URL_BASE = 'https://compras.salta.gob.ar/publico/publicacionactual/verpublicacion1';

// Splits a header like "Adjudicación Simple N° 98/2026" into
// { tipo: "Adjudicación Simple", numero: "98/2026" }. Verified live across
// 25+ headers (offsets 0, 5, 10, 25, 75, 125, 175, 200, 245): the
// "<tipo> N° <numero>" shape itself is consistent, but `numero` is NOT a
// clean "n/aaaa" pattern - real examples include "155 2º LLAM", "MED17029"
// (no slash, no year), "A.S 185/26", "5289/21" and bare "3". Splitting only
// on "N°" (never trying to further parse a number/year out of the tail) is
// the honest boundary - a stricter pattern would silently drop or mangle a
// large fraction of real records.
function splitTitulo(titulo: string): { tipo: string; numero: string } {
    const match = /^(.+?)\s+N°\s+(.+)$/.exec(titulo);
    if (!match) return { tipo: titulo, numero: '' };
    return { tipo: match[1].trim(), numero: match[2].trim() };
}

// The listing page (`publico/publicacionactual/panelfiltrobusqueda/{offset}`)
// server-renders each result as an `<article class="publicacion">` block -
// verified live 2026-09-04, no JS execution needed. Body fields are a fixed
// set of 5 `.publicacion-fila` label/value pairs on every article sampled
// (15 articles across 2021-2026 records): Objeto, Organismo Originante y
// Destino, Expte. (abbreviated - the detail page spells it "Expediente",
// a genuinely different label, not a typo), Consulta y Adquisición Pliego,
// Consultas.
export function parseListing($: CheerioAPI): ListingItem[] {
    const items: ListingItem[] = [];

    $('article.publicacion').each((_i, article) => {
        const $article = $(article);
        const $encabezado = $article.find('.publicacion-encabezado').first();

        const $fechaSpan = $encabezado.find('span[style]').first();
        const fechaParts = $fechaSpan
            .find('span')
            .map((_j, el) => $(el).text().trim())
            .get();
        const fechaApertura = fechaParts[1] ?? '';
        const horaApertura = fechaParts[2] ?? '';

        const titulo = $encabezado.children('span').not('[style]').first().text().trim();
        const { tipo: tipoPublicacion, numero: numeroPublicacion } = splitTitulo(titulo);

        const fields: Record<string, string> = {};
        $article.find('.publicacion-fila').each((_j, row) => {
            const $row = $(row);
            const label = $row.find('.publicacion-fila-titulo').first().text().trim().replace(/:$/, '');
            const value = $row.find('.publicacion-fila-descripcion').first().text().trim();
            if (label) fields[label] = value;
        });

        const onclick = $article.find('input[onclick*="verpublicacion1"]').attr('onclick') ?? '';
        const idMatch = /verpublicacion1\/(\d+)\//.exec(onclick);
        const id = idMatch?.[1] ?? '';
        if (!id || !titulo) return; // not a real publication card - skip defensively

        items.push({
            id,
            titulo,
            tipoPublicacion,
            numeroPublicacion,
            fechaApertura,
            horaApertura,
            objeto: fields.Objeto ?? '',
            organismo: fields['Organismo Originante y Destino'] ?? '',
            expediente: fields['Expte.'] ?? '',
            consultaPliego: fields['Consulta y Adquisición Pliego'] ?? '',
            consultas: fields.Consultas ?? '',
            detailUrl: `${DETAIL_URL_BASE}/${id}/0`,
        });
    });

    return items;
}
