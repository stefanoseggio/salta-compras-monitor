# Changelog

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
