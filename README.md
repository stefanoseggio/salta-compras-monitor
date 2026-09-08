# Salta Tenders Scraper & Monitor

**The tender-alert feed the Province of Salta never shipped.** Extracts every public tender and contract award (contrataciones, adjudicaciones) from the Province of Salta, Argentina's official procurement portal (`compras.salta.gob.ar`) - server-rendered HTML, no browser needed, with full detail per publication on request: organism, expediente, opening date/time, and direct links to attached documents (pliego, cotizacion, etc) - and keeps it fresh with a delta mode that reports what is genuinely **new, amended, or no longer open**.

[![Salta Tenders Scraper & Monitor](https://apify.com/actor-badge?actor=stefano_seggio/salta-compras-monitor)](https://apify.com/stefano_seggio/salta-compras-monitor)

- **Catches amendments the listing never shows.** A changed monto, a new attached document or a corrected date is fingerprinted from the publication's own detail page and reported as `UPDATED`.
- **Knows when a tender is gone, not just silent.** The source's currently-open ("vigentes") list has no closed/withdrawn signal at all - a publication just disappears. This actor detects that absence against a complete walk and reports it as `CLOSED`, so a monitoring feed doesn't quietly lose track of what it was watching.
- **No proxy, no browser** - a plain server-rendered portal, read only.

## Who uses Salta procurement data

| Team | Question they ask | Fields that answer it | Decision |
| --- | --- | --- | --- |
| Suppliers to provincial organisms (construction, health, IT, general services) | Who is buying what I sell, and did the deadline or budget change? | `organismo`, `objeto`, `detail.fields`, `event_type=UPDATED` | Bid/no-bid, re-check the offer before the deadline |
| Bid consultants and gestores managing several clients | Did a tracked tender close, or get amended, since yesterday? | `event_type=CLOSED`/`UPDATED`, `source_url` | Notify the client, stop preparing an offer for a closed process |
| Regional tender-data resellers / LATAM procurement platforms | A structured, change-aware Salta feed instead of a screen scrape | The whole envelope (`record_id`, `event_type`, `scraped_at`, `is_new`, `source_url`, `contentHash`) | Buy vs. build one of dozens of provincial scrapers |
| Journalists, researchers, transparency groups | Which organisms publish the most Adjudicación Simple (direct-award) processes? | `tipoPublicacion`, `organismo`, `objeto` | Spending-pattern analysis by organism and process type |

## Delta mode

Set `onlyNew: true` for recurring/scheduled monitoring and each run returns only publications that are `NEW_LISTING`, `UPDATED` (a fingerprinted amendment) or `CLOSED` (no longer on the vigentes list). State persists across runs in a named key-value store unique to this actor. `eventTypes` narrows which of the three you want. Every record also always carries `is_new` (computed even on a plain non-delta run).

**Two real domain quirks, disclosed plainly:**

- `dateRange` filters on `fechaApertura`/`horaApertura`, the only date field this source exposes. For "vigentes" publications that date is almost always a **future** bid-opening deadline, so `dateRange` here means "opens within the next N" - the inverse of what a backward-dated source's date field would mean.
- `CLOSED` detection only runs when this run's walk was a **complete** census of the vigentes register (not truncated by `maxItems`) - a partial walk cannot prove a missing id actually closed rather than simply being past where the walk stopped. Raise `maxItems` above the real register size (currently ~250-300; check the live count) to enable it on a recurring monitor.

```python
from apify_client import ApifyClient

client = ApifyClient("YOUR_TOKEN")
run = client.actor("stefano_seggio/salta-compras-monitor").call(
    run_input={"onlyNew": True, "maxItems": 300}
)
for item in client.dataset(run["defaultDatasetId"]).iterate_items():
    print(item["record_id"], item["event_type"], item["organismo"])
```

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: 'YOUR_TOKEN' });
const run = await client.actor('stefano_seggio/salta-compras-monitor').call({ onlyNew: true, maxItems: 300 });
const { items } = await client.dataset(run.defaultDatasetId).listItems();
```

Wire new results straight into Slack, Zapier, Make, or your own endpoint with Apify's native [dataset webhooks](https://docs.apify.com/platform/integrations/webhooks) on this actor's runs - no custom webhook code lives inside the actor itself.

## What you get

| Field | Description |
| --- | --- |
| `record_id` | Publication id (the source's own id, reused as-is) |
| `event_type` | `NEW_LISTING` / `UPDATED` / `UNCHANGED` / `CLOSED` |
| `contentHash` | sha1 fingerprint used to detect `UPDATED` |
| `is_new` | `true` if `record_id` was not seen by a previous run (computed even when `onlyNew` is off) |
| `scraped_at` | ISO timestamp of this run's extraction (same for every record from one run) |
| `source_url` | Link to the official detail page |
| `titulo` | Full header as shown on the portal, e.g. "Adjudicación Simple N° 98/2026" |
| `tipoPublicacion` | Type, e.g. "Adjudicación Simple", "Contratación Abreviada", "Licitación Pública" |
| `numeroPublicacion` | Number as published - free text, not a clean number/year pair (see Known limitations) |
| `fechaApertura` / `horaApertura` | Opening date and time |
| `objeto` | Subject / short description |
| `organismo` | Organismo Originante y Destino (buying organism) |
| `expediente` | File number |
| `consultaPliego` | Where to consult / buy the bid documents |
| `consultas` | Contact info for questions |
| `detail.fields` | Full labeled detail from the detail page (organismo gestor, costo pliego, lugar de entrega, when present - the field set varies per publication) |
| `detail.pdfUrl` | Link to the portal's own auto-generated PDF of the publication |
| `detail.archivosAdjuntos` | Uploaded attachments: `{nombre, url}` |

## Input

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `fetchDetail` | boolean | `true` | Fetch full detail per publication (one extra request each, re-fetched for known items too when `onlyNew` is on - see Delta mode) |
| `maxItems` | integer | `100` | Hard cap on publications returned this run |
| `onlyNew` | boolean | `false` | Delta mode: only new/changed/closed publications - see Delta mode above |
| `eventTypes` | array | all three | Which of `NEW_LISTING`/`UPDATED`/`CLOSED` to deliver when `onlyNew` is on |
| `dateRange` | `"24h"` \| `"7d"` \| `"30d"` | _(none)_ | Filter to publications opening within the given window from now (see Delta mode above) - independent of `onlyNew` |

```json
{ "fetchDetail": true, "maxItems": 100 }
```

```json
{ "onlyNew": true, "maxItems": 300, "eventTypes": ["NEW_LISTING", "UPDATED"] }
```

## Usage

```bash
curl "https://api.apify.com/v2/acts/stefano_seggio~salta-compras-monitor/run-sync-get-dataset-items?token=YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"maxItems": 100}'
```

```python
from apify_client import ApifyClient

client = ApifyClient("YOUR_TOKEN")
run = client.actor("stefano_seggio/salta-compras-monitor").call(run_input={"maxItems": 100})
for item in client.dataset(run["defaultDatasetId"]).iterate_items():
    print(item["record_id"], item["organismo"], item["objeto"])
```

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: 'YOUR_TOKEN' });
const run = await client.actor('stefano_seggio/salta-compras-monitor').call({ maxItems: 100 });
const { items } = await client.dataset(run.defaultDatasetId).listItems();
```

## How much does it cost to monitor Salta tenders?

Pay per event, platform usage included:

| Event | Price | When |
| --- | --- | --- |
| `result` | **$0.003** per record | A record with fresh detail fetched this run (new or amended, `fetchDetail: true`) |
| `result-summary` | **$0.001** per record | A listing-only record (`fetchDetail: false`), or a `CLOSED` record (nothing to re-fetch - it's gone) |
| Actor start | $0.00005 | Once per run |

A daily monitor of the ~250-publication register that finds 5 changes costs about $0.02/day (~$0.60/month); a one-off full pull with detail costs about $0.75.

## Known limitations

- No proxy needed - the source is reachable from a plain datacenter IP.
- Only currently-open ("vigentes") publications are covered - not the historical/closed archive, which lives behind a separate search form this actor doesn't drive. See `AGENTS.md`.
- The portal's own pagination can return the same publication on two adjacent pages once several records share an opening date/time; this actor de-duplicates by id, but a perfectly gap-free walk isn't guaranteed by the source itself. See `AGENTS.md`.
- `numeroPublicacion` is raw free text (e.g. `"155 2º LLAM"`, `"MED17029"`), not a structured number/year pair - real data doesn't support that structure consistently.
- `onlyNew` fetches the full listing (up to `maxItems`) every run and filters afterward - it does not stop paginating early, and with `fetchDetail: true` it re-reads the detail page of every walked publication (known and new) to detect amendments, not only the ones ultimately delivered. Use `fetchDetail: false` for a lighter-weight monitor if this matters to you.
- `CLOSED` is only ever reported when this run's walk was complete (not truncated by `maxItems`) - see Delta mode above.
- `dateRange` doesn't adjust for Argentina's UTC-3 offset, which can shift a near-boundary record by a few hours.

Full technical detail is in `AGENTS.md`.
