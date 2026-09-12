# Salta Government Tenders Monitor - Argentina Public Procurement (Contrataciones)

## Executive Value Proposition

Checking `compras.salta.gob.ar` by hand means paging through the currently-open ("vigentes") register five records at a time, opening each publication's detail page for the organism, expediente and attached documents, and remembering what you saw last time so you can tell what actually changed. This actor automates that loop: it walks the full open register, fingerprints every publication's content, and returns a dataset that already tells you what is new, amended or closed since your last run. Point it at a daily schedule and the manual page-by-page check becomes a dataset diff you can wire into Slack, a spreadsheet, or your own pipeline. It scopes to exactly what the source publishes - the Province of Salta's currently-open procurement register - nothing broader.

## Who uses this

- **Suppliers bidding into Salta provincial organisms** (construction, health equipment, IT, general services). Filter by `organismo` and `objeto` to find `Adjudicación Simple`, `Contratación Abreviada` or `Licitación Pública` processes that match what you sell, and watch `event_type=UPDATED` on a tracked `record_id` to catch a changed amount, a newly attached document, or a corrected `fechaApertura` before the deadline passes.
- **Bid consultants and gestores tracking several clients' tenders at once.** Run with `onlyNew: true` and get back only `NEW_LISTING`, `UPDATED` and `CLOSED` records since the last run, with `source_url` linking straight to the official page - no need to re-read the whole portal to see what moved.
- **Transparency researchers and journalists.** Because every record carries `tipoPublicacion` and `organismo`, a dataset built up over scheduled runs lets you tally how often a given hospital or ministry issues lower-competition `Adjudicación Simple` awards versus competitive `Licitación Pública` calls - a pattern that's tedious to compile by re-visiting the portal case by case.

## Input

```json
{ "fetchDetail": true, "maxItems": 100 }
```

```json
{ "onlyNew": true, "maxItems": 300, "eventTypes": ["NEW_LISTING", "UPDATED"] }
```

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `fetchDetail` | boolean | `true` | Fetch each publication's detail page for the full field set (organismo gestor, costo pliego, lugar de entrega, when present) plus attached-document links. Disable for a faster, listing-only run. |
| `maxItems` | integer | `100` | Hard cap on publications returned this run. The portal serves roughly 250 currently-open publications at a time, 5 per page. |
| `onlyNew` | boolean | `false` | Delta mode for recurring monitoring: returns only publications that are new, changed (a fingerprinted amendment) or closed since a previous run. State persists in a named key-value store unique to this actor. |
| `eventTypes` | array | all three | Which kinds of change to deliver when `onlyNew` is on (ignored - everything delivered - when it is off): `NEW_LISTING`, `UPDATED`, `CLOSED`. |
| `dateRange` | `"24h"` \| `"7d"` \| `"30d"` | _(none)_ | Filters to publications whose `fechaApertura`/`horaApertura` (bid-opening deadline - the only date field this source exposes) falls within the window. Since open publications' opening dates are almost always in the future, this reads as "opens within the next N," not "published in the last N." Independent of `onlyNew`. |

## Output

One dataset record per publication, combining the source's listing and detail-page fields with a change-tracking envelope. Example (real field values, from a publication fetched during development):

```json
{
  "record_id": "148204",
  "titulo": "Adjudicación Simple N° 98/2026",
  "tipoPublicacion": "Adjudicación Simple",
  "numeroPublicacion": "98/2026",
  "fechaApertura": "07/09/2026",
  "horaApertura": "09:00",
  "objeto": "ADQ. DE UN MOTOR TRIFASICO. PROGRAMA DE FISCALIZACION Y CONTROL",
  "organismo": "Hospital Señor del Milagro",
  "expediente": "0100134-173362/2026-0",
  "consultaPliego": "HOSPITAL SEÑOR DEL MILAGRO-SECTOR COMPRAS -AVDA SARMIENTO 557 - SALTA CAPITAL- TEL.0387-4210223-0387-4317400 INT.242",
  "consultas": "cotizacioneshmilagro@gmail.com TEL 387-4210223",
  "event_type": "NEW_LISTING",
  "is_new": true,
  "contentHash": "6cffa4c6c4f40d13d460fbee614a93deea4214eb",
  "source_url": "https://compras.salta.gob.ar/publico/publicacionactual/verpublicacion1/148204/0",
  "detail": {
    "fields": {
      "Objeto": "ADQ. DE UN MOTOR TRIFASICO. PROGRAMA DE FISCALIZACION Y CONTROL",
      "Organismo Gestor": "Secretaria de Procedimientos de Contrataciones",
      "Organismo Originante y Destino": "Hospital Señor del Milagro",
      "Expediente": "0100134-173362/2026-0",
      "Consulta y Adquisición Pliego": "HOSPITAL SEÑOR DEL MILAGRO-SECTOR COMPRAS -AVDA SARMIENTO 557 - SALTA CAPITAL- TEL.0387-4210223-0387-4317400 INT.242",
      "Lugar Entrega de Sobre y Apertura": "HOSPITAL SEÑOR DEL MILAGRO - SECTOR COMPRAS - AVDA SARMIETO 557 -SALTA CAPITAL",
      "Consultas": "cotizacioneshmilagro@gmail.com TEL 387-4210223"
    },
    "pdfUrl": "https://compras.salta.gob.ar/publico/publicacionactual/pdfunapublicacion/148204",
    "archivosAdjuntos": [
      { "nombre": "PLIEGO Y CONDICIONES PP 198-26 -AS 98-26 - ADQ. DE MOTOR- FISCALIZACION.", "url": "https://compras.salta.gob.ar/publico/publicacionactual/descargarArchivoAdjunto/01092026154027.pdf" },
      { "nombre": "COTIZACION  PP 198-26 AS 98-26 -MOTOR TRIFASICO- FISCALIZACION", "url": "https://compras.salta.gob.ar/publico/publicacionactual/descargarArchivoAdjunto/01092026154037.xlsx" }
    ]
  },
  "scraped_at": "2026-09-04T21:19:40.875Z"
}
```

| Field | Description |
| --- | --- |
| `record_id` | Publication id (the source's own id, reused as-is) |
| `titulo` | Full header as shown on the portal, e.g. "Adjudicación Simple N° 98/2026" |
| `tipoPublicacion` | Type, e.g. "Adjudicación Simple", "Contratación Abreviada", "Licitación Pública" |
| `numeroPublicacion` | Number as published - free text, not a clean number/year pair (real examples: `"98/2026"`, `"155 2º LLAM"`, `"MED17029"`) |
| `fechaApertura` / `horaApertura` | Opening date and time |
| `objeto` | Subject / short description |
| `organismo` | Organismo Originante y Destino (buying organism) |
| `expediente` | File number |
| `consultaPliego` | Where to consult / buy the bid documents |
| `consultas` | Contact info for questions |
| `event_type` | `NEW_LISTING` / `UPDATED` / `UNCHANGED` / `CLOSED` |
| `is_new` | `true` if `record_id` was not seen by a previous run (computed even when `onlyNew` is off) |
| `contentHash` | sha1 fingerprint of this record's changeable fields, used to detect `UPDATED` between runs |
| `source_url` | Link to the official detail page |
| `detail.fields` | Full labeled detail from the detail page (organismo gestor, costo pliego, lugar de entrega, when present - the field set varies per publication) |
| `detail.pdfUrl` | Link to the portal's own auto-generated PDF of the publication |
| `detail.archivosAdjuntos` | Uploaded attachments: `{nombre, url}` |
| `scraped_at` | ISO timestamp of this run's extraction (same for every record from one run) |

## Reliability

- **No proxy, no browser.** `compras.salta.gob.ar` is server-rendered HTML with the tender data already present in the initial response, so a plain `fetch()` + cheerio parse reaches it from a standard datacenter IP.
- **Retries with backoff.** Every request retries up to 4 times with exponential backoff (1s, 2s, 4s, 8s) before the run gives up, isolating transient network failures from real extraction issues.
- **Pagination deduplicated by id.** The portal's own pagination can return the same publication on two adjacent pages once several records share the same opening date/time; the walk tracks seen ids in-run and drops repeats before they reach the dataset.
- **Amendments detected, not just new listings.** Every publication is fingerprinted (sha1 over its listing and detail fields) so a changed amount, a newly attached document, or a corrected date is reported as `UPDATED` instead of silently overwriting what a previous run saw.
- **Closures inferred, not assumed.** The open ("vigentes") list has no closed/withdrawn signal - a publication just disappears. A previously-seen id absent from a *complete* walk is reported as `CLOSED`; if `maxItems` truncates the walk, `CLOSED` detection is skipped for that run (and logged) rather than guessed from a partial census.
- **Delta state persisted safely.** Seen-publication state (id, content hash, and enough fields to name a `CLOSED` record) lives in a named key-value store dedicated to this actor, which survives between scheduled runs unlike a run's own default store, and is capped at the 5,000 most recently numbered ids so it doesn't grow unbounded.

## Pricing

Pay per event, platform usage included - no separate compute charge:

| Event | Price | When it's charged |
| --- | --- | --- |
| `result` | $0.003 per record | A record with fresh detail fetched this run (new or amended, `fetchDetail: true`) |
| `result-summary` | $0.001 per record | A listing-only record (`fetchDetail: false`), or a `CLOSED` record (nothing to re-fetch - it's gone) |
| Actor start | $0.00005 | Once per run |

A daily monitor of the roughly 250-publication register that finds 5 changes costs about $0.02/day (~$0.60/month); a one-off full pull with detail across the whole register costs about $0.75.

## Support & Enterprise SLA

This is an independently developed and maintained actor, not a managed enterprise product - there is no contractual uptime SLA. Bug reports and feature requests are handled through the actor's issue tracker on the Apify Store; issues are typically triaged within about 48 hours. If the Salta portal changes its markup or field set, please open an issue with the details you're seeing so the extraction logic can be checked against the live source.
