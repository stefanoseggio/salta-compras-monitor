import { log } from 'apify';
import * as cheerio from 'cheerio';

import { fetchWithRetry } from './http.js';
import { parseDetail } from './parsers/detail.js';
import type { PublicacionDetail } from './types.js';

export async function fetchDetail(detailUrl: string): Promise<PublicacionDetail | null> {
    try {
        const response = await fetchWithRetry(detailUrl);
        const html = await response.text();
        const $ = cheerio.load(html);
        return parseDetail($);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warning(`Fallo el detalle de ${detailUrl} tras reintentos: ${message}`);
        return null;
    }
}
