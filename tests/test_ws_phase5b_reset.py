"""
Phase 5B Tests: Reset button must clear KV corrections, not just localStorage.
"""
import re
import pytest
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
INDEX_HTML = PROJECT_ROOT / "public" / "index.html"
CORRECTIONS_TS = PROJECT_ROOT / "api" / "corrections.ts"


@pytest.fixture
def html_content():
    return INDEX_HTML.read_text(encoding="utf-8")


@pytest.fixture
def corrections_ts():
    return CORRECTIONS_TS.read_text(encoding="utf-8")


class TestResetButtonClearsKV:
    def test_reset_handler_calls_kv_delete(self, html_content):
        """Reset button handler must call fetch with DELETE on corrections endpoint."""
        idx = html_content.find("resetAllBtn').addEventListener")
        assert idx > 0, "resetAllBtn addEventListener must exist"
        block = html_content[idx:idx + 1000]
        assert "fetch" in block and "DELETE" in block, (
            "Reset button must call fetch with DELETE method to clear KV corrections"
        )


class TestCorrectionsSupportsBulkDelete:
    def test_delete_without_entity_id_deletes_key(self, corrections_ts):
        """corrections.ts DELETE handler must support bulk delete when no entityId."""
        assert "kv.del" in corrections_ts or "del(" in corrections_ts, (
            "corrections.ts must call kv.del(key) for bulk delete"
        )

    def test_bulk_delete_requires_confirmation(self, corrections_ts):
        """Bulk delete must require confirmBulkDelete flag."""
        assert "confirmBulkDelete" in corrections_ts or "bulkDelete" in corrections_ts, (
            "Bulk delete must require explicit confirmation flag to prevent accidental wipes"
        )
