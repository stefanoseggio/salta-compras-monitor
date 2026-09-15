<div align="center">

# Salta Argentina Contrataciones - Tender Delta API

*A delta-tracked monitor for Salta Province's public procurement portal — new, amended and closed tenders delivered as a dataset, not a page you have to keep re-checking.*

[![Built for Apify](https://img.shields.io/badge/Built%20for-Apify-00C0F3?logo=apify&logoColor=white)](https://apify.com)
[![Pay-Per-Event](https://img.shields.io/badge/pricing-pay--per--event%20from%20%240.001-3DDC84)](https://apify.com/stefano_seggio/salta-compras-monitor)
[![TypeScript](https://img.shields.io/badge/TypeScript-Crawlee%2FCheerio-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/stefanoseggio/salta-compras-monitor/blob/main/LICENSE)

[![Run on Apify](https://img.shields.io/badge/Run%20on-Apify%20Store-FF9012?logo=apify&logoColor=white&style=for-the-badge)](https://apify.com/stefano_seggio/salta-compras-monitor)

Owner console reference: [console.apify.com/actors/Tx9wBKZyySZa5WcsE](https://console.apify.com/actors/Tx9wBKZyySZa5WcsE)

</div>

## What this monitors

[`compras.salta.gob.ar`](https://compras.salta.gob.ar) is the Province of Salta, Argentina's official portal for public procurement (**compras públicas**) — every currently open (*vigente*) **licitación pública**, **contratación abreviada** and **adjudicación simple** the province's organisms are running. Checking it by hand means paging through the open register five records at a time, opening each publication's detail page for the organism, expediente and attached documents, and remembering what you saw last time to tell what actually changed. There is no RSS feed, no change log, and no API — just a paginated HTML register that silently reflects a new amount, a corrected opening date, or a publication that quietly disappears once it closes.

This Actor automates that loop. It walks the full open register, fingerprints every publication's content, and returns a dataset that already tells you what is **new**, **amended** or **closed** since your last run — scoped to exactly what the source publishes, nothing broader.

Point it at a daily schedule and the manual page-by-page check for Salta government tenders and public procurement becomes a dataset diff you can wire into Slack, a spreadsheet, or your own pipeline.

## Who uses this

- **Suppliers bidding into Salta provincial organisms** (construction, health equipment, IT, general services). Filter by organism and subject to find `Adjudicación Simple`, `Contratación Abreviada` or `Licitación Pública` processes that match what you sell, and watch for an `UPDATED` event on a tracked record to catch a changed amount, a newly attached document, or a corrected opening date before the deadline passes.
- **Bid consultants and gestores tracking several clients' tenders at once.** Run with `onlyNew: true` and get back only the publications that are new, changed or closed since the last run, with a direct link to the official page for each — no need to re-read the whole portal to see what moved.
- **Transparency researchers and journalists.** Because every record carries the publication type and buying organism, a dataset built up over scheduled runs lets you tally how often a given hospital or ministry issues lower-competition awards versus competitive calls — a pattern that's tedious to compile by re-visiting the portal case by case.

## How it works

```mermaid
flowchart LR
    A["compras.salta.gob.ar<br/>vigentes register<br/>(~250 open publications, 5/page)"] --> B["fetch + cheerio parse<br/>dedup by record_id across pages"]
    B --> C{"fetchDetail?"}
    C -->|true| D["Detail page fetch<br/>organismo gestor, costo pliego,<br/>archivos adjuntos, pdfUrl"]
    C -->|false| E["Listing fields only"]
    D --> F["sha1 content fingerprint<br/>(contentHash)"]
    E --> F
    F --> G["Compare vs delta state<br/>(named key-value store,<br/>capped at 5,000 ids)"]
    G --> H{"classify event_type"}
    H -->|"NEW_LISTING or UPDATED"| I["charge: result<br/>$0.003"]
    H -->|"CLOSED or listing-only"| J["charge: result-summary<br/>$0.001"]
    I --> K[("Dataset record")]
    J --> K
```

## Features

| Feature | What it does |
| --- | --- |
| **Delta mode** (`onlyNew`) | Returns only publications that are new, changed or closed since a previous run; state persists in a named key-value store dedicated to this Actor so it survives between scheduled runs. |
| **Amendment detection** | Every publication is sha1-fingerprinted (`contentHash`) over its listing and detail fields, so a changed amount, a newly attached document, or a corrected opening date is reported as `UPDATED` instead of silently overwriting what a previous run saw. |
| **Closure inference** | A previously-seen `record_id` absent from a *complete* walk is reported as `CLOSED` — the open register has no closed/withdrawn signal, a publication just disappears. |
| **Event-type filter** (`eventTypes`) | Narrows delta-mode delivery to any subset of `NEW_LISTING`, `UPDATED`, `CLOSED`. |
| **Opening-window filter** (`dateRange`) | Filters to publications whose bid-opening deadline (`fechaApertura`/`horaApertura`) falls in the next 24h, 7d or 30d — the only date field this source exposes. |
| **Full detail fetch** (`fetchDetail`) | Pulls organismo gestor, costo pliego, lugar de entrega and attached-document links (PDFs, spreadsheets) per publication, on top of the listing fields. |
| **Pagination-safe extraction** | Deduplicates publications that the portal's own pagination repeats across adjacent pages, with 4 retries and exponential backoff (1s/2s/4s/8s) on every request. |
| **Run cap** (`maxItems`) | Hard limit on publications returned per run, sized against the register's own ~250-publication scale. |

## Input reference

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `fetchDetail` | boolean | `true` | Fetch each publication's detail page for the full field set plus attached-document links. Disable for a faster, listing-only run. |
| `maxItems` | integer | `100` | Hard cap on publications returned this run. |
| `onlyNew` | boolean | `false` | Delta mode: returns only publications that are new, changed or closed since a previous run. |
| `eventTypes` | array | all three | Which of `NEW_LISTING` / `UPDATED` / `CLOSED` to deliver when `onlyNew` is on. |
| `dateRange` | enum | *(none)* | `"24h"`, `"7d"` or `"30d"` — filters to publications opening within that window. |

## Sample output record

One dataset record per publication, combining the source's listing and detail-page fields with a change-tracking envelope (real field values, from a publication fetched during development):

```json
{
  "record_id": "148204",
  "titulo": "Adjudicación Simple N° 98/2026",
  "tipoPublicacion": "Adjudicación Simple",
  "fechaApertura": "07/09/2026",
  "horaApertura": "09:00",
  "objeto": "ADQ. DE UN MOTOR TRIFASICO. PROGRAMA DE FISCALIZACION Y CONTROL",
  "organismo": "Hospital Señor del Milagro",
  "expediente": "0100134-173362/2026-0",
  "event_type": "NEW_LISTING",
  "is_new": true,
  "contentHash": "6cffa4c6c4f40d13d460fbee614a93deea4214eb",
  "source_url": "https://compras.salta.gob.ar/publico/publicacionactual/verpublicacion1/148204/0",
  "scraped_at": "2026-09-04T21:19:40.875Z"
}
```

The `detail` object (when `fetchDetail` is on) adds `fields` (organismo gestor, costo pliego, lugar de entrega, when present), `pdfUrl`, and `archivosAdjuntos` — the publication's uploaded PDF/spreadsheet attachments. See [`.actor/dataset_schema.json`](.actor/dataset_schema.json) for the full shape, and the Actor's two ready-made dataset views (**Overview**, **Status changes & amendments**) on the Apify platform.

## Quick start

Run it directly from the [Apify Store](https://apify.com/stefano_seggio/salta-compras-monitor), or from the CLI:

```bash
apify call salta-compras-monitor --input '{
  "fetchDetail": true,
  "maxItems": 100,
  "onlyNew": true,
  "eventTypes": ["NEW_LISTING", "UPDATED", "CLOSED"],
  "dateRange": "7d"
}'
```

For a faster, listing-only census of the whole register instead of a recurring delta check:

```bash
apify call salta-compras-monitor --input '{ "fetchDetail": false, "maxItems": 300 }'
```

## Instant Terminal Run (cURL)

Runs synchronously and returns the resulting dataset items directly in the response - no polling needed. Get your token from [console.apify.com/settings/integrations](https://console.apify.com/settings/integrations).

```bash
curl -X POST "https://api.apify.com/v2/acts/Tx9wBKZyySZa5WcsE/run-sync-get-dataset-items?token=<YOUR_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
  "maxItems": 50,
  "onlyNew": true
}'
```

## Sample Extracted Dataset (JSON)

One real record from this Actor's own dataset, matching `.actor/dataset_schema.json`:

```json
{
  "record_id": "148204",
  "titulo": "Adjudicacion Simple N 98/2026",
  "tipoPublicacion": "Adjudicacion Simple",
  "fechaApertura": "07/09/2026",
  "horaApertura": "09:00",
  "objeto": "ADQ. DE UN MOTOR TRIFASICO. PROGRAMA DE FISCALIZACION Y CONTROL",
  "organismo": "Hospital Senor del Milagro",
  "expediente": "0100134-173362/2026-0",
  "event_type": "NEW_LISTING",
  "is_new": true,
  "contentHash": "6cffa4c6c4f40d13d460fbee614a93deea4214eb",
  "source_url": "https://compras.salta.gob.ar/publico/publicacionactual/verpublicacion1/148204/0",
  "scraped_at": "2026-09-04T21:19:40.875Z"
}
```

## Pricing (Pay-Per-Event)

| Event | Price | Charged when |
| --- | --- | --- |
| `result` | $0.003 / record | A record with fresh detail fetched this run — new or amended, `fetchDetail: true` |
| `result-summary` | $0.001 / record | A listing-only record (`fetchDetail: false`), or a `CLOSED` record — there's nothing left to re-fetch |

Platform usage is included in both prices — there is no separate compute charge. A daily monitor of the roughly 250-publication register that finds 5 changes costs about $0.02/day (~$0.60/month); a one-off full pull with detail across the whole register costs about $0.75.

## Reliability

- **No proxy, no browser.** The source is server-rendered HTML with the tender data already present in the initial response, so a plain fetch + cheerio parse reaches it from a standard datacenter IP.
- **Retries with backoff.** Every request retries up to 4 times with exponential backoff (1s, 2s, 4s, 8s) before the run gives up, isolating transient network failures from real extraction issues.
- **Pagination deduplicated by id.** The portal's own pagination can return the same publication on two adjacent pages once several records share the same opening date/time; the walk tracks seen ids in-run and drops repeats before they reach the dataset.
- **Delta state persisted safely.** Seen-publication state lives in a named key-value store dedicated to this Actor, which survives between scheduled runs, and is capped at the 5,000 most recently numbered ids so it doesn't grow unbounded.

## Why not just scrape it yourself

- **Zero infrastructure.** No server or cron box to provision and keep alive — the Actor runs on Apify's platform and can be scheduled from the Apify Scheduler in a couple of clicks.
- **Nothing to babysit.** Pagination is walked and deduplicated by id automatically, and every request already retries with exponential backoff before the run gives up on a transient failure.
- **Built-in delta and change detection.** The sha1 content-fingerprinting and cross-run delta state (new / amended / closed) are already built and tested — you'd otherwise have to design and persist that comparison logic yourself.
- **Managed scheduling and structured output.** Runs land in a dataset with two ready-made views instead of raw HTML you'd have to parse into your own database before you could query it.

## Known limitations

- `dateRange` filters by each publication's bid-opening deadline (`fechaApertura`/`horaApertura`) — the only date field the source exposes anywhere. For the currently-open register, that date is almost always in the future, so this reads as "opens within the next N," not "published in the last N."
- `CLOSED` detection requires a *complete* walk of the register. If `maxItems` truncates it, closure detection is skipped for that run (and logged) rather than guessed from a partial census.
- Delta state is capped at the 5,000 most recently numbered ids so it doesn't grow unbounded — it is not an unlimited historical archive of every publication ever seen.
- This is an independently developed and maintained Actor, not a managed enterprise product — there is no contractual uptime SLA. Issues are typically triaged within about 48 hours via the Actor's issue tracker on the Apify Store.

---

<div align="center">

### About Delta Registry

This Actor is part of **Delta Registry** — pay-per-event regulatory and compliance data infrastructure, turning government portals that offer no API into structured, delta-tracked datasets. For professional inquiries or enterprise licensing, reach out on [LinkedIn](https://www.linkedin.com/in/stefanoseggio-deltaregistry); for the rest of the fleet, see [github.com/stefanoseggio](https://github.com/stefanoseggio).

</div>
