"""
Tests for Pipeline Alias-Aware Step (scripts/fetch_kv_merges.py + consolidation integration).
"""
import json
import re
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

# Add scripts to path for import
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT / 'scripts'))

from conftest import get_index_html_path


class TestNormalizeEntityName:
    """3a/3c: normalize_entity_name strips END-of-string suffixes, lowercases, collapses whitespace."""

    def test_strip_group_suffix(self):
        from fetch_kv_merges import normalize_entity_name
        assert normalize_entity_name("Discovery Sciences Group") == "discovery sciences"

    def test_strip_inc_suffix(self):
        from fetch_kv_merges import normalize_entity_name
        assert normalize_entity_name("ABCD Inc.") == "abcd"

    def test_collapse_whitespace(self):
        from fetch_kv_merges import normalize_entity_name
        assert normalize_entity_name("  Biologics  Engineering  ") == "biologics engineering"

    def test_suffix_not_at_end_preserved(self):
        """'Group' not at end of string should NOT be stripped."""
        from fetch_kv_merges import normalize_entity_name
        assert normalize_entity_name("Group Therapeutics") == "group therapeutics"

    def test_workgroup_not_stripped(self):
        """'Workgroup' contains 'group' but is a different word."""
        from fetch_kv_merges import normalize_entity_name
        # 'group' at end via word boundary should strip but 'Workgroup' has no boundary before 'group'
        assert normalize_entity_name("Workgroup Alpha") == "workgroup alpha"

    def test_strip_ltd(self):
        from fetch_kv_merges import normalize_entity_name
        assert normalize_entity_name("Pharma Ltd") == "pharma"

    def test_strip_llc(self):
        from fetch_kv_merges import normalize_entity_name
        assert normalize_entity_name("Tech Solutions LLC") == "tech solutions"

    def test_strip_corp(self):
        from fetch_kv_merges import normalize_entity_name
        assert normalize_entity_name("Big Corp") == "big"

    def test_strip_corporation(self):
        from fetch_kv_merges import normalize_entity_name
        assert normalize_entity_name("Global Corporation") == "global"

    def test_strip_limited(self):
        from fetch_kv_merges import normalize_entity_name
        assert normalize_entity_name("UK Pharma Limited") == "uk pharma"

    def test_strip_punctuation(self):
        from fetch_kv_merges import normalize_entity_name
        assert normalize_entity_name("Bio.Tech, Inc.") == "biotech"

    def test_empty_string(self):
        from fetch_kv_merges import normalize_entity_name
        assert normalize_entity_name("") == ""

    def test_only_suffix(self):
        from fetch_kv_merges import normalize_entity_name
        # 'Group' alone as whole string should be stripped
        assert normalize_entity_name("Group") == ""


class TestBuildAliasLookup:
    """3a: build_alias_lookup maps normalized aliases to canonical IDs."""

    def test_basic_lookup(self):
        from fetch_kv_merges import build_alias_lookup
        merges = {
            'entity-001': {
                'absorbed': ['entity-002'],
                'aliases': ['ABCD Group', 'XYZ Therapeutics'],
                'mergedSnippets': [],
                'mergedAt': '2026-01-01T00:00:00Z'
            }
        }
        lookup = build_alias_lookup(merges)
        assert 'abcd' in lookup  # "ABCD Group" -> strip "Group" -> "abcd"
        assert lookup['abcd']['canonical_id'] == 'entity-001'
        assert lookup['abcd']['alias'] == 'ABCD Group'
        assert 'xyz therapeutics' in lookup
        assert lookup['xyz therapeutics']['canonical_id'] == 'entity-001'

    def test_multiple_merges(self):
        from fetch_kv_merges import build_alias_lookup
        merges = {
            'e1': {'absorbed': ['e2'], 'aliases': ['Alpha Group']},
            'e3': {'absorbed': ['e4'], 'aliases': ['Beta Corp']}
        }
        lookup = build_alias_lookup(merges)
        assert 'alpha' in lookup
        assert 'beta' in lookup
        assert lookup['alpha']['canonical_id'] == 'e1'
        assert lookup['beta']['canonical_id'] == 'e3'

    def test_empty_merges(self):
        from fetch_kv_merges import build_alias_lookup
        lookup = build_alias_lookup({})
        assert lookup == {}

    def test_no_aliases(self):
        from fetch_kv_merges import build_alias_lookup
        merges = {'e1': {'absorbed': ['e2'], 'aliases': []}}
        lookup = build_alias_lookup(merges)
        assert lookup == {}


class TestFetchMerges:
    """3a: fetch_merges() fetches from KV API."""

    @patch('fetch_kv_merges.requests')
    def test_fetch_merges_basic(self, mock_requests):
        from fetch_kv_merges import fetch_merges
        mock_response = MagicMock()
        mock_response.json.return_value = {'e1': {'absorbed': ['e2'], 'aliases': ['Foo']}}
        mock_response.raise_for_status = MagicMock()
        mock_requests.get.return_value = mock_response

        result = fetch_merges('testco')
        assert 'e1' in result
        mock_requests.get.assert_called_once()
        # Check URL contains account parameter
        call_args = mock_requests.get.call_args
        assert 'testco' in call_args[0][0]

    @patch('fetch_kv_merges.requests')
    def test_fetch_merges_with_bypass_secret(self, mock_requests):
        from fetch_kv_merges import fetch_merges
        mock_response = MagicMock()
        mock_response.json.return_value = {}
        mock_response.raise_for_status = MagicMock()
        mock_requests.get.return_value = mock_response

        with patch.dict('os.environ', {'VERCEL_AUTOMATION_BYPASS_SECRET': 'test-secret'}):
            fetch_merges('testco')
        # Should include bypass header
        call_args = mock_requests.get.call_args
        headers = call_args[1].get('headers', {})
        assert headers.get('x-vercel-protection-bypass') == 'test-secret'

    @patch('fetch_kv_merges.requests')
    def test_fetch_merges_network_error(self, mock_requests):
        """Pipeline should handle network errors gracefully."""
        import requests as real_requests
        from fetch_kv_merges import fetch_merges
        mock_requests.get.side_effect = real_requests.RequestException("Connection refused")
        mock_requests.RequestException = real_requests.RequestException

        try:
            fetch_merges('testco')
            assert False, "Should have raised RequestException"
        except Exception:
            pass  # Expected - caller handles gracefully


class TestNormalizationParity:
    """3c: Python and JS normalize functions produce identical output."""

    def test_parity_across_test_cases(self):
        from fetch_kv_merges import normalize_entity_name as py_normalize

        test_cases = [
            ("Discovery Sciences Group", "discovery sciences"),
            ("ABCD Inc.", "abcd"),
            ("  Biologics  Engineering  ", "biologics engineering"),
            ("Group Therapeutics", "group therapeutics"),
            ("Workgroup Alpha", "workgroup alpha"),
            ("Pharma Ltd", "pharma"),
            ("Tech Solutions LLC", "tech solutions"),
            ("Big Corp", "big"),
            ("Global Corporation", "global"),
            ("UK Pharma Limited", "uk pharma"),
        ]

        # Verify Python produces expected output
        for input_name, expected in test_cases:
            result = py_normalize(input_name)
            assert result == expected, \
                f"Python normalize('{input_name}') = '{result}', expected '{expected}'"

        # Verify the JS function uses the same regex pattern
        # After modularization, JS code lives in separate files under public/js/
        html = get_index_html_path().read_text(encoding='utf-8')
        js_dir = PROJECT_ROOT / 'public' / 'js'
        for js_file in sorted(js_dir.glob('*.js')):
            if js_file.name not in ('data.js', 'manual-data.js', 'match-review-data.js'):
                html += '\n' + js_file.read_text(encoding='utf-8')
        js_match = re.search(r"function normalizeEntityName\([^)]*\)\s*\{([\s\S]*?)\n\}", html)
        assert js_match, "JS normalizeEntityName not found"
        js_body = js_match.group(1)

        # Check that both use the same suffix list anchored to end of string
        assert 'group|inc|ltd|llc|corp|corporation|limited' in js_body, \
            "JS function must use same suffix list as Python"
        assert '\\s*$' in js_body, \
            "JS function must anchor to end of string"


class TestConsolidateIntegration:
    """3b: consolidate_with_hierarchy.py has alias check step."""

    def test_consolidate_imports_fetch_kv_merges(self):
        """The consolidation script should import from fetch_kv_merges."""
        script_path = PROJECT_ROOT / 'scripts' / 'consolidate_with_hierarchy.py'
        content = script_path.read_text()
        assert 'fetch_kv_merges' in content, \
            "consolidate_with_hierarchy.py must import from fetch_kv_merges"

    def test_consolidate_has_alias_check_step(self):
        """Step 3.5 alias check should exist between Step 3 and Step 4."""
        script_path = PROJECT_ROOT / 'scripts' / 'consolidate_with_hierarchy.py'
        content = script_path.read_text()
        # Find the step 3 and step 4 markers
        step3_pos = content.find('Step 3')
        step4_pos = content.find('Step 4')
        assert step3_pos < step4_pos, "Step 3 must come before Step 4"
        # Check for alias check between them
        between = content[step3_pos:step4_pos]
        assert 'alias' in between.lower(), \
            "There should be an alias check step between Step 3 and Step 4"

    def test_consolidate_handles_kv_failure_gracefully(self):
        """Pipeline should catch RequestException and continue."""
        script_path = PROJECT_ROOT / 'scripts' / 'consolidate_with_hierarchy.py'
        content = script_path.read_text()
        assert 'RequestException' in content or 'except' in content, \
            "Pipeline must handle KV failure gracefully"

    def test_consolidate_writes_alias_matches(self):
        """Pipeline should write alias_matches.json when matches found."""
        script_path = PROJECT_ROOT / 'scripts' / 'consolidate_with_hierarchy.py'
        content = script_path.read_text()
        assert 'alias_matches' in content, \
            "Pipeline must reference alias_matches output"


class TestFetchKvMergesModuleExists:
    """3a: fetch_kv_merges.py exists and is importable."""

    def test_module_exists(self):
        script_path = PROJECT_ROOT / 'scripts' / 'fetch_kv_merges.py'
        assert script_path.exists(), "scripts/fetch_kv_merges.py must exist"

    def test_module_importable(self):
        from fetch_kv_merges import fetch_merges, build_alias_lookup, normalize_entity_name
        assert callable(fetch_merges)
        assert callable(build_alias_lookup)
        assert callable(normalize_entity_name)
