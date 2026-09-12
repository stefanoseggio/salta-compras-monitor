"""run_monitor.py
Runs the Salta Compras Monitor actor (Tx9wBKZyySZa5WcsE) and prints new/changed tender publications.
"""
import os
from apify_client import ApifyClient

# Authenticate from an env var: export APIFY_TOKEN=apify_api_xxx (from `apify auth token` or the Console)
client = ApifyClient(os.environ["APIFY_TOKEN"])

# Delta-mode input matching the actor's real input schema
run_input = {
    "fetchDetail": True,
    "maxItems": 100,
    "onlyNew": True,
    "eventTypes": ["NEW_LISTING", "UPDATED", "CLOSED"],
    "dateRange": "7d",
}

print("Starting Salta Compras Monitor run...")
run = client.actor("Tx9wBKZyySZa5WcsE").call(run_input=run_input)
print(f"Run finished with status: {run['status']}")

# Pull the resulting dataset items
dataset_items = client.dataset(run["defaultDatasetId"]).list_items().items
print(f"Fetched {len(dataset_items)} publication(s):")

for item in dataset_items:
    print(f"- [{item['event_type']}] {item['tipoPublicacion']} - {item['organismo']}")
    print(f"  Opens: {item['fechaApertura']} {item['horaApertura']} | {item['source_url']}")
