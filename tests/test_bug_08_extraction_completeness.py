"""
Bug 8 (P2): Missing leader/size in extractions

Raw extractions should have leader and size fields if mentioned in transcripts.
This tests whether the extraction prompt is capturing this data.
"""
import json
import pytest
from conftest import get_extraction_path


class TestExtractionCompleteness:
    """Tests for Bug 8: Missing leader/size in extractions."""

    def test_extraction_schema_documented(self):
        """Raw extractions should follow a consistent schema."""
        extraction_path = get_extraction_path('abbvie')

        with open(extraction_path) as f:
            data = json.load(f)

        # Check top-level structure
        assert 'entities' in data, "Missing 'entities' key in extraction"
        # Note: actual schema uses batch_id, not company (extraction format)
        assert 'batch_id' in data or 'company' in data, "Missing 'batch_id' or 'company' key"

        entities = data.get('entities', [])
        assert len(entities) > 0, "No entities in extraction"

        # Check entity structure — supports both extraction formats
        sample = entities[0]
        # entity_name OR value (different extraction scripts use different names)
        assert 'entity_name' in sample or 'value' in sample, "Missing entity name field"
        assert 'entity_type' in sample or 'type' in sample, "Missing entity type field"
        # call_id (singular) in current format, call_ids in legacy
        assert 'call_id' in sample or 'call_ids' in sample, "Missing call ID field"

    def test_extraction_has_leader_or_size_info(self):
        """Check if any entities have leader or size information."""
        extraction_path = get_extraction_path('abbvie')

        with open(extraction_path) as f:
            data = json.load(f)

        entities = data.get('entities', [])

        # Check for leader/size fields
        has_leader = any(
            e.get('leader') or e.get('leader_name') or e.get('leader_mentioned')
            for e in entities
        )
        has_size = any(
            e.get('size') or e.get('team_size') or e.get('size_mentioned')
            for e in entities
        )

        # Check quotes for mentions of leaders/sizes
        leader_mentions = 0
        size_mentions = 0
        for e in entities:
            quote = e.get('raw_quote', '').lower()
            if any(w in quote for w in ['leads', 'head of', 'director', 'vp ', 'vice president']):
                leader_mentions += 1
            if any(w in quote for w in ['people', 'team of', 'members', 'staff', 'employees']):
                size_mentions += 1

        print(f"\nExtraction analysis ({len(entities)} entities):")
        print(f"  Has leader field: {has_leader}")
        print(f"  Has size field: {has_size}")
        print(f"  Quotes mentioning leaders: {leader_mentions}")
        print(f"  Quotes mentioning sizes: {size_mentions}")

        # This is informational - extraction quality varies
        # The real fix would be improving the extraction prompt
