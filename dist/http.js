async function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
// Native fetch(), no proxy needed - verified live 2026-09-04: reachable
// from a plain datacenter IP (curl and Node fetch() both got 200 OK with
// no User-Agent spoofing). Server sends `Content-Type: text/html;
// charset=UTF-8` on every page checked (home, listing, detail, both 2026
// and 2021 records) and accented characters (Señor, Adquisición) round-trip
// correctly through Response.text() - no ArrayBuffer/TextDecoder detour
// needed here, unlike a target that serves ISO-8859-1.
export async function fetchWithRetry(url, maxRetries = 4, baseDelayMs = 1000) {
    let lastError = new Error('unreachable');
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, { redirect: 'follow' });
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);
            return response;
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt < maxRetries) {
                await sleep(baseDelayMs * 2 ** attempt);
            }
        }
    }
    throw lastError;
}
//# sourceMappingURL=http.js.map