# AGENTS.md - Salta Compras Monitor

Technical notes for whoever (human or AI) touches this actor next.

## What this actor does

Extracts public tenders and contract awards (contrataciones, adjudicaciones)
from the Province of Salta, Argentina's official procurement portal
(`compras.salta.gob.ar`), with organism, expediente and opening-date detail
per process, plus (optionally) the richer detail-page field set and
attached-document links.

## Architecture

Plain fetch + cheerio, no browser, no proxy - verified live 2026-09-04.
`compras.salta.gob.ar` is server-rendered PHP over Apache/2.4.18 (Ubuntu):
grepping the homepage, a paginated listing page and a detail page for
`ASPxGridView|dxgv|DevExpress|UpdatePanel|ScriptManager|__VIEWSTATE|react|
angular|vue|id="root"` returned zero matches anywhere. The one piece of
frontend JS present (`jquery.gridhandler.js` / `jquery.viaajax.js`) only
drives the filter form's UX - the actual tender data already arrives in the
initial server-rendered HTML.

- `src/fetchListing.ts` - walks `publico/publicacionactual/
  panelfiltrobusqueda/{offset}` in steps of 5 (the fixed page size) until a
  page returns zero `<article>` blocks, de-duplicating by publication id
  along the way (see "Pagination is not stable" below).
- `src/parsers/listing.ts` - parses each `<article class="publicacion">`
  card: a header (title + Fecha/Hora Apertura) and 5 body fields
  (`.publicacion-fila` label/value pairs) that were present, in that exact
  set, on every one of 15 sampled cards spanning 2021-2026 records.
- `src/fetchDetail.ts` + `src/parsers/detail.ts` - fetches and parses each
  publication's detail page (`publico/publicacionactual/verpublicacion1/
  {id}/0`), a richer superset of the listing fields plus attached
  documents.
- `src/http.ts` - shared fetch-with-retry helper, native `fetch()`, no
  proxy, exponential backoff for transient failures only.
- `src/main.ts` - lists, then (optionally, on by default) fetches full
  detail per publication, pushes + charges per item.

## What the original recon notes got right, and what they missed

Right: no proxy needed, plain server-rendered HTML with real structured
data in `article.publicacion` blocks (not placeholders), the detail
endpoint pattern, the pagination link pattern, and - critically - staying
off `saltacompra.gob.ar` (a different, sibling IIS/ASP.NET WebForms site
with `__VIEWSTATE` and a ScriptManager; this actor never touches it). The
inferred "PHP/CodeIgniter-style" stack from the clean URLs is plausible but
still unconfirmed by an explicit header - noted, not assumed further.

Missed / new findings from this session's live re-verification:

1. **Pagination is not stable across pages.** Comparing live responses for
   `panelfiltrobusqueda/0` and `panelfiltrobusqueda/5`, publication ids
   `148037` and `148030` appeared on **both** pages. The site has no
   deterministic secondary sort key once multiple records share the same
   `Fecha/Hora Apertura` (verified: several same-day/same-time records
   exist), so consecutive `LIMIT/OFFSET`-style page queries can return
   overlapping rows - and, symmetrically, could in principle skip a row
   during a live-changing walk. `fetchListing` de-duplicates by id
   (`seenIds` Set) to avoid pushing the same publication twice, which the
   local end-to-end run reproduced and confirmed live: `offset=5` reported
   "2 nuevas, 3 ya vistas" against `offset=0`. There is no fix available
   from this pagination mechanism alone for the (rarer, unverified) skip
   case - documented as a known limitation, not silently assumed away.
2. **The detail page's field set is not fixed.** `Organismo Gestor` and
   `Costo Pliego` are present on some publications and absent on others;
   `Consultas` is sometimes missing entirely (verified across 7 detail
   pages spanning 2021-2026: ids 148204, 148021, 148234, 148373, 37576,
   36236, 148187). `parseDetail` returns a generic `fields: Record<string,
   string>` bag for this reason, mirroring the same design decision made
   for `santafe-compras-monitor`'s detail page for the same underlying
   reason.
3. **The listing card's "Expte." and the detail page's "Expediente" are
   different labels for the same underlying field** - not a typo,
   confirmed on the same publication (148204) fetched both ways. Kept as
   distinct label strings inside `detail.fields` (not remapped) so the raw
   detail page's own vocabulary isn't silently normalized away.
4. **The publication number is not a clean `n/aaaa` pattern.** Real
   examples spanning 25+ sampled headers (offsets 0, 5, 10, 25, 75, 125,
   175, 200, 245): `"98/2026"`, `"155 2º LLAM"` (no year, has a
   "2nd-call" suffix), `"MED17029"` (no slash at all), `"A.S 185/26"`,
   `"5289/21"`, bare `"3"`. `parseListing` only splits on the literal
   `" N° "` separator (which IS consistent) into `tipoPublicacion` /
   `numeroPublicacion` - it does not attempt to further parse a
   number/year out of `numeroPublicacion`, because a stricter pattern
   would silently mangle or drop a large fraction of real records.
5. **At least one real data quirk was found and is passed through
   verbatim, not "fixed":** publication id `36236`'s own `Fecha/Hora
   Apertura` reads `13/08/2921` (year 2921, an evident source-side typo
   for 2021, consistent with the rest of that record's 2021 dates). This
   actor does not attempt to detect or correct such typos - that would
   require guessing the source's intent, which is out of scope for a
   scraper. See `test/fixtures/detail_36236.html`.
6. **Confirmed via a real Node `fetch()` (not just curl) with no
   User-Agent spoofing and no proxy:** `Content-Type: text/html;
   charset=UTF-8` on every page checked (home, listing at multiple
   offsets, detail pages from 2021 and 2026), and accented characters
   (`Señor`, `Adquisición`, em/en dashes) round-trip correctly through
   `Response.text()`. No `ArrayBuffer` + `TextDecoder` detour is needed
   here - unlike a target that serves ISO-8859-1.
7. **A page past the real data range returns HTTP 200 with zero
   `<article>` blocks**, not an error or a redirect (verified:
   `panelfiltrobusqueda/255`, one page past the confirmed real last page at
   offset 250, out of 51 total pages / ~251 open publications on the audit
   date). This is used as `fetchListing`'s natural stop condition instead
   of trusting the pagination widget's own page-count links.

## Known scope limits (disclosed, not hidden)

- Only the default "vigentes" (currently open) publications are covered -
  the homepage's hidden `publicacionVigenciaInput=1` field and a
  `#buscar-publicaciones-antiguas` JS handler suggest a historical/closed
  archive view also exists, reachable through the `frmfiltrobusqueda`
  search form. This actor does not drive that form (POST search by
  keyword/organism/expediente/date range) - v1's scope is "list and detail
  the currently open publications", matching the actor's title and
  description; a keyword/archive search is a natural v2 extension, not
  built here.
- As documented above, the site's own pagination cannot be proven
  gap-free during a live-changing multi-page walk (only proven to
  reliably de-duplicate against the overlap that was actually observed).
- `fetchDetail: true` (default) adds one extra HTTP request per
  publication. For `maxItems` near the full ~250-publication backlog, that
  is roughly 50 extra requests - `fetchDetail: false` gives a
  listing-only fast path when the extra detail isn't needed.
- `numeroPublicacion` is a raw, free-text tail (see finding 4 above) - not
  a structured number/year pair. Don't build downstream logic that assumes
  it parses as one.

## Sibling candidates (from the earlier parallel audit, per santafe-compras-monitor's AGENTS.md)

Tucuman and Entre Rios also came back `viable` from the same 6-province
live audit that first found this target (2026-09-04). Re-verify live
before building the next one rather than trusting old notes - this
session alone found 7 concrete facts (above) that the prior recon pass on
this exact target had gotten right in outline but missed or oversimplified
in the details.
