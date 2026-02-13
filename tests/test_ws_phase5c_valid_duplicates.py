"""
Phase 5C Tests: validDuplicate KV persistence.

markDuplicateValid must save to KV. findDuplicateLeaders must check
conflictResolutions (KV-loaded). loadResolutions must be in init Promise.all.
"""
import re
import pytest
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
INDEX_HTML = PROJECT_ROOT / "public" / "index.html"


@pytest.fixture
def html_content():
    return INDEX_HTML.read_text(encoding="utf-8")


class TestMarkDuplicateSavesToKV:
    def test_mark_duplicate_calls_save_resolution(self, html_content):
        """markDuplicateValid must call saveResolution to persist to KV."""
        idx = html_content.find("function markDuplicateValid")
        assert idx > 0, "markDuplicateValid must exist"
        block = html_content[idx:idx + 500]
        assert "saveResolution" in block, (
            "markDuplicateValid must call saveResolution to persist dismissal to KV"
        )


class TestDuplicateCheckConsultsKV:
    def test_duplicate_check_uses_conflict_resolutions(self, html_content):
        """findDuplicateLeaders/duplicate check must consult conflictResolutions."""
        # Find the validDuplicate check pattern
        idx = html_content.find("validDuplicate:")
        assert idx > 0, "validDuplicate pattern must exist"
        block = html_content[idx:idx + 300]
        assert "conflictResolutions" in block, (
            "Duplicate check must consult conflictResolutions (KV-loaded data), "
            "not just localStorage"
        )


class TestLoadResolutionsInInit:
    def test_load_resolutions_in_promise_all(self, html_content):
        """loadResolutions must be in init Promise.all, not fire-and-forget."""
        init_pattern = r"Initialize.*async IIFE"
        match = re.search(init_pattern, html_content)
        assert match, "Init IIFE must exist"
        init_block = html_content[match.start():match.start() + 500]
        assert "loadResolutions" in init_block, (
            "loadResolutions must be in the init Promise.all block"
        )
