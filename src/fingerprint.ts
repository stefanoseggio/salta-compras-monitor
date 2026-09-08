import { createHash } from 'node:crypto';

import type { ListingItem, PublicacionDetail } from './types.js';

/**
 * A stable content fingerprint of one publication: every listing-card field, plus the
 * detail page's field bag/pdfUrl/attachments when it was fetched. Excludes `id`/`detailUrl`
 * (identity, not content). When `detail` is null (fetchDetail=false), the fingerprint covers
 * only what the listing card carries - a change confined to a detail-only field (e.g. a new
 * attached document) will not be caught in listing-only mode. That is a real, disclosed
 * tradeoff of the fast path, not a bug - see README.md "Delta mode".
 */
export function fingerprintOf(item: ListingItem, detail: PublicacionDetail | null): string {
    const stable = {
        titulo: item.titulo,
        tipoPublicacion: item.tipoPublicacion,
        numeroPublicacion: item.numeroPublicacion,
        fechaApertura: item.fechaApertura,
        horaApertura: item.horaApertura,
        objeto: item.objeto,
        organismo: item.organismo,
        expediente: item.expediente,
        consultaPliego: item.consultaPliego,
        consultas: item.consultas,
        detail: detail ? { fields: detail.fields, pdfUrl: detail.pdfUrl, archivosAdjuntos: detail.archivosAdjuntos } : null,
    };
    return createHash('sha1').update(JSON.stringify(stable)).digest('hex');
}
