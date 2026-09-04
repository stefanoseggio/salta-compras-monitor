import type { CheerioAPI } from 'cheerio';

import type { ArchivoAdjunto, PublicacionDetail } from '../types.js';

const SITE_BASE = 'https://compras.salta.gob.ar/';

// The detail page (`publico/publicacionactual/verpublicacion1/{id}/0`)
// repeats the same `.publicacion-fila` label/value structure as the
// listing card, but with a richer, NOT fixed field set - verified live
// across 7 detail pages spanning 2021-2026: `Organismo Gestor` and
// `Costo Pliego` are present on some publications and absent on others,
// `Consultas` is sometimes missing entirely. A generic label->value bag
// (keyed by the label with its trailing ":" stripped) is the only
// representation that doesn't silently drop real data or fabricate a
// field that isn't there.
//
// "Archivos Adjuntos" is a separate block: the site always generates one
// PDF of the publication itself (href containing `pdfunapublicacion`) plus
// zero or more uploaded attachments (href containing
// `descargarArchivoAdjunto`) - both verified live, separated here rather
// than lumped into one list so the auto-generated PDF isn't confused with
// an actual uploaded pliego/resolucion.
export function parseDetail($: CheerioAPI): PublicacionDetail {
    const fields: Record<string, string> = {};
    $('.publicacion-cuerpo .publicacion-fila').each((_i, row) => {
        const $row = $(row);
        const label = $row.find('.publicacion-fila-titulo').first().text().trim().replace(/:$/, '');
        const value = $row.find('.publicacion-fila-descripcion').first().text().trim();
        if (label) fields[label] = value;
    });

    const $pdfLink = $('a[href*="pdfunapublicacion"]').first();
    const pdfHref = $pdfLink.attr('href');
    const pdfUrl = pdfHref ? new URL(pdfHref, SITE_BASE).toString() : null;

    const archivosAdjuntos: ArchivoAdjunto[] = [];
    $('a[href*="descargarArchivoAdjunto"]').each((_i, el) => {
        const $a = $(el);
        const href = $a.attr('href');
        if (!href) return;
        archivosAdjuntos.push({
            nombre: ($a.attr('title') ?? $a.text()).trim(),
            url: new URL(href, SITE_BASE).toString(),
        });
    });

    return { fields, pdfUrl, archivosAdjuntos };
}
