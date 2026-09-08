import type { ListingItem } from './types.js';
export interface ListingResult {
    items: ListingItem[];
    /**
     * True when maxItems cut the walk short (the loop stopped because the cap was reached,
     * not because the site ran out of pages). False means this walk reached a genuine
     * zero-<article> page - i.e. it is a complete census of every currently-vigente
     * publication, not a partial one. Used by src/main.ts to decide whether it is safe to
     * infer "no longer vigente" (CLOSED) for a previously-seen id absent from this walk - see
     * AGENTS.md "Delta engine v2": that inference is only trustworthy against a complete walk.
     */
    truncatedByMaxItems: boolean;
}
export declare function fetchListing(maxItems: number): Promise<ListingResult>;
//# sourceMappingURL=fetchListing.d.ts.map