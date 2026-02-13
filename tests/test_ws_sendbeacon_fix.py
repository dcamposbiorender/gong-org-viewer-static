"""
Phase 1A Tests: sendBeacon must use Blob with application/json Content-Type.

sendBeacon(url, string) sends text/plain, which Vercel's body parser rejects.
sendBeacon(url, Blob([json], {type: 'application/json'})) sends the correct type.
"""
import re
import pytest
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
INDEX_HTML = PROJECT_ROOT / "public" / "index.html"


@pytest.fixture
def html_content():
    return INDEX_HTML.read_text(encoding="utf-8")


class TestSendBeaconUsesBlob:
    def test_all_sendbeacon_calls_use_blob(self, html_content):
        """Every navigator.sendBeacon call must use Blob, not raw JSON.stringify."""
        # Find all sendBeacon calls — match from sendBeacon( to its closing );
        # allowing nested parens via a broad dotall match
        beacon_starts = [m.start() for m in re.finditer(r"navigator\.sendBeacon\(", html_content)]
        assert len(beacon_starts) >= 2, (
            f"Expected at least 2 sendBeacon calls, found {len(beacon_starts)}"
        )
        for start in beacon_starts:
            # Extract ~300 chars after the sendBeacon( to capture the full call
            snippet = html_content[start:start + 300]
            assert "Blob" in snippet, (
                f"sendBeacon call must use Blob wrapper for JSON content type.\n"
                f"Found: {snippet[:200]}"
            )

    def test_no_raw_stringify_in_sendbeacon(self, html_content):
        """sendBeacon must not receive raw JSON.stringify output directly."""
        # Pattern: sendBeacon(url, JSON.stringify(...)) without Blob wrapper
        raw_pattern = r"navigator\.sendBeacon\(\s*[^,]+,\s*JSON\.stringify\("
        matches = re.findall(raw_pattern, html_content)
        assert len(matches) == 0, (
            f"Found {len(matches)} sendBeacon calls with raw JSON.stringify. "
            "Must wrap in new Blob([JSON.stringify(...)], {{ type: 'application/json' }})"
        )
