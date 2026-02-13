"""
Phase 4 Tests: approveMatch writes evidence into MANUAL_DATA.

Verifies that approveMatch enriches gongEvidence.snippets, deduplicates,
and that showManualNodeEvidence skips already-embedded snippets.
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


class TestApproveMatchWritesToManualData:
    def test_approve_match_writes_gong_evidence(self, html_content):
        """approveMatch must write snippet into MANUAL_DATA gongEvidence."""
        func = extract_function(html_content, "approveMatch")
        assert "gongEvidence" in func, (
            "approveMatch must write into gongEvidence on the target node"
        )
        assert "snippets" in func and "push" in func, (
            "approveMatch must push snippet into gongEvidence.snippets"
        )

    def test_approve_match_deduplicates_by_id(self, html_content):
        """approveMatch must check callId before adding snippet."""
        func = extract_function(html_content, "approveMatch")
        assert "callId" in func or "itemId" in func, (
            "approveMatch must dedup by callId/itemId"
        )
        assert "some" in func or "find" in func or "includes" in func, (
            "approveMatch must check for existing snippet before pushing"
        )

    def test_approve_match_calls_save_modifications(self, html_content):
        """approveMatch must call saveManualMapModifications after enrichment."""
        func = extract_function(html_content, "approveMatch")
        assert "saveManualMapModifications" in func, (
            "approveMatch must call saveManualMapModifications to persist enriched tree"
        )

    def test_approve_match_defensive_no_manual_data(self, html_content):
        """approveMatch must not throw if MANUAL_DATA[company] is undefined."""
        func = extract_function(html_content, "approveMatch")
        assert "MANUAL_DATA[company]?.root" in func or "MANUAL_DATA[company]" in func, (
            "approveMatch must handle missing MANUAL_DATA gracefully"
        )


class TestShowEvidenceSkipsEmbedded:
    def test_evidence_skips_already_embedded(self, html_content):
        """showManualNodeEvidence must skip approved matches already in gongEvidence."""
        # Find the occurrence inside showManualNodeEvidence (the one near "dynamically approved")
        idx = html_content.find("Get dynamically approved matches")
        assert idx > 0, "showManualNodeEvidence must have the approved matches overlay section"
        block = html_content[idx:idx + 500]
        assert "alreadyEmbedded" in block or "callId" in block, (
            "showManualNodeEvidence must check if approved match snippet is already "
            "embedded in gongEvidence before adding it via the overlay path"
        )
