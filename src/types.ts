export interface ActorInput {
    fetchDetail: boolean;
    maxItems: number;
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

export interface PublicacionRecord extends ListingItem {
    detail: PublicacionDetail | null;
    scrapedAt: string;
}
