"""
Shared test fixtures for GongOrgViewerStatic bug tests.
"""
import json
import re
import os
from pathlib import Path

# Project root
PROJECT_ROOT = Path(__file__).parent.parent


def extract_js_object(html_content: str, var_name: str) -> dict:
    """
    Extract a JavaScript object/dict from HTML content.
    Looks for patterns like: const VAR_NAME = { ... };
    """
    # Pattern to find the variable declaration and capture the JSON object
    # Handle both const and let declarations
    pattern = rf'(?:const|let)\s+{var_name}\s*=\s*(\{{)'

    match = re.search(pattern, html_content)
    if not match:
        raise ValueError(f"Could not find variable {var_name} in HTML")

    start_idx = match.start(1)

    # Find the matching closing brace by counting braces
    brace_count = 0
    end_idx = start_idx
    in_string = False
    escape_next = False
    string_char = None

    for i, char in enumerate(html_content[start_idx:], start=start_idx):
        if escape_next:
            escape_next = False
            continue

        if char == '\\':
            escape_next = True
            continue

        if char in '"\'`' and not in_string:
            in_string = True
            string_char = char
            continue

        if in_string and char == string_char:
            in_string = False
            string_char = None
            continue

        if not in_string:
            if char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1
                if brace_count == 0:
                    end_idx = i + 1
                    break

    json_str = html_content[start_idx:end_idx]

    # Clean up JavaScript-specific syntax for JSON parsing
    # Remove trailing commas before } or ]
    json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)

    try:
        return json.loads(json_str)
    except json.JSONDecodeError as e:
        # If JSON parsing fails, try a more aggressive cleanup
        # This handles cases with JS comments or unquoted keys
        raise ValueError(f"Failed to parse {var_name} as JSON: {e}")


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
    """Get path to public/index.html."""
    return PROJECT_ROOT / 'public' / 'index.html'


def get_enriched_auto_map_path(company: str) -> Path:
    """Get path to enriched auto map for a company."""
    return PROJECT_ROOT / 'output' / f'{company}_enriched_auto_map.json'


def get_extraction_path(company: str) -> Path:
    """Get path to raw extraction for a company."""
    return PROJECT_ROOT / 'extractions' / company / 'entities_llm_v2.json'
