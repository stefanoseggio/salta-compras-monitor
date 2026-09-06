export type DateRangeOption = '24h' | '7d' | '30d';

export interface ActorInput {
    fetchDetail: boolean;
    maxItems: number;
    onlyNew: boolean;
    dateRange?: DateRangeOption;
}

// One card from the listing page (`article.publicacion`). Every listing
// article verified live (15 sampled across pages 1, 2, 3, offset 125, 200,
// 245 - 2021 through 2026 records) carries exactly these 5 body fields plus
// the header, so these are typed as plain strings rather than optional.
export interface ListingItem {
    id: string;
    titulo: string;
    tipoPublicacion: string;
    numeroPublicacion: string;
    fechaApertura: string;
    horaApertura: string;
    objeto: string;
    organismo: string;
    expediente: string;
    consultaPliego: string;
    consultas: string;
    detailUrl: string;
}

export interface ArchivoAdjunto {
    nombre: string;
    url: string;
}

// The detail page's field set is NOT fixed: `Organismo Gestor` and
// `Costo Pliego` are present on some publications and absent on others,
// `Consultas` is sometimes missing (verified live across 7 detail pages
// spanning 2021-2026). A generic label->value bag is the only honest
// representation - see AGENTS.md.
export interface PublicacionDetail {
    fields: Record<string, string>;
    pdfUrl: string | null;
    archivosAdjuntos: ArchivoAdjunto[];
}

// Output envelope: `record_id` and `source_url` replace `ListingItem`'s `id`
// and `detailUrl` (same values, standardized names - see AGENTS.md for why
// keeping both would be a sloppy duplicate), and `event_type` / `scraped_at`
// / `is_new` are new. Deliberately NOT `extends ListingItem` for this
// reason - the fields below are listed explicitly instead of spread, so
// `id`/`detailUrl` can't sneak back in as an accidental duplicate.
export interface PublicacionRecord {
    titulo: string;
    tipoPublicacion: string;
    numeroPublicacion: string;
    fechaApertura: string;
    horaApertura: string;
    objeto: string;
    organismo: string;
    expediente: string;
    consultaPliego: string;
    consultas: string;
    detail: PublicacionDetail | null;

    // Delta Engine output envelope (see AGENTS.md):
    record_id: string;
    event_type: string;
    scraped_at: string;
    is_new: boolean;
    source_url: string;
}
