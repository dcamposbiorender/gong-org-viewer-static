#!/usr/bin/env python3
"""
Viewer Integration Script

Converts enriched output files to the format expected by public/index.html
and updates data sections: MANUAL_DATA, MATCH_REVIEW_DATA, and dropdown.
DATA is set to an empty stub (auto map used internally for enrichment only).

Usage:
    python3 scripts/integrate_viewer.py --preview     # Show what would be updated
    python3 scripts/integrate_viewer.py --update      # Actually update index.html
    python3 scripts/integrate_viewer.py --export-json # Export data files only

Output:
    - output/viewer_data.json           # DATA object for viewer
    - output/viewer_manual_data.json    # MANUAL_DATA for viewer
    - output/viewer_match_review.json   # MATCH_REVIEW_DATA for viewer
"""

import json
import os
import re
import argparse
from datetime import datetime
from pathlib import Path
from typing import Dict, Any

BASE_DIR = Path(__file__).parent.parent
OUTPUT_DIR = BASE_DIR / "output"
PUBLIC_DIR = BASE_DIR / "public"
MANUAL_MAPS_DIR = BASE_DIR / "Manual Maps Jan 26 2026"

COMPANIES = ["abbvie", "astrazeneca", "gsk", "lilly", "novartis", "regeneron", "roche"]

# Map our company names to viewer's expected display names
COMPANY_DISPLAY_NAMES = {
    "abbvie": "AbbVie",
    "astrazeneca": "AstraZeneca",
    "gsk": "GSK",
    "lilly": "Eli Lilly",
    "novartis": "Novartis",
    "regeneron": "Regeneron",
    "roche": "Roche"
}

BATCHES_DIR = BASE_DIR / "batches_enriched"


def load_transcripts(company: str) -> dict:
    """Load all transcripts for a company from batches_enriched/.
    Returns: { call_id: { 'text': str, 'title': str } }
    """
    transcripts = {}
    batch_dir = BATCHES_DIR / company
    if not batch_dir.exists():
        print(f"  Warning: No batches_enriched/{company} directory")
        return transcripts

    for batch_file in sorted(batch_dir.glob("batch_*.json")):
        with open(batch_file) as f:
            batch = json.load(f)
        for call in batch.get('calls', []):
            transcripts[call['call_id']] = {
                'text': call.get('transcript_text', ''),
                'title': call.get('call_title', '')
            }
    return transcripts


def find_context(quote: str, transcript_data: dict, context_chars: int = 1000) -> dict | None:
    """Find snippet quote in transcript and extract surrounding context.
    Uses full normalized quote match (up to 1000 chars), not prefix.
    Falls back to matching with speaker tags stripped (LLM often removes them).
    """
    text = transcript_data.get('text') or ''
    if not text or not quote:
        return None

    norm_text = re.sub(r'\s+', ' ', text.lower())
    norm_quote = re.sub(r'\s+', ' ', quote.lower().strip())

    # Try full quote match (up to 1000 chars)
    search_key = norm_quote[:1000]
    idx = norm_text.find(search_key)

    # Fallback: strip speaker tags (and trailing colon) from transcript and retry
    # LLM extraction often removes "[Speaker 123456]: " from quotes
    use_stripped = False
    if idx < 0:
        stripped_text = re.sub(r'\[Speaker \d+\]:\s*', '', text)
        stripped_text = re.sub(r'\[Speaker \d+\]', '', stripped_text)
        norm_stripped = re.sub(r'\s+', ' ', stripped_text.lower())
        idx = norm_stripped.find(search_key)
        if idx >= 0:
            use_stripped = True
            text = stripped_text
            norm_text = norm_stripped

    if idx < 0:
        return None

    # Extract context windows from original text
    start = max(0, idx - context_chars)
    end = min(len(text), idx + len(search_key) + context_chars)

    # Keep original speaker IDs — resolved to names at display time in JS
    before = text[start:idx]
    after = text[idx + len(search_key):end]

    # Add ellipsis if truncated
    if start > 0:
        before = '...' + before
    if end < len(text):
        after = after + '...'

    return {
        'contextBefore': before,
        'contextAfter': after,
        'callTitle': transcript_data.get('title', '')
    }


def load_enriched_auto_map(company: str) -> Dict:
    """Load auto map for a company.

    Prefers TRUE auto map (built from Gong data only) over enriched auto map
    (which incorrectly copied manual map structure).
    """
    # Prefer true auto map (built entirely from Gong extractions)
    true_auto_path = OUTPUT_DIR / f"{company}_true_auto_map.json"
    if true_auto_path.exists():
        print(f"    Using TRUE auto map (Gong-only)")
        with open(true_auto_path) as f:
            return json.load(f)

    # Fallback to enriched auto map (legacy)
    enriched_path = OUTPUT_DIR / f"{company}_enriched_auto_map.json"
    if enriched_path.exists():
        print(f"    Using enriched auto map (legacy)")
        with open(enriched_path) as f:
            return json.load(f)

    print(f"  Warning: No auto map found for {company}")
    return {}


def normalize_entity_name(name: str) -> str:
    """Normalize entity name for consistent matching."""
    if not name:
        return ""
    # Lowercase, strip whitespace, collapse multiple spaces
    return re.sub(r'\s+', ' ', name.lower().strip())


def build_manual_map_names(manual_root: Dict) -> set:
    """Build a set of normalized names from the manual map."""
    names = set()

    def collect(node):
        name = normalize_entity_name(node.get("name", ""))
        if name:
            names.add(name)
        for child in node.get("children", []):
            collect(child)

    collect(manual_root)
    return names


def generate_match_review_from_auto_map(company: str, auto_map: Dict, manual_map: Dict) -> Dict:
    """Generate match review data from true auto map.

    Finds entities in auto map that DON'T match any manual map node.
    These are the "unmatched" entities that need user review.

    Loads LLM match suggestions to provide suggested matches.
    """
    if not auto_map or not auto_map.get("root"):
        return {}

    # Build set of all manual map entity names (normalized)
    manual_root = manual_map.get("root", manual_map)
    manual_names = build_manual_map_names(manual_root) if manual_root else set()

    # Load LLM match suggestions
    llm_data = load_llm_matches(company)
    llm_lookup = {}
    for match in llm_data.get("matches", []):
        entity_name = normalize_entity_name(match.get("entity_name", ""))
        if entity_name:
            llm_lookup[entity_name] = match

    # Collect all entities from auto map with their snippets
    unmatched_items = []

    def collect_unmatched(node, parent_name=None):
        name = node.get("name", "")
        name_lower = normalize_entity_name(name)
        snippets = node.get("snippets", [])

        # Check if this entity matches any manual map node
        is_matched = name_lower in manual_names

        if snippets and not is_matched:
            # This entity has evidence but no manual map match - add to review
            first_snippet = snippets[0]

            # Look up LLM suggested match
            llm_match = llm_lookup.get(name_lower)
            llm_suggested_match = None
            if llm_match and llm_match.get("matched_node_id"):
                llm_suggested_match = {
                    "manual_node_id": llm_match.get("matched_node_id"),
                    "manual_node_name": llm_match.get("matched_node_name"),
                    "manual_node_path": llm_match.get("matched_node_path"),
                    "confidence": llm_match.get("confidence"),
                    "reasoning": llm_match.get("reasoning")
                }

            item = {
                "id": f"{company}_{name_lower.replace(' ', '_')}_{len(unmatched_items)}",
                "company": company,
                "gong_entity": name,
                "gong_parent": parent_name,
                "entity_type": node.get("type", "unknown"),
                "team_size": node.get("size"),
                "confidence": node.get("confidence", "medium"),
                "mention_count": len(snippets),
                "snippet": first_snippet.get("quote", ""),
                "snippet_date": first_snippet.get("date"),
                "person_name": first_snippet.get("customerName"),
                "person_email": first_snippet.get("customerEmail"),
                "internal_name": first_snippet.get("internalName"),
                "internal_email": first_snippet.get("internalEmail"),
                "llm_suggested_match": llm_suggested_match,
                "status": "pending",
                "gong_url": first_snippet.get("gongUrl"),
                "call_id": first_snippet.get("callId"),
                "call_count": len(set(s.get("callId") for s in snippets if s.get("callId"))),
                "all_snippets": snippets
            }
            unmatched_items.append(item)

        for child in node.get("children", []):
            collect_unmatched(child, name)

    collect_unmatched(auto_map["root"])

    # Count items with suggestions
    with_suggestions = sum(1 for item in unmatched_items if item.get("llm_suggested_match"))

    return {
        "total_unmatched": len(unmatched_items),
        "total_with_suggestions": with_suggestions,
        "items": unmatched_items
    }


def load_llm_matches(company: str) -> Dict:
    """Load LLM match suggestions for a company.

    Prefers non-cleaned matches (from true_auto_map entities).
    """
    # Prefer non-cleaned matches (from true_auto_map entities)
    regular_path = OUTPUT_DIR / f"{company}_llm_matches.json"
    if regular_path.exists():
        with open(regular_path) as f:
            return json.load(f)

    # Fallback to cleaned matches (legacy)
    cleaned_path = OUTPUT_DIR / f"{company}_cleaned_llm_matches.json"
    if cleaned_path.exists():
        with open(cleaned_path) as f:
            return json.load(f)

    print(f"  Warning: No LLM matches found for {company}")
    return {}


def load_manual_map(company: str) -> Dict:
    """Load manual map for a company."""
    # Try different filename patterns (prefer fixed versions)
    patterns = [
        f"{company}_rd_map_fixed.json",  # Prefer fixed version
        f"{company}_rd_map.json",
        f"{company}-rd-org-map.json",
        f"{company}_rd_map (2).json"
    ]

    for pattern in patterns:
        filepath = MANUAL_MAPS_DIR / pattern
        if filepath.exists():
            try:
                with open(filepath) as f:
                    return json.load(f)
            except json.JSONDecodeError as e:
                print(f"  Warning: JSON error in {pattern}: {e}")
                continue

    print(f"  Warning: No valid manual map found for {company}")
    return {}


def count_nodes(node: Dict) -> int:
    """Count total nodes in tree."""
    count = 1
    for child in node.get("children", []):
        count += count_nodes(child)
    return count


def build_auto_entity_lookup(enriched_root: Dict) -> Dict[str, Dict]:
    """Build a lookup of entity name → full entity data from auto map.

    This allows us to merge Gong data (snippets, size, leader, sizeMentions)
    from the auto map into manual map nodes when they share the same entity name.

    Returns dict with: snippets, size, leader, sizeMentions for each matched entity.

    Handles both:
    - TRUE auto map format: data directly on node
    - Legacy enriched format: data in gong_evidence
    """
    lookup = {}

    def collect(node):
        name_lower = node.get("name", "").lower().strip()
        node_id = node.get("id", "")

        # Get snippets - check both formats
        # TRUE auto map: snippets directly on node
        snippets = node.get("snippets", [])

        # Legacy enriched format: snippets in gong_evidence
        if not snippets:
            gong_evidence = node.get("gong_evidence", {})
            snippets = gong_evidence.get("snippets", [])

        if snippets:
            # Build full entity data object
            entity_data = {
                "snippets": snippets,
                "size": node.get("size"),
                "leader": node.get("leader"),
                "sizeMentions": node.get("sizeMentions", []),
            }

            # Index by both name and id for flexible matching
            if name_lower:
                lookup[name_lower] = entity_data
            if node_id:
                lookup[node_id] = entity_data

        for child in node.get("children", []):
            collect(child)

    collect(enriched_root)
    return lookup


# Backwards compatibility alias
def build_snippet_lookup(enriched_root: Dict) -> Dict[str, list]:
    """Deprecated: Use build_auto_entity_lookup instead."""
    full_lookup = build_auto_entity_lookup(enriched_root)
    return {k: v.get("snippets", []) for k, v in full_lookup.items()}


def count_snippets(node: Dict) -> int:
    """Count snippets with actual content in tree."""
    count = 0
    # Check both formats: direct snippets or nested in gong_evidence
    snippets = node.get("snippets", [])
    if not snippets:
        evidence = node.get("gong_evidence", {})
        snippets = evidence.get("snippets", [])
    count += sum(1 for s in snippets if s.get("quote"))

    for child in node.get("children", []):
        count += count_snippets(child)
    return count


def get_date_range(node: Dict) -> tuple:
    """Get min/max dates from snippets."""
    dates = []

    def collect_dates(n):
        # Check both formats
        snippets = n.get("snippets", [])
        if not snippets:
            evidence = n.get("gong_evidence", {})
            snippets = evidence.get("snippets", [])
        for snippet in snippets:
            if snippet.get("date"):
                dates.append(snippet["date"])
        for child in n.get("children", []):
            collect_dates(child)

    collect_dates(node)

    if dates:
        return min(dates), max(dates)
    return None, None


def build_leader_lookup(manual_root: Dict) -> Dict[str, Dict]:
    """Build a lookup of entity name → leader data from manual map.

    Used to merge leader information from manual map into auto-extracted data,
    since extractions don't currently capture leader names.
    """
    lookup = {}

    def collect(node):
        name_lower = node.get("name", "").lower().strip()
        leader = node.get("leader")

        if leader and name_lower:
            lookup[name_lower] = leader

        for child in node.get("children", []):
            collect(child)

    collect(manual_root)
    return lookup


def convert_node_for_viewer(node: Dict, leader_lookup: Dict = None,
                            transcripts: dict = None, context_stats: dict = None) -> Dict:
    """Convert auto map node to viewer DATA format.

    Handles both:
    - TRUE auto map format: snippets already at node level
    - Legacy enriched format: snippets nested in gong_evidence

    If leader_lookup is provided and node has no leader, looks up leader
    from manual map by entity name.

    If transcripts is provided, enriches each snippet with contextBefore,
    contextAfter, and callTitle from the transcript.

    context_stats is a mutable dict for tracking: matched, total, failures.

    Viewer expects snippets directly on node.
    """
    # Get leader - prefer from node, fallback to lookup from manual map
    leader = node.get("leader")
    if not leader and leader_lookup:
        name_lower = node.get("name", "").lower().strip()
        leader = leader_lookup.get(name_lower)

    result = {
        "id": node.get("id"),
        "name": node.get("name"),
        "type": node.get("type"),
        "verification_status": node.get("verification_status"),
        "leader": leader,
        "size": node.get("size"),
        "mentions": node.get("mentions", 0),
        "confidence": node.get("confidence"),
        "firstSeen": node.get("firstSeen"),
        "snippets": [],
        "sizeMentions": node.get("sizeMentions", []),
        "children": []
    }

    def build_viewer_snippet(snippet):
        """Build a viewer snippet dict and enrich with context if available."""
        viewer_snippet = {
            "quote": snippet.get("quote", ""),
            "date": snippet.get("date"),
            "gongUrl": snippet.get("gongUrl"),
            "callId": snippet.get("callId"),
            "customerName": snippet.get("customerName"),
            "internalName": snippet.get("internalName"),
            "customerEmail": snippet.get("customerEmail"),
            "internalEmail": snippet.get("internalEmail"),
            "speakerId": snippet.get("speakerId"),
            "sizeMentions": snippet.get("sizeMentions", [])
        }

        # Enrich with transcript context if available
        if transcripts and context_stats is not None:
            call_id = snippet.get("callId")
            if call_id and call_id in transcripts:
                context_stats['total'] += 1
                context = find_context(viewer_snippet['quote'], transcripts[call_id])
                if context:
                    viewer_snippet['contextBefore'] = context['contextBefore']
                    viewer_snippet['contextAfter'] = context['contextAfter']
                    viewer_snippet['callTitle'] = context['callTitle']
                    context_stats['matched'] += 1
                else:
                    context_stats['failures'].append({
                        'callId': call_id,
                        'quote': viewer_snippet['quote'][:60]
                    })
            elif call_id:
                # callId exists but not in transcripts
                context_stats['total'] += 1
                context_stats['failures'].append({
                    'callId': call_id,
                    'quote': viewer_snippet['quote'][:60],
                    'reason': 'call_id not in transcripts'
                })

        return viewer_snippet

    # Check if snippets are already at node level (TRUE auto map format)
    if node.get("snippets"):
        for snippet in node.get("snippets", []):
            result["snippets"].append(build_viewer_snippet(snippet))
    else:
        # Legacy: Extract snippets from gong_evidence
        gong_evidence = node.get("gong_evidence", {})
        if gong_evidence:
            for snippet in gong_evidence.get("snippets", []):
                result["snippets"].append(build_viewer_snippet(snippet))

    # Recursively process children
    for child in node.get("children", []):
        result["children"].append(
            convert_node_for_viewer(child, leader_lookup, transcripts, context_stats)
        )

    return result


def convert_manual_node_for_viewer(node: Dict, entity_lookup: Dict = None) -> Dict:
    """Convert manual map node to viewer MANUAL_DATA format with enriched data.

    Viewer expects gongEvidence (camelCase), not gong_evidence.
    If entity_lookup is provided, we merge matching data (snippets, size, leader,
    sizeMentions) from the auto map into this manual map node.
    """
    result = {
        "id": node.get("id"),
        "name": node.get("name"),
        "type": node.get("type"),
        "level": node.get("level", 0),
        "sites": node.get("sites", []),
        "notes": node.get("notes", ""),
        "gongEvidence": {  # camelCase for viewer
            "matchedEntities": [],
            "matchedContacts": [],
            "totalMentions": 0,
            "teamSizes": [],
            "sizeMentions": [],
            "snippets": [],
            "confidence": "none",
            "status": "unverified"
        },
        "children": []
    }

    # Copy leader info if present in manual map
    if node.get("leader"):
        result["leader"] = node["leader"]

    # Copy gong_evidence to gongEvidence (camelCase) if present in manual map
    gong_evidence = node.get("gong_evidence", {})
    if gong_evidence:
        result["gongEvidence"] = {
            "matchedEntities": gong_evidence.get("matched_entities", gong_evidence.get("matchedEntities", [])),
            "matchedContacts": gong_evidence.get("matched_contacts", gong_evidence.get("matchedContacts", [])),
            "totalMentions": gong_evidence.get("total_mentions", gong_evidence.get("totalMentions", 0)),
            "teamSizes": gong_evidence.get("team_sizes", gong_evidence.get("teamSizes", [])),
            "sizeMentions": gong_evidence.get("size_mentions", gong_evidence.get("sizeMentions", [])),
            "snippets": gong_evidence.get("snippets", []),
            "confidence": gong_evidence.get("confidence", "none"),
            "status": gong_evidence.get("status", "unverified")
        }

    # MERGE DATA from auto map lookup if available
    if entity_lookup and not result["gongEvidence"]["snippets"]:
        name_lower = node.get("name", "").lower().strip()
        node_id = node.get("id", "")

        # Try to find matching entity by name or id
        matched_entity = entity_lookup.get(name_lower) or entity_lookup.get(node_id)

        if matched_entity:
            # Pull snippets
            snippets = matched_entity.get("snippets", [])
            if snippets:
                result["gongEvidence"]["snippets"] = snippets
                result["gongEvidence"]["totalMentions"] = len(snippets)
                result["gongEvidence"]["confidence"] = "medium"
                result["gongEvidence"]["status"] = "auto_matched"

            # Pull team size from auto entity
            auto_size = matched_entity.get("size")
            if auto_size:
                result["gongEvidence"]["teamSizes"] = [auto_size]

            # Pull sizeMentions from auto entity
            auto_size_mentions = matched_entity.get("sizeMentions", [])
            if auto_size_mentions:
                result["gongEvidence"]["sizeMentions"] = auto_size_mentions

            # Pull leader from auto entity (if manual doesn't have one)
            auto_leader = matched_entity.get("leader")
            if auto_leader and not result.get("leader"):
                result["leader"] = auto_leader

    # Recursively process children
    for child in node.get("children", []):
        result["children"].append(convert_manual_node_for_viewer(child, entity_lookup))

    return result


def convert_auto_map_to_data(company: str, auto_map: Dict, manual_map: Dict,
                             transcripts: dict = None) -> Dict:
    """Convert auto map to viewer DATA format.

    Handles both TRUE auto map and legacy enriched auto map formats.
    Merges leader data from manual map if not present in auto map.
    If transcripts is provided, enriches snippets with context windows.
    """
    raw_root = auto_map.get("root", {})

    # Build leader lookup from manual map (since extractions don't capture leaders)
    leader_lookup = {}
    manual_root = manual_map.get("root", manual_map)
    if manual_root:
        leader_lookup = build_leader_lookup(manual_root)

    # Track context extraction stats
    context_stats = {'matched': 0, 'total': 0, 'failures': []}

    # Convert root to viewer format with leader lookup and transcripts
    root = convert_node_for_viewer(raw_root, leader_lookup, transcripts, context_stats)

    # Write context failure report and print stats
    if transcripts and context_stats['total'] > 0:
        matched = context_stats['matched']
        total = context_stats['total']
        pct = 100 * matched // max(total, 1)
        print(f"    Context added to {matched} of {total} snippets ({pct}%)")

        if context_stats['failures']:
            failures_dir = OUTPUT_DIR / company
            failures_dir.mkdir(parents=True, exist_ok=True)
            failures_path = failures_dir / "context_failures.json"
            with open(failures_path, 'w') as f:
                json.dump(context_stats['failures'], f, indent=2)
            print(f"    Context failures: {len(context_stats['failures'])} (see {failures_path})")

    # Get date range - prefer from auto_map metadata, else calculate
    if auto_map.get("dateRange"):
        start_date = auto_map["dateRange"].get("start")
        end_date = auto_map["dateRange"].get("end")
    else:
        start_date, end_date = get_date_range(root)

    # Calculate stats - prefer from auto_map if available
    auto_stats = auto_map.get("stats", {})
    snippet_count = count_snippets(root)

    # TRUE auto map: use stats.nodes_with_snippets
    # Legacy enriched: use enrichment_stats.nodes_enriched_with_snippets
    enrichment_stats = auto_map.get("enrichment_stats", {})
    extractions = (
        auto_stats.get("nodes_with_snippets") or
        enrichment_stats.get("nodes_enriched_with_snippets") or
        0
    )

    return {
        "company": COMPANY_DISPLAY_NAMES.get(company, company.title()),
        "stats": {
            "entities": count_nodes(root),
            "extractions": extractions,
            "calls": 0,  # Would need to aggregate from snippets
            "snippets": snippet_count
        },
        "dateRange": {
            "start": start_date or "2023-01-01",
            "end": end_date or "2026-01-27"
        },
        "changes": {
            "reorgs": [],
            "leadership": [],
            "size": []
        },
        "source": auto_map.get("source", "unknown"),  # Track which format was used
        "root": root
    }


def calculate_manual_map_stats(root: Dict) -> Dict:
    """Calculate stats for a manual map tree.

    Returns:
        Dict with:
        - entities: Total count of entities in tree
        - matched: Count of entities with gongEvidence.status == "auto_matched"
        - snippets: Total count of snippets across all entities
    """
    stats = {
        "entities": 0,
        "matched": 0,
        "snippets": 0
    }

    def collect_stats(node):
        stats["entities"] += 1

        # Check if this node has matched data
        evidence = node.get("gongEvidence", {})
        if evidence.get("status") == "auto_matched":
            stats["matched"] += 1

        # Count snippets
        snippets = evidence.get("snippets", [])
        stats["snippets"] += len(snippets)

        # Recurse into children
        for child in node.get("children", []):
            collect_stats(child)

    collect_stats(root)
    return stats


def convert_manual_map_to_viewer(company: str, manual_map: Dict, enriched_map: Dict = None) -> Dict:
    """Convert manual map to viewer MANUAL_DATA format with enriched data.

    If enriched_map is provided, data from matching entities (snippets, size,
    leader, sizeMentions) will be merged into the manual map nodes.
    """
    raw_root = manual_map.get("root", manual_map)  # Handle both formats

    # Build entity lookup from auto map (includes snippets, size, leader, sizeMentions)
    entity_lookup = {}
    if enriched_map and enriched_map.get("root"):
        entity_lookup = build_auto_entity_lookup(enriched_map["root"])

    # Convert to viewer format with data merging
    root = convert_manual_node_for_viewer(raw_root, entity_lookup)

    # Calculate stats
    stats = calculate_manual_map_stats(root)

    return {
        "company": COMPANY_DISPLAY_NAMES.get(company, company.title()),
        "source": f"Manual Map - {COMPANY_DISPLAY_NAMES.get(company, company.title())}",
        "stats": stats,
        "root": root
    }




def generate_dropdown_html() -> str:
    """Generate the dropdown HTML for company selector."""
    options = []
    for company in COMPANIES:
        display_name = COMPANY_DISPLAY_NAMES.get(company, company.title())
        options.append(f'        <option value="{company}">{display_name} ▾</option>')
    return '\n'.join(options)


def generate_viewer_data() -> tuple:
    """Generate DATA, MANUAL_DATA, and MATCH_REVIEW_DATA for viewer."""
    print("Generating viewer data...")

    data = {}
    manual_data = {}
    match_review = {
        "generated": datetime.now().isoformat(),
        "companies": {}
    }

    for company in COMPANIES:
        print(f"\n  Processing {company}...")

        # Load all data
        enriched_map = load_enriched_auto_map(company)
        manual_map = load_manual_map(company)

        # Load transcripts for context extraction
        transcripts = load_transcripts(company)
        if transcripts:
            print(f"    Loaded {len(transcripts)} transcripts for context extraction")

        if enriched_map:
            data[company] = convert_auto_map_to_data(company, enriched_map, manual_map, transcripts)
            print(f"    DATA: {data[company]['stats']['entities']} entities, {data[company]['stats']['snippets']} snippets")

        if manual_map:
            # Pass enriched_map to merge snippets into manual map nodes
            manual_data[company] = convert_manual_map_to_viewer(company, manual_map, enriched_map)
            # Use stats from conversion
            stats = manual_data[company].get("stats", {})
            print(f"    MANUAL_DATA: {stats.get('entities', 0)} entities, {stats.get('matched', 0)} matched, {stats.get('snippets', 0)} snippets")

        # Generate match review from auto map (finds unmatched entities)
        if enriched_map and manual_map:
            match_review_data = generate_match_review_from_auto_map(company, enriched_map, manual_map)
            if match_review_data:
                match_review["companies"][company] = match_review_data
                print(f"    MATCH_REVIEW: {match_review_data['total_unmatched']} unmatched items")

    return data, manual_data, match_review


def export_json(data: Dict, manual_data: Dict, match_review: Dict):
    """Export data files for inspection."""
    data_path = OUTPUT_DIR / "viewer_data.json"
    manual_path = OUTPUT_DIR / "viewer_manual_data.json"
    review_path = OUTPUT_DIR / "viewer_match_review.json"

    with open(data_path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"\n✓ Exported {data_path}")

    with open(manual_path, "w") as f:
        json.dump(manual_data, f, indent=2)
    print(f"✓ Exported {manual_path}")

    with open(review_path, "w") as f:
        json.dump(match_review, f, indent=2)
    print(f"✓ Exported {review_path}")


def find_object_end(text: str, start_pos: int) -> int:
    """Find the end of a JavaScript object starting at start_pos."""
    brace_start = text.find("{", start_pos)
    if brace_start == -1:
        return -1
    depth = 0
    in_string = False
    escape_next = False
    for i in range(brace_start, len(text)):
        char = text[i]
        if escape_next:
            escape_next = False
            continue
        if char == '\\':
            escape_next = True
            continue
        if char == '"' and not escape_next:
            in_string = not in_string
            continue
        if in_string:
            continue
        if char == '{':
            depth += 1
        elif char == '}':
            depth -= 1
            if depth == 0:
                return i
    return -1


def update_viewer(data: Dict, manual_data: Dict, match_review: Dict):
    """Update public/index.html with new data."""
    index_path = PUBLIC_DIR / "index.html"

    print(f"\nReading {index_path}...")
    with open(index_path, "r") as f:
        content = f.read()

    # 1. Update dropdown
    print("  Updating dropdown...")
    dropdown_pattern = r'<select class="company-select" id="companySelect">.*?</select>'
    new_dropdown = f'''<select class="company-select" id="companySelect">
{generate_dropdown_html()}
      </select>'''
    content = re.sub(dropdown_pattern, new_dropdown, content, flags=re.DOTALL)

    # 2. Update DATA section (stub only — auto map data used for enrichment, not injected)
    print("  Updating DATA (stub)...")
    data_start = content.find("const DATA = {")
    if data_start == -1:
        print("  ERROR: Could not find DATA")
        return False
    data_end = find_object_end(content, data_start)
    if data_end == -1:
        # DATA is already a stub like "const DATA = {};"
        data_end = content.find(";", data_start)
        if data_end == -1:
            print("  ERROR: Could not find end of DATA")
            return False
        data_end -= 1  # Point to the } before ;
    data_replacement = "const DATA = {}"
    content = content[:data_start] + data_replacement + content[data_end + 1:]

    # 3. Update MANUAL_DATA section
    print("  Updating MANUAL_DATA...")
    manual_start = content.find("const MANUAL_DATA = {")
    if manual_start == -1:
        print("  ERROR: Could not find MANUAL_DATA")
        return False
    manual_end = find_object_end(content, manual_start)
    if manual_end == -1:
        print("  ERROR: Could not find end of MANUAL_DATA")
        return False
    manual_replacement = f"const MANUAL_DATA = {json.dumps(manual_data, indent=2)}"
    content = content[:manual_start] + manual_replacement + content[manual_end + 1:]

    # 4. Update MATCH_REVIEW_DATA section
    print("  Updating MATCH_REVIEW_DATA...")
    review_start = content.find("const MATCH_REVIEW_DATA = {")
    if review_start == -1:
        print("  ERROR: Could not find MATCH_REVIEW_DATA")
        return False
    review_end = find_object_end(content, review_start)
    if review_end == -1:
        print("  ERROR: Could not find end of MATCH_REVIEW_DATA")
        return False
    review_replacement = f"const MATCH_REVIEW_DATA = {json.dumps(match_review, indent=2)}"
    content = content[:review_start] + review_replacement + content[review_end + 1:]

    # Backup original
    backup_path = PUBLIC_DIR / f"index.html.backup.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    with open(index_path, "r") as f:
        original = f.read()
    with open(backup_path, "w") as f:
        f.write(original)
    print(f"  Backed up to {backup_path}")

    # Write new content
    with open(index_path, "w") as f:
        f.write(content)

    print(f"✓ Updated {index_path}")
    print(f"  New size: {len(content):,} characters")

    return True


def preview(data: Dict, manual_data: Dict, match_review: Dict):
    """Show preview of what would be updated."""
    print("\n" + "=" * 60)
    print("PREVIEW: What would be updated")
    print("=" * 60)

    print("\nDropdown companies:")
    for company in COMPANIES:
        print(f"  - {company} ({COMPANY_DISPLAY_NAMES.get(company, company)})")

    print("\nDATA (auto org charts with gong_evidence):")
    for company, company_data in data.items():
        stats = company_data.get("stats", {})
        print(f"  {company}: {stats.get('entities', 0)} entities, {stats.get('snippets', 0)} snippets")

    print("\nMANUAL_DATA (ground truth org charts):")
    for company in manual_data:
        print(f"  {company}: loaded")

    print("\nMATCH_REVIEW_DATA (entity matching):")
    for company, company_review in match_review.get("companies", {}).items():
        print(f"  {company}: {company_review.get('total_unmatched', 0)} items, {company_review.get('total_with_suggestions', 0)} with suggestions")

    print(f"\nTotal DATA size: {len(json.dumps(data)):,} bytes")
    print(f"Total MANUAL_DATA size: {len(json.dumps(manual_data)):,} bytes")
    print(f"Total MATCH_REVIEW_DATA size: {len(json.dumps(match_review)):,} bytes")


def main():
    parser = argparse.ArgumentParser(description="Integrate enriched data into viewer")
    parser.add_argument("--preview", action="store_true", help="Preview what would be updated")
    parser.add_argument("--update", action="store_true", help="Actually update index.html")
    parser.add_argument("--export-json", action="store_true", help="Export data files only")

    args = parser.parse_args()

    if not any([args.preview, args.update, args.export_json]):
        parser.print_help()
        print("\nNo action specified. Use --preview, --update, or --export-json")
        return

    # Generate data
    data, manual_data, match_review = generate_viewer_data()

    if args.preview:
        preview(data, manual_data, match_review)

    if args.export_json:
        export_json(data, manual_data, match_review)

    if args.update:
        success = update_viewer(data, manual_data, match_review)
        if success:
            print("\n✓ Integration complete!")
            print("  Run 'npm run dev' to test locally")
            print("  Run 'vercel' to deploy")


if __name__ == "__main__":
    main()
