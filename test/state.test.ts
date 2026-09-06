import { describe, expect, it } from 'vitest';

import type { DeltaState, DeltaStateStore } from '../src/state.js';
import { loadDeltaState, saveDeltaState } from '../src/state.js';

function fakeStore(initial?: DeltaState): DeltaStateStore {
    let value: DeltaState | null = initial ?? null;
    return {
        async getValue<T>() {
            return value as T | null;
        },
        async setValue<T>(_key: string, v: T | null) {
            value = v as unknown as DeltaState | null;
        },
    };
}

describe('loadDeltaState', () => {
    it('returns an empty state when nothing was ever persisted', async () => {
        const state = await loadDeltaState(fakeStore());
        expect(state).toEqual({ seenIds: [], lastRunAt: null });
    });

    it('returns the persisted state unchanged when present', async () => {
        const store = fakeStore({ seenIds: ['3', '2', '1'], lastRunAt: '2026-09-05T00:00:00.000Z' });
        const state = await loadDeltaState(store);
        expect(state).toEqual({ seenIds: ['3', '2', '1'], lastRunAt: '2026-09-05T00:00:00.000Z' });
    });
});

describe('saveDeltaState', () => {
    it('merges newly observed ids with the previously persisted ones, de-duplicated', async () => {
        const store = fakeStore();
        const next = await saveDeltaState(['100', '200'], ['200', '300'], '2026-09-06T00:00:00.000Z', store);

        expect(new Set(next.seenIds)).toEqual(new Set(['100', '200', '300']));
        expect(next.lastRunAt).toBe('2026-09-06T00:00:00.000Z');

        const reloaded = await loadDeltaState(store);
        expect(reloaded).toEqual(next);
    });

    it('caps the stored set, keeping the highest (most recently created) numeric ids', async () => {
        const store = fakeStore();
        const manyIds = Array.from({ length: 5010 }, (_, i) => String(i + 1)); // 1..5010

        const next = await saveDeltaState([], manyIds, '2026-09-06T00:00:00.000Z', store);

        expect(next.seenIds).toHaveLength(5000);
        expect(next.seenIds).toContain('5010'); // highest survives
        expect(next.seenIds).not.toContain('1'); // lowest is trimmed
    });
});
