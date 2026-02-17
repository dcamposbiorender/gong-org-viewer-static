"""
Bug 5 (P1): Top stats empty

DATA[company].changes should have reorgs, leadership, size arrays populated.
These are shown in the top stats dashboard.
"""
import json
import pytest
from conftest import (
    extract_js_object,
    get_index_html_path,
)


class TestTopStats:
    """Tests for Bug 5: Top stats empty."""

    def test_data_has_changes_structure(self):
        """DATA[company] should have changes object with expected keys."""
        index_path = get_index_html_path()

        with open(index_path) as f:
            content = f.read()

        data = extract_js_object(content, 'DATA')

        for company, company_data in data.items():
            changes = company_data.get('changes')
            assert changes is not None, f"{company} missing 'changes' object"
            assert 'reorgs' in changes, f"{company} changes missing 'reorgs'"
            assert 'leadership' in changes, f"{company} changes missing 'leadership'"
            assert 'size' in changes, f"{company} changes missing 'size'"

    def test_data_has_stats_structure(self):
        """DATA[company] should have stats object with counts."""
        index_path = get_index_html_path()

        with open(index_path) as f:
            content = f.read()

        data = extract_js_object(content, 'DATA')

        for company, company_data in data.items():
            stats = company_data.get('stats')
            assert stats is not None, f"{company} missing 'stats' object"
            assert 'entities' in stats, f"{company} stats missing 'entities'"
            assert 'snippets' in stats, f"{company} stats missing 'snippets'"

    def test_at_least_some_company_has_stats_data(self):
        """At least one company should have non-zero stats in MANUAL_DATA."""
        index_path = get_index_html_path()

        with open(index_path) as f:
            content = f.read()

        data = extract_js_object(content, 'MANUAL_DATA')

        total_entities = 0
        total_snippets = 0

        for company, company_data in data.items():
            stats = company_data.get('stats', {})
            total_entities += stats.get('entities', 0)
            total_snippets += stats.get('snippets', 0)

        assert total_entities > 0, "No entities across all companies in MANUAL_DATA"
        assert total_snippets > 0, "No snippets across all companies in MANUAL_DATA"
