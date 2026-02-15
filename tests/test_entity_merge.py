"""
Tests for Entity Merge & Alias feature — HTML element verification only.

JS function tests have been migrated to Vitest (src/tree-ops.test.ts and future
entity-merge.test.ts). This file only verifies that HTML elements exist in index.html.
"""
import re
from conftest import get_index_html_path


def get_html():
    """Read index.html for HTML element checks."""
    return get_index_html_path().read_text(encoding='utf-8')


# --- HTML Element Tests (still valid after migration to TS modules) ---

class TestMergeTabRendering:
    """Merge tab HTML elements exist in index.html."""

    def test_merge_tab_button_exists(self):
        html = get_html()
        assert 'mergeEntityTab' in html, "Missing merge tab button"

    def test_merge_pane_exists(self):
        html = get_html()
        assert 'mergeEntityPane' in html, "Missing merge pane container"

    def test_existing_tabs_unaffected(self):
        html = get_html()
        assert 'createEntityTab' in html
        assert 'deleteEntityTab' in html


class TestEntityPickers:
    """Entity picker search inputs exist."""

    def test_merge_entity_a_search_exists(self):
        html = get_html()
        assert 'mergeEntityASearch' in html

    def test_merge_entity_b_search_exists(self):
        html = get_html()
        assert 'mergeEntityBSearch' in html


class TestMergePreview:
    def test_merge_preview_panel_exists(self):
        html = get_html()
        assert 'mergePreviewPanel' in html


class TestAliasChips:
    """Verify no inline onclick for alias chips (security requirement)."""

    def test_no_inline_onclick_for_aliases(self):
        html = get_html()
        # The alias section should not have inline onclick handlers
        # (aliases are rendered dynamically by JS, not in static HTML)
        assert 'onclick="removeAlias' not in html, "Found inline onclick for removeAlias"
        assert 'onclick="addAlias' not in html, "Found inline onclick for addAlias"
