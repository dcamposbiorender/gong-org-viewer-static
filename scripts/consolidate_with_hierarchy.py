#!/usr/bin/env python3
"""
Consolidate extracted entities with LLM-inferred hierarchy.

Takes raw entity extractions from Gong calls and:
1. Deduplicates similar entity names (e.g., "Discovery Sciences" & "Discovery Sciences (DS)")
2. Infers parent-child hierarchy relationships using LLM
3. Aggregates all source quotes (snippets) per unique entity

Usage:
    python3 scripts/consolidate_with_hierarchy.py --company roche
    python3 scripts/consolidate_with_hierarchy.py --all
"""

import json
import argparse
import os
import time
import re
import requests
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any
from collections import defaultdict
import anthropic

from adapters import normalize_extraction
from config import COMPANIES, EXTRACTIONS_DIR, OUTPUT_DIR, RATE_LIMIT_DELAY, MODEL
from fetch_kv_merges import fetch_merges, build_alias_lookup, normalize_entity_name

BASE_DIR = Path(__file__).parent.parent


def slugify(name: str) -> str:
    """Convert entity name to URL-safe id (kebab-case)."""
    if not name:
        return ""
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug.strip("-")


# Team size extraction patterns (pre-compiled for performance)
TEAM_SIZE_PATTERNS = [
    re.compile(r'(?:about|around|approximately|roughly|close to|nearly|maybe|like|probably)?\s*(\d{1,4}(?:,\d{3})*)\s*(?:people|person|scientists|researchers|employees|team members?|members?|folks|FTEs?)', re.IGNORECASE),
    re.compile(r'(\d{1,4})\s+of\s+us', re.IGNORECASE),
    re.compile(r'(?:team|group|department)\s+of\s+(\d{1,4})', re.IGNORECASE),
    re.compile(r'(\d{1,4})[\s-]person\s+(?:team|group|department)', re.IGNORECASE),
    re.compile(r"we(?:'re| are)\s+(?:about\s+)?(\d{1,4})(?!\s*(?:year|month|day|license|seat))", re.IGNORECASE),
    re.compile(r'(\d{1,4})\s*(?:to|-)\s*(\d{1,4})\s*(?:people|person|scientists)', re.IGNORECASE),
]


def extract_team_size_from_text(text: str) -> str | None:
    """Extract team size from text using pre-compiled patterns."""
    for pattern in TEAM_SIZE_PATTERNS:
        match = pattern.search(text)
        if match:
            groups = match.groups()
            if len(groups) == 2 and groups[1]:
                return f"{groups[0]}-{groups[1]}"
            return groups[0]
    return None


def load_raw_extractions(company: str) -> List[Dict]:
    """Load raw entity extractions for a company."""
    filepath = EXTRACTIONS_DIR / company / "entities_llm_v2.json"
    if not filepath.exists():
        raise FileNotFoundError(f"Extractions not found: {filepath}")
    with open(filepath) as f:
        data = json.load(f)
    return data.get("entities", [])


def pre_aggregate_entities(raw_entities: List[Dict]) -> Dict[str, Dict]:
    """
    Pre-aggregate raw extractions by normalized entity name.

    Uses the adapter to normalize both extraction formats:
    - Format A (roche): entity_type, entity_name
    - Format B (astrazeneca): type, value

    Returns dict of {normalized_name: {entity_name, entity_type, sources: [...]}}
    """
    aggregated = defaultdict(lambda: {
        "entity_name": None,
        "entity_type": None,
        "team_size": None,
        "leader": None,
        "leader_title": None,
        "confidence_counts": defaultdict(int),
        "sources": []
    })

    for e in raw_entities:
        # Use adapter to normalize extraction format
        normalized_entity = normalize_extraction(e)

        name = normalized_entity["entity_name"]
        if not name:
            continue

        # Normalize for grouping (lowercase, remove punctuation)
        normalized = re.sub(r"[^a-z0-9\s]", "", name.lower()).strip()
        if not normalized or len(normalized) < 2:
            continue

        agg = aggregated[normalized]

        # Keep the longest/most complete name as canonical
        if agg["entity_name"] is None or len(name) > len(agg["entity_name"]):
            agg["entity_name"] = name

        # Keep most common entity type
        entity_type = normalized_entity["entity_type"]
        agg["confidence_counts"][entity_type] += 1

        # Get normalized fields from adapter
        raw_quote = normalized_entity["raw_quote"]
        confidence = normalized_entity["confidence"]
        speaker_id = normalized_entity["speaker_id"]
        call_date = normalized_entity["call_date"]
        call_id = normalized_entity["call_id"]

        # Handle call_ids list (adapter gives first one; check for list too)
        call_ids = e.get("call_ids", [])
        if not call_ids and call_id:
            call_ids = [call_id]

        # Extract team size from quote if not already found
        if not agg["team_size"] and raw_quote:
            agg["team_size"] = extract_team_size_from_text(raw_quote)

        # Preserve leader from extraction (first non-null wins)
        if not agg["leader"] and normalized_entity["leader"]:
            agg["leader"] = normalized_entity["leader"]
            agg["leader_title"] = normalized_entity["leader_title"]

        # Create a source entry for each call_id (or one if none)
        if call_ids:
            for cid in call_ids[:3]:  # Limit to first 3 call_ids per entity
                agg["sources"].append({
                    "call_id": cid,
                    "call_date": call_date,
                    "raw_quote": raw_quote,
                    "speaker_id": speaker_id,
                    "confidence": confidence
                })
        else:
            agg["sources"].append({
                "call_id": None,
                "call_date": call_date,
                "raw_quote": raw_quote,
                "speaker_id": speaker_id,
                "confidence": confidence
            })

    # Finalize entity types
    for normalized, agg in aggregated.items():
        if agg["confidence_counts"]:
            agg["entity_type"] = max(agg["confidence_counts"].items(), key=lambda x: x[1])[0]
        else:
            agg["entity_type"] = "team"
        del agg["confidence_counts"]

    return dict(aggregated)


def filter_quality_entities(aggregated: Dict[str, Dict], min_mentions: int = 1, min_confidence: str = "medium") -> List[Dict]:
    """
    Filter to keep only quality entities for consolidation.

    Criteria:
    - At least min_mentions mentions
    - Entity name is meaningful (not generic like "team is", "our design")
    """
    # Generic/low-quality names to filter out
    generic_patterns = [
        r"^our\s",
        r"^my\s",
        r"^the\s",
        r"^this\s",    # "This Team" etc
        r"^their\s",   # "Their Team" etc
        r"^your\s",
        r"^team is$",
        r"^small$",
        r"^big$",
        r"^new$",
        r"^\w{1,2}$",  # Single/double char
        r"^contact$",  # Skip contacts entity type when it's also the name
        r"^company$",
    ]

    quality_entities = []

    for normalized, agg in aggregated.items():
        name = agg["entity_name"]
        entity_type = agg.get("entity_type", "team")

        # Skip contact entity types - we want org units, not people
        if entity_type in ("contact", "person"):
            continue

        # Skip generic names
        is_generic = any(re.match(p, name.lower()) for p in generic_patterns)
        if is_generic:
            continue

        # Filter by mention count
        mention_count = len(agg["sources"])
        if mention_count < min_mentions:
            continue

        # Determine overall confidence
        confidences = [s.get("confidence", "medium") for s in agg["sources"]]
        high_count = confidences.count("high")
        medium_count = confidences.count("medium")

        if high_count >= len(confidences) * 0.5:
            overall_confidence = "high"
        elif high_count + medium_count >= len(confidences) * 0.5:
            overall_confidence = "medium"
        else:
            overall_confidence = "low"

        quality_entities.append({
            "id": slugify(name),
            "entity_name": name,
            "entity_type": agg["entity_type"],
            "team_size": agg["team_size"],
            "leader": agg.get("leader"),
            "leader_title": agg.get("leader_title"),
            "mention_count": mention_count,
            "confidence": overall_confidence,
            "all_sources": agg["sources"]
        })

    # Sort by mention count (most mentioned first)
    quality_entities.sort(key=lambda x: x["mention_count"], reverse=True)

    return quality_entities


CONSOLIDATION_SYSTEM_PROMPT = """You are an expert at consolidating organizational data extracted from sales call transcripts into a unified org chart.

Your task is to analyze a list of organizational entities extracted from multiple calls and:

1. IDENTIFY DUPLICATES: Find entities that refer to the same organizational unit
   - "Discovery Sciences" and "Discovery Sciences (DS)" → same entity
   - "BE" and "Biologics Engineering" → same entity (if evidence supports)
   - "gRED" and "Genentech Research" → potentially same
   - Keep the most complete/formal name as canonical

2. INFER HIERARCHY: Determine parent-child relationships between entities
   - Look for explicit statements like "X is part of Y", "X reports to Y", "X within Y"
   - Departments typically contain teams
   - Business units contain departments
   - Sites are typically peers at top level (not in hierarchy with departments)
   - Therapeutic areas may contain specific research groups

3. OUTPUT: Return a JSON object with:
   - entities: array of consolidated entities with parent_id relationships
   - hierarchy_notes: explain your reasoning for hierarchy decisions
   - duplicate_resolutions: document which entities you merged and why

Rules:
- If uncertain about a merge, keep entities separate
- If hierarchy is ambiguous, leave parent_id as null
- Confidence is "high" only if multiple sources confirm the relationship
- All IDs must be kebab-case (lowercase, hyphens instead of spaces)"""


def consolidate_with_llm(company: str, entities: List[Dict], client: anthropic.Anthropic) -> Dict:
    """
    Use Claude to consolidate entities and infer hierarchy.

    This processes entities in batches if needed to stay within context limits.
    """
    # For very large entity lists, we need to batch
    MAX_ENTITIES_PER_CALL = 50

    if len(entities) <= MAX_ENTITIES_PER_CALL:
        return _single_consolidation_call(company, entities, client)

    # Batch processing for large lists
    print(f"  Large entity list ({len(entities)}), processing in batches...")

    all_consolidated = []
    all_duplicates = []
    all_notes = []

    for i in range(0, len(entities), MAX_ENTITIES_PER_CALL):
        batch = entities[i:i + MAX_ENTITIES_PER_CALL]
        batch_num = i // MAX_ENTITIES_PER_CALL + 1
        total_batches = (len(entities) + MAX_ENTITIES_PER_CALL - 1) // MAX_ENTITIES_PER_CALL

        print(f"    Batch {batch_num}/{total_batches} ({len(batch)} entities)...")

        result = _single_consolidation_call(company, batch, client, batch_context=f"Batch {batch_num}/{total_batches}")

        batch_entities = result.get("entities", [])
        print(f"      → Returned {len(batch_entities)} entities")

        all_consolidated.extend(batch_entities)
        all_duplicates.extend(result.get("duplicate_resolutions", []))
        all_notes.append(result.get("hierarchy_notes", ""))

        time.sleep(RATE_LIMIT_DELAY)

    # Skip aggressive cross-batch consolidation - just use batch results
    # The per-batch consolidation already handles dedup within each batch
    if total_batches > 1:
        print(f"  Using {len(all_consolidated)} entities from {total_batches} batches (skipping cross-batch dedup)")

        return {
            "account": company,
            "entities": all_consolidated,
            "hierarchy_notes": "\n\n".join(all_notes),
            "duplicate_resolutions": all_duplicates
        }

    return {
        "account": company,
        "entities": all_consolidated,
        "hierarchy_notes": "\n\n".join(all_notes),
        "duplicate_resolutions": all_duplicates
    }


def _single_consolidation_call(company: str, entities: List[Dict], client: anthropic.Anthropic, batch_context: str = "") -> Dict:
    """Single consolidation API call."""

    # Prepare entity summary (without full sources to save tokens)
    entity_summaries = []
    for e in entities:
        summary = {
            "id": e["id"],
            "entity_name": e["entity_name"],
            "entity_type": e["entity_type"],
            "mention_count": e["mention_count"],
            "confidence": e["confidence"],
            # Include a few representative quotes
            "sample_quotes": [s["raw_quote"][:200] for s in e["all_sources"][:3]]
        }
        entity_summaries.append(summary)

    # Build a list of just the IDs for reference
    input_ids = [e["id"] for e in entity_summaries]

    user_prompt = f"""Process these {len(entities)} organizational entities from {company.upper()} Gong calls.
{f"({batch_context})" if batch_context else ""}

Input entity IDs: {input_ids}

## Entities
```json
{json.dumps(entity_summaries, indent=2)}
```

## YOUR TASK

For each input entity, decide:
1. Is it a VALID organizational unit (department, team, site, therapeutic area)?
   - YES: Include it in output with its original ID
   - NO (garbage/noise): Exclude it
2. Should it be MERGED with another entity (same org unit, different name)?
   - YES: Combine into one entry, list both IDs in original_ids
   - NO: Keep as separate entry
3. Can you infer its PARENT from the quotes?
   - YES: Set parent_id to the parent's kebab-case ID
   - NO: Set parent_id to null (this is fine!)

## OUTPUT FORMAT

Return ONLY a JSON object. No explanation text before or after.

```json
{{
  "entities": [
    {{"id": "discovery-sciences", "name": "Discovery Sciences", "type": "department", "parent_id": null, "confidence": "high", "original_ids": ["discovery-sciences"]}},
    {{"id": "oncology", "name": "Oncology", "type": "therapeutic_area", "parent_id": "discovery-sciences", "confidence": "medium", "original_ids": ["oncology", "discovery-oncology"]}}
  ],
  "hierarchy_notes": "Brief notes on hierarchy decisions",
  "duplicate_resolutions": [{{"merged_names": ["Name A", "Name B"], "canonical_name": "Name A", "reason": "Same entity"}}]
}}
```

CRITICAL:
- Output {len(entities)} minus garbage entities (expect 60-90% to be valid)
- Every valid entity MUST appear in your output
- If you're unsure about an entity, INCLUDE it with confidence: "low"
- An empty entities array is WRONG unless ALL inputs are garbage"""

    response = client.messages.create(
        model=MODEL,
        max_tokens=4000,
        system=CONSOLIDATION_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}]
    )

    # Extract JSON from response
    response_text = response.content[0].text

    # Try to parse JSON from response
    try:
        # Look for JSON block
        json_match = re.search(r"```json\s*([\s\S]*?)\s*```", response_text)
        if json_match:
            return json.loads(json_match.group(1))
        # Try parsing the whole response
        return json.loads(response_text)
    except json.JSONDecodeError:
        print(f"  Warning: Could not parse LLM response as JSON")
        print(f"  Response: {response_text[:500]}...")
        return {"entities": [], "hierarchy_notes": "Parse error", "duplicate_resolutions": []}


def _cross_batch_consolidation(company: str, entities: List[Dict], client: anthropic.Anthropic) -> Dict:
    """Light pass to merge duplicates across batches."""

    # Just get entity names and IDs for a quick dedup pass
    entity_list = [{"id": e["id"], "name": e["name"], "type": e["type"]} for e in entities]

    user_prompt = f"""These entities were consolidated in separate batches.
Check for any remaining duplicates that should be merged.

## Entities
```json
{json.dumps(entity_list, indent=2)}
```

Return only entities that should be merged. If no merges needed, return empty arrays.
{{
  "entities": [],  // Only include if changes needed
  "hierarchy_notes": "Cross-batch findings",
  "duplicate_resolutions": []
}}"""

    response = client.messages.create(
        model=MODEL,
        max_tokens=2000,
        system="You are deduplicating organizational entities across batches. Be conservative - only merge if clearly the same entity.",
        messages=[{"role": "user", "content": user_prompt}]
    )

    response_text = response.content[0].text

    try:
        json_match = re.search(r"```json\s*([\s\S]*?)\s*```", response_text)
        if json_match:
            return json.loads(json_match.group(1))
        return json.loads(response_text)
    except json.JSONDecodeError:
        return {"entities": [], "hierarchy_notes": "", "duplicate_resolutions": []}


def merge_consolidation_with_sources(consolidated: Dict, original_entities: List[Dict]) -> List[Dict]:
    """
    Merge LLM consolidation results with original source data.

    The LLM provides structure (hierarchy, dedup), but we need to attach
    the full source quotes from the original extractions.
    """
    # Build lookup of original entities by ID
    originals_by_id = {e["id"]: e for e in original_entities}

    merged_entities = []

    for ce in consolidated.get("entities", []):
        # Get IDs that were merged into this entity
        original_ids = ce.get("original_ids", [ce["id"]])

        # Aggregate all sources from merged entities
        all_sources = []
        total_mentions = 0

        for orig_id in original_ids:
            if orig_id in originals_by_id:
                orig = originals_by_id[orig_id]
                all_sources.extend(orig.get("all_sources", []))
                total_mentions += orig.get("mention_count", 0)

        # Deduplicate sources by call_id, but preserve sources without call_id
        seen_calls = set()
        unique_sources = []
        sources_without_call_id = 0
        for src in all_sources:
            call_id = src.get("call_id")
            if call_id:
                if call_id not in seen_calls:
                    seen_calls.add(call_id)
                    unique_sources.append(src)
            else:
                # Preserve sources without call_id - they may have valuable quotes
                unique_sources.append(src)
                sources_without_call_id += 1

        if sources_without_call_id > 0:
            print(f"    Note: {sources_without_call_id} sources without call_id preserved")

        # Get team_size from original entities (first non-null wins)
        team_size = None
        for orig_id in original_ids:
            if orig_id in originals_by_id:
                orig = originals_by_id[orig_id]
                if orig.get("team_size"):
                    team_size = orig["team_size"]
                    break

        # Get leader from original entities (most recent source date wins for determinism)
        leader = None
        leader_title = None
        leader_date = ""
        for orig_id in original_ids:
            if orig_id in originals_by_id:
                orig = originals_by_id[orig_id]
                if orig.get("leader"):
                    # Find the most recent source date for this entity
                    orig_date = ""
                    for src in orig.get("all_sources", []):
                        src_date = src.get("call_date", "")
                        if src_date > orig_date:
                            orig_date = src_date
                    # Use most recent leader, not first found
                    if not leader or orig_date > leader_date:
                        leader = orig["leader"]
                        leader_title = orig.get("leader_title")
                        leader_date = orig_date

        merged_entity = {
            "id": ce["id"],
            "entity_name": ce["name"],
            "entity_type": ce["type"],
            "parent_entity": ce.get("parent_id"),  # This is the key field!
            "team_size": team_size,
            "leader": leader,
            "leader_title": leader_title,
            "mention_count": total_mentions or len(unique_sources),
            "confidence": ce.get("confidence", "medium"),
            "all_sources": unique_sources[:10],  # Keep top 10 sources
            "original_ids": original_ids
        }

        merged_entities.append(merged_entity)

    return merged_entities


def consolidate_company(company: str, client: anthropic.Anthropic) -> Dict:
    """
    Full consolidation pipeline for a company.

    1. Load raw extractions
    2. Pre-aggregate by normalized name
    3. Filter to quality entities
    4. LLM consolidation with hierarchy inference
    5. Merge back with full source data
    """
    print(f"\n{'='*60}")
    print(f"Consolidating {company.upper()}")
    print(f"{'='*60}")

    # Step 1: Load raw extractions
    raw_entities = load_raw_extractions(company)
    print(f"  Raw extractions: {len(raw_entities)}")

    # Step 2: Pre-aggregate
    aggregated = pre_aggregate_entities(raw_entities)
    print(f"  Unique normalized names: {len(aggregated)}")

    # Step 3: Filter to quality entities
    quality_entities = filter_quality_entities(aggregated, min_mentions=1)
    print(f"  Quality entities: {len(quality_entities)}")

    if not quality_entities:
        print("  No quality entities to consolidate")
        return {
            "account": company,
            "entities": [],
            "contacts": [],
            "hierarchy_notes": "No quality entities found",
            "duplicate_resolutions": []
        }

    # Step 3.5: Check known aliases from KV
    print("  Checking known aliases from KV...")
    alias_matches = []
    try:
        merges = fetch_merges(company)
        alias_lookup = build_alias_lookup(merges)
        print(f"  Loaded {len(alias_lookup)} known aliases")

        for entity in quality_entities:
            normalized = normalize_entity_name(entity['name'])
            if normalized in alias_lookup:
                match_info = alias_lookup[normalized]
                alias_matches.append({
                    'extracted_name': entity['name'],
                    'extracted_id': entity.get('id', ''),
                    'canonical_id': match_info['canonical_id'],
                    'matched_alias': match_info['alias'],
                    'match_type': 'normalized',
                    'sources': [s.get('call_id') for s in entity.get('sources', [])]
                })

        if alias_matches:
            matches_path = OUTPUT_DIR / company / "alias_matches.json"
            matches_path.parent.mkdir(parents=True, exist_ok=True)
            with open(matches_path, 'w') as f:
                json.dump({
                    'company': company,
                    'generated_at': datetime.now().isoformat(),
                    'matches': alias_matches,
                    'summary': {'total': len(alias_matches)}
                }, f, indent=2)
            print(f"  Alias matches found: {len(alias_matches)} (see {matches_path})")
        else:
            print("  No alias matches found")

    except requests.RequestException as e:
        print(f"  Warning: Could not fetch merges from KV ({e}). Skipping alias check.")

    # Step 4: LLM consolidation
    print("  Running LLM consolidation...")
    consolidated = consolidate_with_llm(company, quality_entities, client)
    print(f"  Consolidated entities: {len(consolidated.get('entities', []))}")
    print(f"  Duplicate resolutions: {len(consolidated.get('duplicate_resolutions', []))}")

    # Step 5: Merge with sources
    merged_entities = merge_consolidation_with_sources(consolidated, quality_entities)
    print(f"  Final entities with sources: {len(merged_entities)}")

    # Count hierarchy relationships
    with_parent = sum(1 for e in merged_entities if e.get("parent_entity"))
    print(f"  Entities with parent_entity: {with_parent}")

    return {
        "account": company,
        "consolidated_at": datetime.now().isoformat(),
        "source": "llm_consolidation_with_hierarchy",
        "stats": {
            "raw_extractions": len(raw_entities),
            "pre_aggregated": len(aggregated),
            "quality_filtered": len(quality_entities),
            "final_consolidated": len(merged_entities),
            "with_hierarchy": with_parent
        },
        "entities": merged_entities,
        "contacts": [],  # Not consolidating contacts in this version
        "hierarchy_notes": consolidated.get("hierarchy_notes"),
        "duplicate_resolutions": consolidated.get("duplicate_resolutions", [])
    }


def save_consolidated(company: str, data: Dict):
    """Save consolidated data to output directory."""
    # Save to company-specific directory
    company_dir = OUTPUT_DIR / company
    company_dir.mkdir(parents=True, exist_ok=True)

    filepath = company_dir / "consolidated_with_hierarchy.json"
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2)
    print(f"  Saved: {filepath}")


def main():
    parser = argparse.ArgumentParser(description="Consolidate entities with LLM-inferred hierarchy")
    parser.add_argument("--company", type=str, help="Single company to process")
    parser.add_argument("--all", action="store_true", help="Process all companies")
    parser.add_argument("--dry-run", action="store_true", help="Skip LLM calls, just show stats")
    args = parser.parse_args()

    if not args.company and not args.all:
        parser.print_help()
        return

    # Initialize Anthropic client
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key and not args.dry_run:
        print("ERROR: ANTHROPIC_API_KEY not set")
        return

    client = anthropic.Anthropic(api_key=api_key) if api_key else None

    companies = COMPANIES if args.all else [args.company.lower()]

    for company in companies:
        if args.dry_run:
            # Just show stats without LLM
            raw_entities = load_raw_extractions(company)
            aggregated = pre_aggregate_entities(raw_entities)
            quality = filter_quality_entities(aggregated)
            print(f"\n{company}: {len(raw_entities)} raw → {len(aggregated)} aggregated → {len(quality)} quality")
        else:
            result = consolidate_company(company, client)
            save_consolidated(company, result)
            time.sleep(RATE_LIMIT_DELAY)

    print("\n" + "="*60)
    print("CONSOLIDATION COMPLETE")
    print("="*60)
    print("\nNext step: Run build_true_auto_map.py to generate auto maps from consolidated data")


if __name__ == "__main__":
    main()
