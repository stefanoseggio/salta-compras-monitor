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

## Delta Engine retrofit (2026-09-06)

Added `onlyNew` (delta mode) and `dateRange` input, plus a standardized
output envelope (`record_id`, `event_type`, `scraped_at`, `is_new`,
`source_url`), matching the contract already shipped and cloud-verified on
the fleet's UK HSE Enforcement Monitor actor. New/changed files:
`src/state.ts` (new), `src/delta.ts` (new), `src/types.ts`, `src/main.ts`,
`.actor/input_schema.json`, `.actor/dataset_schema.json`, `README.md`,
`test/delta.test.ts` (new), `test/state.test.ts` (new).

### Safe post-filter, not early-stop - and why this is a stronger case than HSE's

The spec's default is page-level early-stop (stop paginating after 2
consecutive all-seen pages) IF AND ONLY IF the listing is genuinely,
reliably sorted newest-first. It is not, and this was checked live, not
assumed:

1. **The existing `fetchListing`/AGENTS.md pagination-overlap finding
   already hinted at instability** before this session touched anything:
   ids `148037`/`148030` appearing on both `offset=0` and `offset=5`, with
   the existing code's own `seenIds` Set dedup as the fix. That alone was
   grounds for suspicion per the spec's own trigger list ("your actor
   already has stall-guard/dedup logic hinting at unstable ordering").
2. **Live re-verification 2026-09-06 found something more fundamental than
   overlap: the listing isn't ordered by creation/recency at all - it's
   ordered by `Fecha/Hora Apertura` (the bid-opening deadline), which for
   `vigentes` (currently open) publications points into the future, often
   _years_ into the future.** Fetched `panelfiltrobusqueda/0` and
   `panelfiltrobusqueda/245` (near the last real page) live:
    - `offset=0`: ids `148021, 148030, 148037, 148204, 148437`, all opening
      `06-07/09/2026` (i.e. this week).
    - `offset=245`: ids `104790, 133599, 133600, 133799, 145967`, opening
      `23/07/2027` through `03/12/2028` - **lower ids than every id on
      page 0**, sitting near the _end_ of the pagination purely because
      their opening date happens to fall later.

    A publication with a low id (i.e., registered in the system a long
    time ago) can sit on the last page of a walk simply because its bid
    opens far in the future; conversely a brand-new id can appear on page 0
    because its opening date is imminent. Page-level early-stop ("stop once
    N consecutive pages are all-seen") would therefore risk silently
    skipping a genuinely new publication whose opening date happens to sort
    it deep into the list - the opposite failure mode from HSE's, but the
    same conclusion. `onlyNew` is implemented as a safe post-filter:
    `fetchListing` always walks the full result up to `maxItems` exactly as
    it did before this retrofit (untouched), and `src/delta.ts`'s
    `selectRecordsToProcess` filters the in-memory result afterward. No
    pagination code was changed.

### record_id / event_type choices

- `record_id`: the source's own publication id (`ListingItem.id`), reused
  verbatim as a string - it's already the natural unique key the existing
  dedup logic uses.
- `event_type`: always `"NEW_LISTING"`. Considered mirroring HSE's
  convictions/notices split (`"SANCTION"` vs `"NEW_LISTING"`) using
  `tipoPublicacion` (Licitación Pública / Contratación Abreviada /
  Adjudicación Simple / ...) as the discriminator, but rejected it: HSE's
  split was between two genuinely separate sub-datasets fetched from
  different endpoints with different schemas; here all publication types
  come from the one `panelfiltrobusqueda` listing, share one schema, and
  an "Adjudicación Simple" appearing in the _currently open_ (`vigentes`)
  feed is not equivalent to a legal enforcement outcome the way a
  conviction record is - it's still an open, unresolved listing a bidder
  can act on. Speculating a taxonomy onto `tipoPublicacion` values that
  aren't semantically an "award" the way a closed conviction record is
  would be exactly the kind of unjustified signal the spec warns against.
  `"NEW_LISTING"` for everything is the honest default.

### Output envelope: field replacement, not addition

`id` -> `record_id` and `detailUrl` -> `source_url` are renames, not
additions - `PublicacionRecord` no longer carries `id`/`detailUrl` at all
(see the comment on the type). `scrapedAt` -> `scraped_at` is the same
rename with the standardized casing; it is now computed **once** per run
(`main.ts`, before the per-item loop) rather than once per `pushData` call
as the pre-retrofit code did (`new Date().toISOString()` inside the
`for` loop) - a real, if minor, correctness gap the spec's "same value for
every record from one run" requirement caught: on a long detail-fetching
run the old code could emit a handful of distinct millisecond-precision
timestamps across one run's records.

### State persistence

`src/state.ts` opens a **named** key-value store,
`salta-compras-monitor-delta-state` (not the run's own default store,
which is per-run and would vanish between scheduled runs), holding
`{ seenIds: string[], lastRunAt: string | null }`. No sub-dataset split is
needed (unlike HSE's convictions/notices) - this actor has one listing,
one dataset schema, one flat seen-set.

Capped at 5000 ids, kept by **descending numeric id value**, not by fetch
order. The generic "newest ids first, since the source is newest-first"
guidance from the spec doesn't transfer literally here, because - as
established above - this source's _fetch/listing_ order is not
newest-first. What plausibly does track creation order is the numeric id
itself (it reads as a plain auto-increment primary key: compare the
`104790`-`145967` range attached to 2027-2028 openings against the
`148021`-`148437` range attached to this week's openings - lower numbers
skew toward older registrations independent of their opening date).
Sorting the merged seen-set by `Number(id)` descending before capping is
therefore the closer match to "keep the ones a future run is most likely
to need to recognize" than preserving arbitrary fetch order would be. This
is a documented deviation, not an oversight.

Every id `fetchListing` returns this run (not just the ones that pass
`onlyNew`/`dateRange`) is merged into the persisted set before capping -
a record filtered out today by `dateRange` must still be recognized as
"seen" by a future `onlyNew` run, or it would incorrectly resurface.

### dateRange: the domain's date field points the wrong way for the spec's default framing

Grepped every `.publicacion-fila-titulo` label present in both the
listing card and the detail page (see the code comment in
`src/delta.ts`): the _only_ date field anywhere is `Fecha/Hora Apertura`,
the bid-opening deadline. There is no separate "Fecha de Publicación".
For HSE, `dateRange` on a backward-dated field ("Offence Date") means
"in the last N". Live-checked here 2026-09-06 across `offset=0` and
`offset=245` (10 sampled dates total): every single one was `>=` today,
ranging out to December 2028 - the _vigentes_ feed is, structurally,
always describing upcoming deadlines, not past events. Implementing
`dateRange` as "in the last N" against this field would return
approximately nothing, silently, forever - a materially misleading
filter. Implemented instead as "opens within the next N" and disclosed
plainly in the README's Delta mode section and Known limitations, per the
spec's explicit instruction to disclose rather than silently ship a
misleading filter (it names HSE's Offence Date lag as the template for
this kind of disclosure - this is the same category of finding, just a
sign-flip instead of a lag).

Comparison parses `DD/MM/YYYY`/`HH:MM` as printed, treated as UTC, with no
Argentina UTC-3 adjustment - acceptable at day-level 24h/7d/30d
granularity, disclosed as a known limitation rather than silently ignored.
A record whose date fails to parse is excluded from a `dateRange`-filtered
run rather than guessed into or out of the window.

### A real gotcha hit while doing this

`node --experimental-strip-types` (Node >=22) can run this repo's `.ts`
files directly without `tsx`, which was useful for a couple of quick
one-off live-data inspections while building `src/delta.ts` (checking the
real `horaApertura` values in `test/fixtures/listing_offset0.html` to
pick dateRange test boundaries that actually straddle real data rather
than being pulled from thin air). Not wired into any script - just a
faster manual REPL substitute than round-tripping through `tsx` or
`node --loader`.

A second, more consequential one: `npm run format` (`prettier --write .`)
had never actually been run against this repo's own `package.json`,
`package-lock.json`, `src/fetchListing.ts`, `test/parsers/detail.test.ts`,
or (more importantly) the live-captured HTML fixtures under
`test/fixtures/` - none of them matched the checked-in `.prettierrc`
(`tabWidth: 4`), and CI (`.github/workflows/test.yaml`) only runs
`build`+`test`, never `lint`/`format:check`, so this had gone unnoticed.
Running `format` for real reformatted all of them. For the first four,
that's a harmless whitespace-only diff (verified with `git diff -b`) and
was kept. For the fixtures it is not harmless in the same way: prettier
rewrites real HTML structure (self-closing tags, attribute wrapping,
`<!doctype html>` casing). That doesn't break `cheerio` parsing (every
pre-existing test still passed against the reformatted fixtures), but it
does mean the fixture stops being the exact byte-for-byte live capture
the code comments cite as "verified live" evidence - a fixture's entire
value is being an honest, unmodified capture. Reverted the fixture
reformatting and added `test/fixtures` to `.prettierignore` so a future
`format` run can't silently do this again.

## Sibling candidates (from the earlier parallel audit, per santafe-compras-monitor's AGENTS.md)

Tucuman and Entre Rios also came back `viable` from the same 6-province
live audit that first found this target (2026-09-04). Re-verify live
before building the next one rather than trusting old notes - this
session alone found 7 concrete facts (above) that the prior recon pass on
this exact target had gotten right in outline but missed or oversimplified
in the details.
