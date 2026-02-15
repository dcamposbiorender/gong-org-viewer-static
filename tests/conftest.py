"""
Shared test fixtures for GongOrgViewerStatic bug tests.
"""
import json
import re
import os
from pathlib import Path

# Project root
PROJECT_ROOT = Path(__file__).parent.parent


def extract_js_object(html_content_or_path: str, var_name: str) -> dict:
    """
    Extract a JavaScript object from a standalone JS file.

    Reads from public/js/ files based on var_name:
      DATA           -> public/js/data.js
      MANUAL_DATA    -> public/js/manual-data.js
      MATCH_REVIEW_DATA -> public/js/match-review-data.js

    The html_content_or_path parameter is ignored (kept for backward compat).
    """
    js_file_map = {
        'DATA': 'data.js',
        'MANUAL_DATA': 'manual-data.js',
        'MATCH_REVIEW_DATA': 'match-review-data.js',
    }

    filename = js_file_map.get(var_name)
    if not filename:
        raise ValueError(f"Unknown variable name: {var_name}")

    js_path = PROJECT_ROOT / 'public' / 'js' / filename
    if not js_path.exists():
        raise FileNotFoundError(
            f"Data file not found: {js_path}. "
            f"Run: python3 scripts/integrate_viewer.py --update"
        )

    content = js_path.read_text()

    # Strip the "const VAR_NAME = " prefix and trailing ";\n"
    pattern = rf'(?:const|let)\s+{var_name}\s*=\s*'
    match = re.search(pattern, content)
    if not match:
        raise ValueError(f"Could not find {var_name} in {js_path}")

    json_str = content[match.end():].rstrip().rstrip(';')

    # Remove trailing commas before } or ]
    json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)

    try:
        return json.loads(json_str)
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse {var_name} from {js_path}: {e}")


def collect_all_nodes(node: dict, nodes: list = None) -> list:
    """Recursively collect all nodes from a tree structure."""
    if nodes is None:
        nodes = []

    nodes.append(node)

    for child in node.get('children', []):
        collect_all_nodes(child, nodes)

    return nodes


def collect_all_snippets(node: dict, snippets: list = None) -> list:
    """Recursively collect all snippets from a tree structure."""
    if snippets is None:
        snippets = []

    # Check for snippets in various locations
    # In gong_evidence (snake_case - Python output)
    evidence = node.get('gong_evidence', {})
    if evidence and 'snippets' in evidence:
        snippets.extend(evidence['snippets'])

    # In gongEvidence (camelCase - JS/viewer)
    evidence_camel = node.get('gongEvidence', {})
    if evidence_camel and 'snippets' in evidence_camel:
        snippets.extend(evidence_camel['snippets'])

    # Direct snippets array (true auto map format)
    if 'snippets' in node and isinstance(node['snippets'], list):
        snippets.extend(node['snippets'])

    # Recurse into children
    for child in node.get('children', []):
        collect_all_snippets(child, snippets)

    return snippets


def count_nodes_with_snippets(node: dict, count: int = 0) -> int:
    """Count nodes that have at least one snippet."""
    has_snippets = False

    # Check gong_evidence.snippets
    evidence = node.get('gong_evidence', {})
    if evidence and evidence.get('snippets'):
        has_snippets = True

    # Check gongEvidence.snippets
    evidence_camel = node.get('gongEvidence', {})
    if evidence_camel and evidence_camel.get('snippets'):
        has_snippets = True

    # Check direct snippets
    if node.get('snippets') and len(node['snippets']) > 0:
        has_snippets = True

    if has_snippets:
        count += 1

    for child in node.get('children', []):
        count = count_nodes_with_snippets(child, count)

    return count


def get_index_html_path() -> Path:
    """Get path to index.html (now at project root for Vite)."""
    return PROJECT_ROOT / 'index.html'


def get_enriched_auto_map_path(company: str) -> Path:
    """Get path to enriched auto map for a company."""
    return PROJECT_ROOT / 'output' / f'{company}_enriched_auto_map.json'


def get_extraction_path(company: str) -> Path:
    """Get path to raw extraction for a company."""
    return PROJECT_ROOT / 'extractions' / company / 'entities_llm_v2.json'
