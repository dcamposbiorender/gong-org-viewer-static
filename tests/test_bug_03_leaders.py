"""
Bug 3 (P1): Leaders showing "?,?"

Leader names should be actual names or null, not placeholder values like "?,?".
"""
import json
import pytest
from conftest import (
    extract_js_object,
    collect_all_nodes,
    get_index_html_path,
)


class TestLeaders:
    """Tests for Bug 3: Leaders showing ?,?."""

    def test_leader_names_not_question_marks(self):
        """Leader names should be actual names or null, not '?,?'."""
        index_path = get_index_html_path()

        with open(index_path) as f:
            content = f.read()

        data = extract_js_object(content, 'DATA')

        invalid_leaders = []
        for company, company_data in data.items():
            nodes = collect_all_nodes(company_data.get('root', {}))
            for node in nodes:
                leader = node.get('leader')
                if leader:
                    leader_name = leader.get('name', '')
                    leader_title = leader.get('title', '')

                    # Check for invalid placeholder values
                    invalid_values = ['?,?', '?', '??', 'unknown', 'Unknown', 'N/A', 'n/a']
                    if leader_name in invalid_values:
                        invalid_leaders.append({
                            'company': company,
                            'node': node.get('id'),
                            'leader_name': leader_name,
                            'leader_title': leader_title
                        })

        if invalid_leaders:
            pytest.fail(
                f"Found {len(invalid_leaders)} nodes with invalid leader names. "
                f"Examples: {invalid_leaders[:5]}"
            )

    def test_leader_structure_is_consistent(self):
        """Leader objects should have consistent structure."""
        index_path = get_index_html_path()

        with open(index_path) as f:
            content = f.read()

        data = extract_js_object(content, 'DATA')

        inconsistent = []
        for company, company_data in data.items():
            nodes = collect_all_nodes(company_data.get('root', {}))
            for node in nodes:
                leader = node.get('leader')
                if leader:
                    # Leader should be a dict with name and optionally title
                    if not isinstance(leader, dict):
                        inconsistent.append({
                            'company': company,
                            'node': node.get('id'),
                            'leader_type': type(leader).__name__
                        })
                    elif 'name' not in leader:
                        inconsistent.append({
                            'company': company,
                            'node': node.get('id'),
                            'leader_keys': list(leader.keys())
                        })

        if inconsistent:
            pytest.fail(
                f"Found {len(inconsistent)} nodes with inconsistent leader structure. "
                f"Examples: {inconsistent[:5]}"
            )

    def test_manual_data_has_leaders(self):
        """MANUAL_DATA should have some leaders.

        Leaders are defined in the manual map source files.
        """
        index_path = get_index_html_path()

        with open(index_path) as f:
            content = f.read()

        data = extract_js_object(content, 'MANUAL_DATA')

        # Count nodes with valid leaders
        leaders_found = 0
        total_nodes = 0
        for company, company_data in data.items():
            nodes = collect_all_nodes(company_data.get('root', {}))
            for node in nodes:
                total_nodes += 1
                leader = node.get('leader')
                if leader and leader.get('name'):
                    leaders_found += 1

        print(f"\nLeaders in MANUAL_DATA: {leaders_found}/{total_nodes} nodes")

        # At least some leaders should be present
        assert leaders_found > 0, (
            "No leaders found in MANUAL_DATA."
        )
