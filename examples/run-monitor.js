// run-monitor.js
// Runs the Salta Compras Monitor actor (Tx9wBKZyySZa5WcsE) and logs new/changed tender publications.
const { ApifyClient } = require('apify-client');

// Authenticate from an env var: export APIFY_TOKEN=apify_api_xxx (from `apify auth token` or the Console)
const client = new ApifyClient({
    token: process.env.APIFY_TOKEN,
});

async function main() {
    // Delta-mode input matching the actor's real input schema
    const input = {
        fetchDetail: true,
        maxItems: 100,
        onlyNew: true,
        eventTypes: ['NEW_LISTING', 'UPDATED', 'CLOSED'],
        dateRange: '7d',
    };

    console.log('Starting Salta Compras Monitor run...');
    const run = await client.actor('Tx9wBKZyySZa5WcsE').call(input);
    console.log(`Run finished with status: ${run.status}`);

    // Pull the resulting dataset items
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    console.log(`Fetched ${items.length} publication(s):`);

    for (const item of items) {
        console.log(`- [${item.event_type}] ${item.tipoPublicacion} - ${item.organismo}`);
        console.log(`  Opens: ${item.fechaApertura} ${item.horaApertura} | ${item.source_url}`);
    }
}

main().catch((err) => {
    console.error('Run failed:', err);
    process.exit(1);
});
