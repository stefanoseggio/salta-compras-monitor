# Changelog

## [3.0.0](https://github.com/stefanoseggio/salta-compras-monitor/compare/salta-compras-monitor-v2.0.0...salta-compras-monitor-v3.0.0) (2026-09-19)


### ⚠ BREAKING CHANGES

* v2.0 delta engine - UPDATED/CLOSED via content fingerprint + complete-walk absence

### Features

* retrofit Delta Engine (onlyNew delta mode + dateRange + envelope) ([22fed9d](https://github.com/stefanoseggio/salta-compras-monitor/commit/22fed9d1073b9158d9dd783b46b0adc253ad459e))
* Salta Compras Monitor - listing + detail scraper for compras.salta.gob.ar ([a1ef2bc](https://github.com/stefanoseggio/salta-compras-monitor/commit/a1ef2bcb64470cd25cd7cef4e2335a7eb1f31a17))
* v2.0 delta engine - UPDATED/CLOSED via content fingerprint + complete-walk absence ([7b4c8c4](https://github.com/stefanoseggio/salta-compras-monitor/commit/7b4c8c4e979b0cf13913751e645e1829bc2b9a6a))


### Bug Fixes

* **ci:** pass RELEASE_PLEASE_TOKEN so release PRs skip the bot-approval gate ([9209567](https://github.com/stefanoseggio/salta-compras-monitor/commit/9209567e9df98b5766de0c7c4335d6c3eb896529))
* distrust a mid-walk empty page that arrives before the site's own reported last page ([#10](https://github.com/stefanoseggio/salta-compras-monitor/issues/10)) ([a7d5c68](https://github.com/stefanoseggio/salta-compras-monitor/commit/a7d5c68975f8e1bff31998ee7200b41483952bd0))
* guard mass CLOSED detection against a suspect empty listing walk ([#8](https://github.com/stefanoseggio/salta-compras-monitor/issues/8)) ([1a62e73](https://github.com/stefanoseggio/salta-compras-monitor/commit/1a62e7397ae64ae24dc6cdda6aa579cc71b44517))
* **http:** add per-attempt timeout, narrow retries to transient statuses ([#9](https://github.com/stefanoseggio/salta-compras-monitor/issues/9)) ([de1f53d](https://github.com/stefanoseggio/salta-compras-monitor/commit/de1f53d87e91554875422501fefc9cb7109006ef))
* wrap run() in try/catch with Actor.fail()/LAST_ERROR convention ([#11](https://github.com/stefanoseggio/salta-compras-monitor/issues/11)) ([ba9e3d1](https://github.com/stefanoseggio/salta-compras-monitor/commit/ba9e3d1d42a74385540858cedb54c957cfa85e6a))

## 2.0.0 - 2026-09-08

The v2 delta engine: amendment and closure detection, replacing the v1 retrofit's "always NEW_LISTING" limitation - see AGENTS.md "Delta engine v2" for the full technical reasoning.

### Added

- **`UPDATED` events**: a publication whose content changed (monto, document, date, any other field) is detected via a sha1 content fingerprint (`contentHash`) and reported as `UPDATED`.
- **`CLOSED` events**: a publication that leaves the vigentes list (closed, resolved, expired or withdrawn - the source does not say which) is now detected and reported, instead of silently disappearing. Only computed against a COMPLETE walk (`maxItems` not truncating it) - see AGENTS.md for why a partial walk cannot prove absence.
- **`eventTypes` input**: narrows delta-mode delivery to a subset of `NEW_LISTING`/`UPDATED`/`CLOSED`.
- `contentHash` output field; a second dataset view ("Status changes & amendments").
- Apache-2.0 `LICENSE`, this `CHANGELOG.md`, an `npx eslint .` step in CI.

### Changed

- **Delta state shape**: `src/state.ts` replaced the v1 bare `seenIds: string[]` with `entries: Record<id, {hash, titulo, tipoPublicacion, numeroPublicacion, organismo}>` - needed both for UPDATED's fingerprint comparison and to name a CLOSED record without a live fetch. **Not backward compatible**: a v1-shaped state is treated as absent, not migrated - an existing scheduled task's next run re-baselines.
- **Real cost tradeoff**: `fetchDetail: true` now re-fetches the detail page of every walked item (new AND previously-seen), not only the ones that end up delivered - detecting UPDATED requires re-reading a known publication's detail page. This increases request volume for `onlyNew: true` monitoring runs specifically versus v1. `fetchDetail: false` remains a cheap listing-only path unaffected by this.
- Pricing: two-tier PPE (`result` $0.003 fresh-detail / `result-summary` $0.001 listing-only or CLOSED), replacing the v1 flat single-tier price.

### Fixed

- A double-charge bug caught during this pass, before shipping: `Actor.pushData(record, eventName)` performs the PPE charge itself (verified against the installed SDK's `.d.ts`) - an earlier draft also called `Actor.charge(...)` separately, which would have charged every delivered record twice.
- Production `start` script pointed at `start:dev` (`tsx`), which Apify's production image cannot run (`npm install --only=prod` strips `tsx`). Switched to the prebuilt `dist/main.js` and stopped gitignoring `dist/` so the build actually ships.
