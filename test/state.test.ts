import { describe, expect, it } from 'vitest';

import type { DeltaState, DeltaStateStore, SeenEntry } from '../src/state.js';
import { loadDeltaState, saveDeltaState } from '../src/state.js';

function fakeStore(initial?: unknown): DeltaStateStore {
    let value: unknown = initial ?? null;
    return {
        async getValue<T>() {
            return value as T | null;
        },
        async setValue<T>(_key: string, v: T | null) {
            value = v;
        },
    };
}

function entry(hash: string): SeenEntry {
    return { hash, titulo: 't', tipoPublicacion: 'tp', numeroPublicacion: 'np', organismo: 'org' };
}

const EMPTY_STATE: DeltaState = { entries: {}, lastRunAt: null };

describe('loadDeltaState', () => {
    it('returns an empty state when nothing was ever persisted', async () => {
        const state = await loadDeltaState(fakeStore());
        expect(state).toEqual(EMPTY_STATE);
    });

    it('returns the persisted state unchanged when present', async () => {
        const saved: DeltaState = { entries: { '3': entry('h3'), '1': entry('h1') }, lastRunAt: '2026-09-05T00:00:00.000Z' };
        const store = fakeStore(saved);
        const state = await loadDeltaState(store);
        expect(state).toEqual(saved);
    });

    it('treats a v1-shaped state ({ seenIds: [...] }) as absent rather than crashing', async () => {
        const store = fakeStore({ seenIds: ['3', '2', '1'], lastRunAt: 'x' });
        const state = await loadDeltaState(store);
        expect(state).toEqual(EMPTY_STATE);
    });
});

describe('saveDeltaState', () => {
    it('merges newly observed entries with the previously persisted ones, overwriting by id', async () => {
        const store = fakeStore();
        const previous: DeltaState = { entries: { '100': entry('old-100'), '200': entry('old-200') }, lastRunAt: null };

        const next = await saveDeltaState(previous, [{ id: '200', entry: entry('new-200') }, { id: '300', entry: entry('new-300') }], '2026-09-06T00:00:00.000Z', store);

        expect(Object.keys(next.entries).sort()).toEqual(['100', '200', '300']);
        expect(next.entries['200']).toEqual(entry('new-200')); // observed overwrites the stale entry
        expect(next.lastRunAt).toBe('2026-09-06T00:00:00.000Z');

        const reloaded = await loadDeltaState(store);
        expect(reloaded).toEqual(next);
    });

    it('caps the stored set, keeping the highest (most recently created) numeric ids', async () => {
        const store = fakeStore();
        const manyObserved = Array.from({ length: 5010 }, (_, i) => ({ id: String(i + 1), entry: entry('h') })); // 1..5010

        const next = await saveDeltaState(EMPTY_STATE, manyObserved, '2026-09-06T00:00:00.000Z', store);

        expect(Object.keys(next.entries)).toHaveLength(5000);
        expect(next.entries).toHaveProperty('5010'); // highest survives
        expect(next.entries).not.toHaveProperty('1'); // lowest is trimmed
    });
});
