# Salta Compras Monitor

Extracts **public tenders and contract awards** (contrataciones,
adjudicaciones) from the Province of Salta, Argentina's official public
procurement portal (`compras.salta.gob.ar`) - server-rendered HTML, no
browser needed, with full detail per publication on request: organism,
expediente, opening date/time, and direct links to attached documents
(pliego, cotizacion, etc).

## Delta mode

Run this daily (or on any Apify schedule) with `onlyNew: true` and it
becomes a recurring B2B monitoring feed instead of a static dump: each run
persists which publication ids it has already returned (in a key-value
store unique to this actor, surviving across scheduled runs) and returns
only the ones it hasn't seen before. Every record also carries `is_new`,
so even a full (non-delta) run tells you which of its results are new.

```python
from apify_client import ApifyClient

client = ApifyClient("YOUR_TOKEN")
run = client.actor("stefano_seggio/salta-compras-monitor").call(
    run_input={"onlyNew": True, "maxItems": 100}
)
for item in client.dataset(run["defaultDatasetId"]).iterate_items():
    print(item["record_id"], item["event_type"], item["organismo"])
```

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: 'YOUR_TOKEN' });
const run = await client.actor('stefano_seggio/salta-compras-monitor').call({ onlyNew: true, maxItems: 100 });
const { items } = await client.dataset(run.defaultDatasetId).listItems();
```

Wire new results straight into Slack, Zapier, Make, or your own endpoint
with Apify's native [dataset webhooks](https://docs.apify.com/platform/integrations/webhooks)
on this actor's runs - no custom webhook code lives inside the actor
itself.

**Important domain quirk:** this source's only date field,
`fechaApertura`/`horaApertura` (bid-opening deadline), is almost always in
the _future_ for the "vigentes" publications this actor covers - so
`dateRange` filters to publications _opening within_ the next 24h/7d/30d,
not "published in the last N" the way it would on a backward-dated source.
See Known limitations below and `AGENTS.md`.

## What you get

| Field                            | Description                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `record_id`                      | Publication id (the source's own id, reused as-is)                                                                                               |
| `event_type`                     | Always `"NEW_LISTING"` - this actor doesn't do field-level diffing/UPDATE detection (see Known limitations)                                      |
| `is_new`                         | `true` if `record_id` was not seen by a previous run (computed even when `onlyNew` is off)                                                       |
| `scraped_at`                     | ISO timestamp of this run's extraction (same for every record from one run)                                                                      |
| `source_url`                     | Link to the official detail page                                                                                                                 |
| `titulo`                         | Full header as shown on the portal, e.g. "Adjudicación Simple N° 98/2026"                                                                        |
| `tipoPublicacion`                | Type, e.g. "Adjudicación Simple", "Contratación Abreviada", "Licitación Pública"                                                                 |
| `numeroPublicacion`              | Number as published - free text, not a clean number/year pair (see Known limitations)                                                            |
| `fechaApertura` / `horaApertura` | Opening date and time                                                                                                                            |
| `objeto`                         | Subject / short description                                                                                                                      |
| `organismo`                      | Organismo Originante y Destino (buying organism)                                                                                                 |
| `expediente`                     | File number                                                                                                                                      |
| `consultaPliego`                 | Where to consult / buy the bid documents                                                                                                         |
| `consultas`                      | Contact info for questions                                                                                                                       |
| `detail.fields`                  | Full labeled detail from the detail page (organismo gestor, costo pliego, lugar de entrega, when present - the field set varies per publication) |
| `detail.pdfUrl`                  | Link to the portal's own auto-generated PDF of the publication                                                                                   |
| `detail.archivosAdjuntos`        | Uploaded attachments: `{nombre, url}`                                                                                                            |

## Input

| Field         | Type                         | Default  | Description                                                                                                       |
| ------------- | ---------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `fetchDetail` | boolean                      | `true`   | Fetch full detail per publication (one extra request each)                                                        |
| `maxItems`    | integer                      | `100`    | Hard cap on publications returned this run                                                                        |
| `onlyNew`     | boolean                      | `false`  | Delta mode: only return publications not seen by a previous run (see Delta mode above)                            |
| `dateRange`   | `"24h"` \| `"7d"` \| `"30d"` | _(none)_ | Filter to publications opening within the given window from now (see Delta mode above) - independent of `onlyNew` |

```json
{ "fetchDetail": true, "maxItems": 100 }
```

```json
{ "onlyNew": true, "dateRange": "7d", "maxItems": 100 }
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
    print(item["id"], item["organismo"], item["objeto"])
```

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: 'YOUR_TOKEN' });
const run = await client.actor('stefano_seggio/salta-compras-monitor').call({ maxItems: 100 });
const { items } = await client.dataset(run.defaultDatasetId).listItems();
```

## Known limitations

- No proxy needed - the source is reachable from a plain datacenter IP.
- Only currently-open ("vigentes") publications are covered - not the
  historical/closed archive, which lives behind a separate search form
  this actor doesn't drive. See `AGENTS.md`.
- The portal's own pagination can return the same publication on two
  adjacent pages once several records share an opening date/time; this
  actor de-duplicates by id, but a perfectly gap-free walk isn't
  guaranteed by the source itself. See `AGENTS.md`.
- `numeroPublicacion` is raw free text (e.g. `"155 2º LLAM"`,
  `"MED17029"`), not a structured number/year pair - real data doesn't
  support that structure consistently.
- `fetchDetail: true` adds one request per publication; disable it for a
  faster listing-only pass when full detail isn't needed.
- `onlyNew` fetches the full listing (up to `maxItems`) every run and
  filters afterward - it does not stop paginating early. This source's
  listing sorts by opening date, not by when a publication was created, so
  a genuinely new record can land on any page; an early-stop optimization
  would risk silently missing it. See `AGENTS.md`.
- `event_type` is always `"NEW_LISTING"` for every record this actor
  returns (new or not) - there is no field-level diffing/UPDATE detection
  in this pass (e.g. a re-opened tender with a changed `objeto` isn't
  flagged as changed). A natural v2 extension, not built here.
- `dateRange` filters on `fechaApertura`/`horaApertura`, the only date
  field this source exposes anywhere. For "vigentes" publications that
  date is a future bid-opening deadline, not a past publication date - so
  `dateRange` here means "opens within the next N", the inverse of what
  a backward-dated source's date field would mean. The comparison also
  doesn't adjust for Argentina's UTC-3 offset, which can shift a
  near-boundary record by a few hours.

Full technical detail is in `AGENTS.md`.
