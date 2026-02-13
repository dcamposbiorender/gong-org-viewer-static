"""
Phase 1B Tests: manualMapOverrides KV persistence with company-scoped keys.

Verifies saveManualMapOverrides syncs to KV and loadManualMapOverrides fetches from KV.
"""
import re
import pytest
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
INDEX_HTML = PROJECT_ROOT / "public" / "index.html"


@pytest.fixture
def html_content():
    return INDEX_HTML.read_text(encoding="utf-8")


def extract_function(html: str, func_name: str) -> str:
    pattern = rf"(?:async\s+)?function\s+{func_name}\s*\([^)]*\)\s*\{{"
    match = re.search(pattern, html)
    if not match:
        raise ValueError(f"Function {func_name} not found")
    start = match.start()
    brace_count = 0
    in_string = False
    escape_next = False
    string_char = None
    for i, char in enumerate(html[match.end() - 1:], start=match.end() - 1):
        if escape_next:
            escape_next = False
            continue
        if char == "\\":
            escape_next = True
            continue
        if char in "\"'`" and not in_string:
            in_string = True
            string_char = char
            continue
        if in_string and char == string_char:
            in_string = False
            continue
        if not in_string:
            if char == "{":
                brace_count += 1
            elif char == "}":
                brace_count -= 1
                if brace_count == 0:
                    return html[start : i + 1]
    raise ValueError(f"Could not find end of function {func_name}")


class TestSaveManualMapOverridesSyncsToKV:
    def test_save_calls_kv_api(self, html_content):
        """saveManualMapOverrides must POST to KV, not just localStorage."""
        func = extract_function(html_content, "saveManualMapOverrides")
        assert "fetch" in func, (
            "saveManualMapOverrides must call fetch to sync to KV"
        )

    def test_save_uses_company_scoped_key(self, html_content):
        """localStorage key must be company-scoped."""
        func = extract_function(html_content, "saveManualMapOverrides")
        assert "currentCompany" in func or "company" in func, (
            "saveManualMapOverrides must use company-scoped localStorage key"
        )


class TestLoadManualMapOverridesFetchesKV:
    def test_load_is_async(self, html_content):
        """loadManualMapOverrides must be async to await KV fetch."""
        func = extract_function(html_content, "loadManualMapOverrides")
        assert func.startswith("async function loadManualMapOverrides"), (
            "loadManualMapOverrides must be async"
        )

    def test_load_fetches_from_kv(self, html_content):
        """loadManualMapOverrides must fetch from KV."""
        func = extract_function(html_content, "loadManualMapOverrides")
        assert "fetch" in func, (
            "loadManualMapOverrides must fetch from KV"
        )

    def test_load_clears_previous_company(self, html_content):
        """loadManualMapOverrides must clear previous company's overrides."""
        func = extract_function(html_content, "loadManualMapOverrides")
        assert "manualMapOverrides = {}" in func or "manualMapOverrides = " in func, (
            "loadManualMapOverrides must clear previous company state"
        )
