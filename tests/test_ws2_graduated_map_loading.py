"""
WS2 Tests: Graduated Map Loading from KV

Verifies that loadGraduatedMaps() fetches from KV (not just localStorage),
saveManualMapModifications() always persists to KV, and the company switch
handler reloads graduated maps.

These tests do static analysis of the JS code in index.html.
They should FAIL before WS2 implementation and PASS after.
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
    """Extract a JS function body by name (handles async functions too)."""
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


# --- Test 1: loadGraduatedMaps must be async ---

class TestLoadGraduatedMapsIsAsync:
    def test_function_is_declared_async(self, html_content):
        """loadGraduatedMaps must be async to await KV fetch."""
        func = extract_function(html_content, "loadGraduatedMaps")
        assert func.startswith("async function loadGraduatedMaps"), (
            "loadGraduatedMaps must be declared as async"
        )


# --- Test 2: loadGraduatedMaps fetches from KV ---

class TestLoadGraduatedMapsFetchesKV:
    def test_calls_graduated_map_api(self, html_content):
        """loadGraduatedMaps must fetch from /api/graduated-map."""
        func = extract_function(html_content, "loadGraduatedMaps")
        assert "graduated-map" in func and "fetch" in func, (
            "loadGraduatedMaps must fetch from the graduated-map API endpoint"
        )

    def test_kv_takes_precedence(self, html_content):
        """KV data must be applied AFTER localStorage (KV wins on conflict)."""
        func = extract_function(html_content, "loadGraduatedMaps")
        # The function should fetch from KV. If it also reads localStorage,
        # the KV fetch must come after (or replace) the localStorage read.
        fetch_pos = func.find("fetch")
        assert fetch_pos > 0, "Must contain a fetch call to KV"


# --- Test 3: loadGraduatedMaps sets graduatedMaps localStorage flag ---

class TestLoadGraduatedMapsSetsFlag:
    def test_sets_graduated_maps_localstorage(self, html_content):
        """After loading from KV, must set graduatedMaps in localStorage
        so that subsequent saveManualMapModifications calls sync to KV."""
        func = extract_function(html_content, "loadGraduatedMaps")
        assert "localStorage.setItem" in func and "graduatedMaps" in func, (
            "loadGraduatedMaps must set graduatedMaps in localStorage after KV load"
        )


# --- Test 4: saveManualMapModifications always saves to KV ---

class TestSaveAlwaysSyncsToKV:
    def test_no_graduated_maps_gate(self, html_content):
        """saveManualMapModifications must NOT gate KV sync on graduatedMaps[company].
        It should always attempt to sync to KV."""
        func = extract_function(html_content, "saveManualMapModifications")
        # The old code had: if (graduatedMaps[currentCompany]) { ...KV sync... }
        # After fix, the KV sync should NOT be inside a graduatedMaps check.
        # Look for the fetch call to graduated-map — it must exist
        assert "graduated-map" in func and "fetch" in func, (
            "saveManualMapModifications must sync to KV via graduated-map endpoint"
        )
        # The fetch should NOT be gated by a graduatedMaps[...] check
        # Find the fetch line and check it's not inside a graduatedMaps conditional
        lines = func.split("\n")
        fetch_line_idx = None
        for idx, line in enumerate(lines):
            if "fetch" in line and "graduated-map" in line:
                fetch_line_idx = idx
                break
        assert fetch_line_idx is not None, "Must have fetch to graduated-map"

        # Check the 5 lines before the fetch — none should be an
        # if-conditional on graduatedMaps[currentCompany]
        preceding = "\n".join(lines[max(0, fetch_line_idx - 5) : fetch_line_idx])
        # Assignment like `graduatedMaps[currentCompany] = ...` is fine.
        # What's NOT fine is `if (graduatedMaps[currentCompany])` gating the fetch.
        assert "if (graduatedMaps[currentCompany])" not in preceding and \
               "if(graduatedMaps[currentCompany])" not in preceding, (
            "KV sync must NOT be gated by if (graduatedMaps[currentCompany]) check. "
            "All companies should sync to KV unconditionally."
        )


# --- Test 5: Company switch handler reloads graduated maps ---

class TestCompanySwitchReloadsGraduatedMaps:
    def test_company_select_loads_graduated_map(self, html_content):
        """The companySelect change handler must reload graduated maps from KV."""
        # Find the companySelect change handler
        pattern = r"companySelect.*addEventListener\('change'.*?\}\);"
        # Use a broader extraction — find the event listener block
        idx = html_content.find("companySelect').addEventListener('change'")
        assert idx > 0, "companySelect change handler must exist"

        # Extract ~50 lines after
        block = html_content[idx : idx + 2000]
        assert "loadGraduatedMaps" in block or "graduated-map" in block, (
            "Company switch handler must reload graduated maps from KV. "
            "Currently it loads match-review, overrides, sizes, field-edits, "
            "merges — but NOT graduated maps."
        )


# --- Test 6: Init sequence awaits loadGraduatedMaps ---

class TestInitSequence:
    def test_init_awaits_graduated_maps(self, html_content):
        """The init sequence must await loadGraduatedMaps since it's now async."""
        # Find the init block — may be "// Initialize" or "// Initialize (async IIFE..."
        init_pattern = r"// Initialize[^\n]*\n(.*?)(?:// (?:Sync currentCompany|Update duplicates)|setTimeout\(updateDuplicatesBadge)"
        match = re.search(init_pattern, html_content, re.DOTALL)
        assert match, "Init block must exist"
        init_block = match.group(0)
        assert "loadGraduatedMaps" in init_block, (
            "Init must call loadGraduatedMaps"
        )
        # If it's async, it should be awaited or in a .then() chain or async IIFE
        if "async" in extract_function(html_content, "loadGraduatedMaps"):
            has_await = "await" in init_block and "loadGraduatedMaps" in init_block
            has_then = "loadGraduatedMaps().then" in init_block
            has_async_iife = "async" in init_block
            assert has_await or has_then or has_async_iife, (
                "loadGraduatedMaps is async but not awaited in init sequence. "
                "Use await or wrap init in an async IIFE."
            )
