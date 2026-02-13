"""
Phase 2 Tests: Company switch handler must reload ALL state types.

Currently missing: loadManualMapOverrides, loadManualMapModifications, loadResolutions.
"""
import re
import pytest
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
INDEX_HTML = PROJECT_ROOT / "public" / "index.html"


@pytest.fixture
def html_content():
    return INDEX_HTML.read_text(encoding="utf-8")


class TestCompanySwitchLoadsAllState:
    def test_company_switch_loads_resolutions(self, html_content):
        """Company switch must call loadResolutions()."""
        idx = html_content.find("companySelect').addEventListener('change'")
        assert idx > 0
        block = html_content[idx:idx + 2000]
        assert "loadResolutions" in block, (
            "Company switch handler must call loadResolutions() to refresh "
            "conflict resolutions from KV on company change."
        )

    def test_company_switch_loads_manual_map_overrides(self, html_content):
        """Company switch must call loadManualMapOverrides()."""
        idx = html_content.find("companySelect').addEventListener('change'")
        assert idx > 0
        block = html_content[idx:idx + 2000]
        assert "loadManualMapOverrides" in block, (
            "Company switch handler must call loadManualMapOverrides() to "
            "prevent stale cross-company drag-drop state."
        )

    def test_company_switch_loads_manual_map_modifications(self, html_content):
        """Company switch must call loadManualMapModifications()."""
        idx = html_content.find("companySelect').addEventListener('change'")
        assert idx > 0
        block = html_content[idx:idx + 2000]
        assert "loadManualMapModifications" in block, (
            "Company switch handler must call loadManualMapModifications() "
            "to refresh the CRUD audit log for the new company."
        )
