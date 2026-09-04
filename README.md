# Salta Compras Monitor

Extracts **public tenders and contract awards** (contrataciones,
adjudicaciones) from the Province of Salta, Argentina's official public
procurement portal (`compras.salta.gob.ar`) - server-rendered HTML, no
browser needed, with full detail per publication on request: organism,
expediente, opening date/time, and direct links to attached documents
(pliego, cotizacion, etc).

## What you get

| Field | Description |
|---|---|
| `id` | Publication id |
| `titulo` | Full header as shown on the portal, e.g. "Adjudicación Simple N° 98/2026" |
| `tipoPublicacion` | Type, e.g. "Adjudicación Simple", "Contratación Abreviada", "Licitación Pública" |
| `numeroPublicacion` | Number as published - free text, not a clean number/year pair (see Known limitations) |
| `fechaApertura` / `horaApertura` | Opening date and time |
| `objeto` | Subject / short description |
| `organismo` | Organismo Originante y Destino (buying organism) |
| `expediente` | File number |
| `consultaPliego` | Where to consult / buy the bid documents |
| `consultas` | Contact info for questions |
| `detailUrl` | Link to the official detail page |
| `detail.fields` | Full labeled detail from the detail page (organismo gestor, costo pliego, lugar de entrega, when present - the field set varies per publication) |
| `detail.pdfUrl` | Link to the portal's own auto-generated PDF of the publication |
| `detail.archivosAdjuntos` | Uploaded attachments: `{nombre, url}` |
| `scrapedAt` | ISO timestamp of extraction |

## Input

| Field | Type | Default | Description |
|---|---|---|---|
| `fetchDetail` | boolean | `true` | Fetch full detail per publication (one extra request each) |
| `maxItems` | integer | `100` | Hard cap on publications returned this run |

```json
{ "fetchDetail": true, "maxItems": 100 }
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

Full technical detail is in `AGENTS.md`.
