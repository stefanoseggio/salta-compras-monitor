export type DateRangeOption = '24h' | '7d' | '30d';
/**
 * NEW_LISTING: id never seen before. UPDATED: id seen before, content fingerprint changed (a
 * new monto, date, attached document...). UNCHANGED: id seen before, same fingerprint - only
 * ever produced on a full (onlyNew=false) run. CLOSED: an id this actor previously saw is
 * absent from a COMPLETE walk this run (fetchListing was not truncated by maxItems) - it has
 * left the vigentes list: closed, resolved, expired or withdrawn. The source does not say
 * which, so this actor does not guess. See src/delta.ts and AGENTS.md "Delta engine v2".
 */
export type EventType = 'NEW_LISTING' | 'UPDATED' | 'UNCHANGED' | 'CLOSED';
export interface ActorInput {
    fetchDetail: boolean;
    maxItems: number;
    onlyNew: boolean;
    /** Which event types to deliver when onlyNew=true. Ignored (everything delivered) when onlyNew=false. CLOSED is always delivered regardless, unless explicitly excluded here. */
    eventTypes?: Exclude<EventType, 'UNCHANGED'>[];
    dateRange?: DateRangeOption;
}
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
export interface PublicacionDetail {
    fields: Record<string, string>;
    pdfUrl: string | null;
    archivosAdjuntos: ArchivoAdjunto[];
}
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
    record_id: string;
    event_type: EventType;
    scraped_at: string;
    is_new: boolean;
    source_url: string;
    /** sha1 content fingerprint as of this run (or as last known, for a CLOSED record) - see src/fingerprint.ts. */
    contentHash: string;
}
//# sourceMappingURL=types.d.ts.map