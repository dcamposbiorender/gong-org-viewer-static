"""Fetch entity merges from Vercel KV API for pipeline use."""
import os
import re
import requests


def fetch_merges(company: str) -> dict:
    """Fetch merges from /api/merges for a company.

    Returns dict: { canonicalId: { absorbed: [], aliases: [], ... } }
    """
    base_url = os.environ.get('VIEWER_BASE_URL', 'http://localhost:3000')
    bypass_secret = os.environ.get('VERCEL_AUTOMATION_BYPASS_SECRET', '')

    url = f"{base_url}/api/merges?account={company.lower()}"
    headers = {}
    if bypass_secret:
        headers['x-vercel-protection-bypass'] = bypass_secret

    response = requests.get(url, headers=headers, timeout=10)
    response.raise_for_status()
    return response.json()


def build_alias_lookup(merges: dict) -> dict:
    """Build normalized alias -> (canonical_id, canonical_name) lookup."""
    lookup = {}
    for canonical_id, merge in merges.items():
        for alias in merge.get('aliases', []):
            normalized = normalize_entity_name(alias)
            if normalized:  # Skip empty normalized names
                lookup[normalized] = {
                    'canonical_id': canonical_id,
                    'alias': alias
                }
    return lookup


def normalize_entity_name(name: str) -> str:
    """Normalize entity name for alias matching.

    Rules: lowercase, strip common suffixes (END OF STRING ONLY),
    strip punctuation, collapse whitespace.
    MUST match the JS normalizeEntityName() in index.html.
    """
    name = name.lower().strip()
    # Strip punctuation first so "Inc." becomes "Inc" before suffix removal
    name = re.sub(r'[.,;:!?]', '', name)
    # Only strip suffixes at end of string (not "Group Therapeutics")
    name = re.sub(r'\b(group|inc|ltd|llc|corp|corporation|limited)\s*$', '', name)
    name = re.sub(r'\s+', ' ', name)
    return name.strip()
