import { Impit, type ImpitResponse } from 'impit';

// One Impit instance per actor run: it holds the connection pool and TLS
// session cache, and gives every request a real, internally-consistent
// Chrome TLS/HTTP2 fingerprint instead of Node's native (and distinctively
// bot-shaped) one - see AGENTS.md for why this was added.
const impit = new Impit({ browser: 'chrome' });

export class HttpError extends Error {
    constructor(
        public readonly status: number,
        public readonly url: string,
    ) {
        super(`HTTP ${status} for ${url}`);
        this.name = 'HttpError';
    }
}

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function isRetriableStatus(status: number): boolean {
    return status === 408 || status === 425 || status === 429 || status >= 500;
}

// No proxy needed - verified live 2026-09-04: reachable from a plain
// datacenter IP (curl and Node fetch() both got 200 OK with no User-Agent
// spoofing). Server sends `Content-Type: text/html; charset=UTF-8` on every
// page checked (home, listing, detail, both 2026 and 2021 records) and
// accented characters (Señor, Adquisición) round-trip correctly through
// response.text() - no ArrayBuffer/TextDecoder detour needed here, unlike a
// target that serves ISO-8859-1.
//
// Each attempt carries its own AbortSignal.timeout so a stalled connection
// can't hang the run indefinitely, and retries are limited to 408/425/429,
// 5xx and network/timeout errors - other 4xx (400, 401, 403, 404, ...) are
// deterministic and are thrown immediately instead of being retried away.
export async function fetchWithRetry(
    url: string,
    maxRetries = 4,
    baseDelayMs = 1000,
    timeoutMs = 45_000,
): Promise<ImpitResponse> {
    let lastError: Error = new Error('unreachable');
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await impit.fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
            if (response.ok) return response;
            if (!isRetriableStatus(response.status)) throw new HttpError(response.status, url);
            lastError = new HttpError(response.status, url);
        } catch (error) {
            if (error instanceof HttpError && !isRetriableStatus(error.status)) throw error;
            lastError = error instanceof Error ? error : new Error(String(error));
        }
        if (attempt < maxRetries) {
            await sleep(baseDelayMs * 2 ** attempt);
        }
    }
    throw lastError;
}
