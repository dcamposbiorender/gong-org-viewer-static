#!/usr/bin/env python3
"""
E2E Test Cleanup: Remove all __test_ prefixed items and verify KV state matches snapshot.

Usage:
    python3 tests/e2e_cleanup.py                # Clean + verify
    python3 tests/e2e_cleanup.py --verify-only  # Just verify snapshots match
"""

import json
import os
import sys
import argparse
from pathlib import Path

# Load bypass secret
ENV_PATH = Path(__file__).parent.parent.parent.parent / ".env.shared"
SNAP_DIR = Path(__file__).parent / "e2e-snapshots"
BASE_URL = "https://gong-org-viewer-static.vercel.app/api"

COMPANIES = ["abbvie", "astrazeneca", "gsk", "lilly", "novartis", "regeneron", "roche"]
ENDPOINTS = ["corrections", "field-edits", "match-review", "merges", "graduated-map",
             "sizes", "resolutions", "autosave", "sync-version"]


def load_env():
    """Load GONG_VIEWER_BYPASS_SECRET from .env.shared."""
    secret = os.environ.get("GONG_VIEWER_BYPASS_SECRET")
    if secret:
        return secret

    if ENV_PATH.exists():
        for line in ENV_PATH.read_text().splitlines():
            if line.startswith("GONG_VIEWER_BYPASS_SECRET="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")

    print("ERROR: GONG_VIEWER_BYPASS_SECRET not found")
    sys.exit(1)


def api_get(endpoint, account, secret):
    """GET from KV API."""
    import urllib.request
    url = f"{BASE_URL}/{endpoint}?account={account}"
    req = urllib.request.Request(url, headers={
        "x-vercel-protection-bypass": secret
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"  GET {endpoint}?account={account} failed: {e}")
        return None


def api_delete(endpoint, account, secret, body):
    """DELETE from KV API."""
    import urllib.request
    url = f"{BASE_URL}/{endpoint}?account={account}"
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="DELETE", headers={
        "Content-Type": "application/json",
        "x-vercel-protection-bypass": secret
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status
    except Exception as e:
        print(f"  DELETE {endpoint}?account={account} failed: {e}")
        return None


def clean_test_data(secret):
    """Remove all __test_ prefixed items from each endpoint."""
    print("Cleaning __test_ prefixed data...")
    cleaned = 0

    for account in COMPANIES:
        # Clean match review __test_ items
        state = api_get("match-review", account, secret)
        if state and isinstance(state, dict):
            for category in ["approved", "rejected", "manual"]:
                items = state.get(category, {})
                if isinstance(items, dict):
                    for item_id in list(items.keys()):
                        if item_id.startswith("__test_"):
                            api_delete("match-review", account, secret, {"itemId": item_id})
                            cleaned += 1
                            print(f"  Deleted match-review/{account}/{category}/{item_id}")

        # Clean merges __test_ items
        merges = api_get("merges", account, secret)
        if merges and isinstance(merges, dict):
            for key in list(merges.keys()):
                if key.startswith("__test_"):
                    api_delete("merges", account, secret, {"canonicalId": key})
                    cleaned += 1
                    print(f"  Deleted merges/{account}/{key}")

        # Clean corrections __test_ items
        corrections = api_get("corrections", account, secret)
        if corrections and isinstance(corrections, dict):
            for key in list(corrections.keys()):
                if key.startswith("__test_"):
                    api_delete("corrections", account, secret, {"entityId": key})
                    cleaned += 1
                    print(f"  Deleted corrections/{account}/{key}")

        # Clean field-edits __test_ items
        edits = api_get("field-edits", account, secret)
        if edits and isinstance(edits, dict):
            for key in list(edits.keys()):
                if key.startswith("__test_"):
                    api_delete("field-edits", account, secret, {"entityId": key})
                    cleaned += 1
                    print(f"  Deleted field-edits/{account}/{key}")

        # Clean sizes __test_ items
        sizes = api_get("sizes", account, secret)
        if sizes and isinstance(sizes, dict):
            for key in list(sizes.keys()):
                if key.startswith("__test_"):
                    api_delete("sizes", account, secret, {"key": key})
                    cleaned += 1
                    print(f"  Deleted sizes/{account}/{key}")

    print(f"\nCleaned {cleaned} __test_ items")
    return cleaned


def verify_snapshots(secret):
    """Verify current KV state matches pre-test snapshots."""
    print("\nVerifying KV state matches snapshots...")
    mismatches = []

    for account in COMPANIES:
        for endpoint in ENDPOINTS:
            snap_path = SNAP_DIR / f"{account}_{endpoint}.json"
            if not snap_path.exists():
                print(f"  SKIP: No snapshot for {account}/{endpoint}")
                continue

            snapshot = json.loads(snap_path.read_text())
            current = api_get(endpoint, account, secret)

            if current is None:
                mismatches.append(f"{account}/{endpoint}: API returned None")
                continue

            # Skip sync-version (changes on every write)
            if endpoint == "sync-version":
                continue

            # Skip autosave (changes frequently)
            if endpoint == "autosave":
                continue

            if current != snapshot:
                mismatches.append(f"{account}/{endpoint}: KV drift detected")
                # Show diff summary
                if isinstance(current, dict) and isinstance(snapshot, dict):
                    added = set(current.keys()) - set(snapshot.keys())
                    removed = set(snapshot.keys()) - set(current.keys())
                    if added:
                        print(f"    Added keys: {added}")
                    if removed:
                        print(f"    Removed keys: {removed}")

    if mismatches:
        print(f"\nWARNING: {len(mismatches)} mismatches found:")
        for m in mismatches:
            print(f"  - {m}")
        return False
    else:
        print("\nAll snapshots match. KV state is clean.")
        return True


def main():
    parser = argparse.ArgumentParser(description="E2E test cleanup and verification")
    parser.add_argument("--verify-only", action="store_true", help="Only verify snapshots")
    args = parser.parse_args()

    secret = load_env()

    if not args.verify_only:
        clean_test_data(secret)

    ok = verify_snapshots(secret)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
