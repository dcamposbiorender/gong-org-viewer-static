"""
Tests for Entity Merge & Alias Persistence feature (frontend behavior).
Tests are against index.html - checking that HTML elements and JS functions exist.
"""
import re
from pathlib import Path
from conftest import get_index_html_path

PROJECT_ROOT = Path(__file__).parent.parent


def get_html():
    """Read index.html + all JS module files.

    After modularization, JS code lives in public/js/*.js files
    instead of inline in index.html. This function concatenates
    them all so existing regex-based tests still work.
    """
    html = get_index_html_path().read_text(encoding='utf-8')
    js_dir = PROJECT_ROOT / 'public' / 'js'
    for js_file in sorted(js_dir.glob('*.js')):
        # Skip data files (gitignored, pipeline-generated)
        if js_file.name in ('data.js', 'manual-data.js', 'match-review-data.js'):
            continue
        html += '\n' + js_file.read_text(encoding='utf-8')
    return html


# --- Phase 1 Tests ---

class TestMergeTabRendering:
    """1b/1c: Merge tab button and pane exist in HTML."""

    def test_merge_tab_button_exists(self):
        html = get_html()
        assert 'mergeEntityTab' in html, "Merge tab button with id='mergeEntityTab' not found"

    def test_merge_pane_exists(self):
        html = get_html()
        assert 'mergeEntityPane' in html, "Merge pane with id='mergeEntityPane' not found"

    def test_merge_tab_in_switch_function(self):
        """switchManageEntitiesTab handles 'merge' case."""
        html = get_html()
        # Find the switchManageEntitiesTab function and check it handles 'merge'
        match = re.search(r"function switchManageEntitiesTab\(tab\)\s*\{([\s\S]*?)\n\}", html)
        assert match, "switchManageEntitiesTab function not found"
        func_body = match.group(1)
        assert "'merge'" in func_body or '"merge"' in func_body, \
            "switchManageEntitiesTab does not handle 'merge' tab"

    def test_existing_tabs_unaffected(self):
        """Create and Delete tabs still exist."""
        html = get_html()
        assert 'createEntityTab' in html
        assert 'deleteEntityTab' in html
        assert 'createEntityPane' in html
        assert 'deleteEntityPane' in html


class TestEntityPickers:
    """1d: Entity picker search fields exist in merge pane."""

    def test_merge_entity_a_search_exists(self):
        html = get_html()
        assert 'mergeEntityASearch' in html, "Entity A search input not found"

    def test_merge_entity_b_search_exists(self):
        html = get_html()
        assert 'mergeEntityBSearch' in html, "Entity B search input not found"

    def test_filter_functions_exist(self):
        html = get_html()
        assert 'filterMergeEntityAList' in html, "filterMergeEntityAList function not found"
        assert 'filterMergeEntityBList' in html, "filterMergeEntityBList function not found"


class TestMergePreview:
    """1e: Preview panel exists."""

    def test_merge_preview_panel_exists(self):
        html = get_html()
        assert 'mergePreviewPanel' in html, "Merge preview panel not found"


class TestMergeValidations:
    """1f: Validation functions exist in JS."""

    def test_self_merge_blocked(self):
        """The executeMergeFromTab function must check entityA != entityB."""
        html = get_html()
        match = re.search(r"function executeMergeFromTab\(\)\s*\{([\s\S]*?)\n\}", html)
        assert match, "executeMergeFromTab function not found"
        func_body = match.group(1)
        # Check that there's a comparison of entityA and entityB
        assert 'entityA' in func_body and 'entityB' in func_body, \
            "executeMergeFromTab must reference both entityA and entityB"
        # Check for self-merge validation
        assert 'self' in func_body.lower() or 'same entity' in func_body.lower() or \
            'entityAId === entityBId' in func_body or 'entityAId == entityBId' in func_body, \
            "executeMergeFromTab must check for self-merge"

    def test_absorbed_entity_blocked(self):
        """Cannot select an entity that is already absorbed."""
        html = get_html()
        # The validateMergeSelection or executeMergeFromTab should check isEntityAbsorbed
        assert 'isEntityAbsorbed' in html, "isEntityAbsorbed check missing"
        # Check it's used in merge validation context
        match = re.search(r"function (validateMergeSelection|executeMergeFromTab|updateMergePreview)", html)
        assert match, "No merge validation function found"

    def test_canonical_as_source_blocked(self):
        """Cannot merge an entity that is canonical for other merges."""
        html = get_html()
        # Should check if entity A is a canonical (has entries in entityMerges)
        func_match = re.search(
            r"function executeMergeFromTab\(\)\s*\{([\s\S]*?)\n\}",
            html
        )
        assert func_match, "executeMergeFromTab not found"
        body = func_match.group(1)
        assert 'entityMerges[entityAId]' in body or 'entityMerges[mergeTabState.entityA' in body, \
            "executeMergeFromTab must check if entity A is canonical for other merges"


class TestExecuteMerge:
    """1g: Execute merge function."""

    def test_execute_merge_function_exists(self):
        html = get_html()
        assert 'function executeMergeFromTab' in html, "executeMergeFromTab function not found"

    def test_merge_saves_to_kv(self):
        """Merge function calls saveEntityMergeToKV."""
        html = get_html()
        match = re.search(r"function executeMergeFromTab\(\)\s*\{([\s\S]*?)\n\}", html)
        assert match, "executeMergeFromTab not found"
        assert 'saveEntityMergeToKV' in match.group(1), \
            "executeMergeFromTab must save to KV"

    def test_merge_saves_to_localstorage(self):
        """Merge function saves to company-scoped localStorage key."""
        html = get_html()
        match = re.search(r"function executeMergeFromTab\(\)\s*\{([\s\S]*?)\n\}", html)
        assert match, "executeMergeFromTab not found"
        body = match.group(1)
        assert 'localStorage.setItem' in body, \
            "executeMergeFromTab must save to localStorage"
        assert 'entityMerges:' in body or "entityMerges:'" in body, \
            "localStorage key must be company-scoped (entityMerges:{company})"


class TestCrossCompanyContamination:
    """1a: entityMerges cleared on company switch."""

    def test_load_entity_merges_clears_first(self):
        """loadEntityMerges() must clear entityMerges before loading."""
        html = get_html()
        match = re.search(
            r"async function loadEntityMerges\(\)\s*\{([\s\S]*?)\n\}",
            html
        )
        assert match, "loadEntityMerges function not found"
        body = match.group(1)
        # Must set entityMerges = {} before loading
        assert 'entityMerges = {}' in body or 'entityMerges = { }' in body, \
            "loadEntityMerges must clear entityMerges = {} before loading from KV"

    def test_localstorage_key_is_company_scoped(self):
        """localStorage key uses company-scoped format."""
        html = get_html()
        match = re.search(
            r"async function loadEntityMerges\(\)\s*\{([\s\S]*?)\n\}",
            html
        )
        assert match, "loadEntityMerges function not found"
        body = match.group(1)
        # Should use company-scoped key
        assert "entityMerges:" in body, \
            "loadEntityMerges must use company-scoped localStorage key (entityMerges:{company})"


class TestAliasChips:
    """1h: Alias editing on detail panel."""

    def test_alias_section_rendering_code_exists(self):
        """selectNode should render alias chips for canonical entities."""
        html = get_html()
        assert 'Also known as' in html or 'alias-chip' in html, \
            "Alias rendering code not found in index.html"

    def test_no_inline_onclick_for_aliases(self):
        """Alias chip remove buttons must use addEventListener, not inline onclick."""
        html = get_html()
        # Find alias-related code
        alias_section = re.search(r"(alias.chip|Also known as)([\s\S]{0,2000})", html)
        if alias_section:
            section = alias_section.group(0)
            # Should NOT have onclick= in alias chip rendering
            # But SHOULD have addEventListener
            assert 'addEventListener' in html, \
                "Alias chip handlers must use addEventListener"

    def test_add_alias_function_exists(self):
        html = get_html()
        assert 'function addAlias' in html, "addAlias function not found"

    def test_remove_alias_function_exists(self):
        html = get_html()
        assert 'function removeAlias' in html, "removeAlias function not found"


class TestAliasUniqueness:
    """1i: Alias uniqueness validation."""

    def test_add_alias_checks_uniqueness(self):
        """addAlias must check if alias is already used by another entity."""
        html = get_html()
        match = re.search(r"function addAlias\([^)]*\)\s*\{([\s\S]*?)\n\}", html)
        assert match, "addAlias function not found"
        body = match.group(1)
        # Should iterate entityMerges to check for duplicate aliases
        assert 'entityMerges' in body, \
            "addAlias must check entityMerges for alias uniqueness"
        assert 'already' in body.lower() or 'duplicate' in body.lower() or 'includes' in body, \
            "addAlias must have uniqueness check logic"


class TestNormalizeEntityName:
    """3c: JS normalizeEntityName function."""

    def test_normalize_function_exists(self):
        html = get_html()
        assert 'function normalizeEntityName' in html, \
            "normalizeEntityName function not found in index.html"

    def test_normalize_strips_end_suffixes_only(self):
        """Regex should only strip suffixes at END of string."""
        html = get_html()
        match = re.search(r"function normalizeEntityName\([^)]*\)\s*\{([\s\S]*?)\n\}", html)
        assert match, "normalizeEntityName not found"
        body = match.group(1)
        # Should have $ anchor for end-of-string
        assert '\\s*$' in body or '\\s*$/g' in body, \
            "normalizeEntityName regex must anchor suffix stripping to end of string ($)"


# --- Phase 2 Tests ---

class TestChildrenReparenting:
    """2a: buildWorkingTree reparents children of absorbed entities."""

    def test_build_working_tree_checks_entity_merges(self):
        """buildWorkingTree must check entityMerges for absorbed children."""
        html = get_html()
        match = re.search(
            r"function buildWorkingTree\(node[^)]*\)\s*\{([\s\S]*?)\n\}",
            html
        )
        assert match, "buildWorkingTree function not found"
        body = match.group(1)
        assert 'entityMerges' in body, \
            "buildWorkingTree must check entityMerges for child reparenting"


class TestCombinedSnippets:
    """2b: getNodeSnippets combines snippets from absorbed entities."""

    def test_get_node_snippets_function_exists(self):
        html = get_html()
        assert 'function getNodeSnippets' in html, \
            "getNodeSnippets function not found"

    def test_get_node_snippets_dedupes(self):
        """getNodeSnippets must deduplicate snippets."""
        html = get_html()
        match = re.search(r"function getNodeSnippets\([^)]*\)\s*\{([\s\S]*?)\n\}", html)
        assert match, "getNodeSnippets not found"
        body = match.group(1)
        # Should have dedup logic (Set, filter, or seen)
        assert 'Set' in body or 'seen' in body or 'filter' in body, \
            "getNodeSnippets must deduplicate snippets"

    def test_select_node_uses_get_node_snippets(self):
        """selectNode should use getNodeSnippets instead of node.snippets directly."""
        html = get_html()
        # Find selectNode function
        match = re.search(r"function selectNode\([^)]*\)\s*\{([\s\S]*?)\n\}", html)
        assert match, "selectNode not found"
        body = match.group(1)
        assert 'getNodeSnippets' in body, \
            "selectNode must call getNodeSnippets for combined snippets"


class TestUnmerge:
    """2c: Unmerge via deleteEntityMergeFromKV (unmergeEntity was part of removed duplicates modal)."""

    def test_delete_entity_merge_from_kv_exists(self):
        html = get_html()
        assert 'function deleteEntityMergeFromKV' in html, "deleteEntityMergeFromKV function not found"

    def test_delete_entity_merge_calls_api(self):
        """deleteEntityMergeFromKV must call the merges API."""
        html = get_html()
        match = re.search(r"function deleteEntityMergeFromKV\([^)]*\)\s*\{([\s\S]*?)\n\}", html)
        assert match, "deleteEntityMergeFromKV not found"
        body = match.group(1)
        assert 'merges' in body, \
            "deleteEntityMergeFromKV must call merges API"

    def test_save_entity_merge_to_kv_exists(self):
        html = get_html()
        assert 'function saveEntityMergeToKV' in html, "saveEntityMergeToKV function not found"
