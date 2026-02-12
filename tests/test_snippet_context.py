"""
Tests for snippet context extraction feature.

Tests the find_context() function that locates snippet quotes in transcripts
and extracts surrounding context windows.
"""
import sys
from pathlib import Path

# Add scripts dir to path so we can import from integrate_viewer
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from integrate_viewer import find_context, load_transcripts


class TestFindContext:
    """Tests for find_context() - locating quotes in transcripts and extracting context."""

    def test_find_context_found(self):
        """Finds full quote in transcript and returns surrounding context."""
        transcript_data = {
            'text': 'Before text here. The actual quote we are looking for appears in the middle. After text here.',
            'title': 'Test Call'
        }
        quote = 'The actual quote we are looking for appears in the middle.'

        result = find_context(quote, transcript_data)

        assert result is not None, "find_context should return a result for a matching quote"
        assert 'contextBefore' in result
        assert 'contextAfter' in result
        assert 'callTitle' in result
        assert result['callTitle'] == 'Test Call'
        assert 'Before text here.' in result['contextBefore']
        assert 'After text here.' in result['contextAfter']

    def test_find_context_not_found(self):
        """Returns None for quotes not in transcript."""
        transcript_data = {
            'text': 'This is some transcript text about biology research.',
            'title': 'Test Call'
        }
        quote = 'This quote does not exist anywhere in the transcript.'

        result = find_context(quote, transcript_data)

        assert result is None, "find_context should return None for unmatched quotes"

    def test_speaker_ids_stripped(self):
        """Speaker IDs are kept raw in context (resolved to names at display time in JS)."""
        transcript_data = {
            'text': '[Speaker 5015271624001198436]: Hello there. The quote is here. [Speaker 4033435827504806251]: Thanks.',
            'title': 'Speaker Test'
        }
        quote = 'The quote is here.'

        result = find_context(quote, transcript_data)

        assert result is not None
        # Speaker IDs should be KEPT (resolved at display time in JS)
        assert '[Speaker 5015271624001198436]' in result['contextBefore']
        assert '[Speaker 4033435827504806251]' in result['contextAfter']

    def test_ellipsis_added(self):
        """Context has ... prefix when truncated at start, ... suffix when truncated at end."""
        # Create text that is longer than 1000 chars on each side of the quote
        before_text = 'A' * 1500
        after_text = 'B' * 1500
        quote = 'TARGET QUOTE HERE'
        full_text = before_text + quote + after_text

        transcript_data = {
            'text': full_text,
            'title': 'Ellipsis Test'
        }

        result = find_context(quote.lower(), transcript_data)

        assert result is not None
        # Should have ellipsis at start (truncated from before) and end (truncated after)
        assert result['contextBefore'].startswith('...'), \
            f"contextBefore should start with '...' but starts with: {result['contextBefore'][:10]}"
        assert result['contextAfter'].endswith('...'), \
            f"contextAfter should end with '...' but ends with: {result['contextAfter'][-10:]}"

    def test_no_ellipsis_at_boundaries(self):
        """No ellipsis when context reaches the start/end of transcript."""
        transcript_data = {
            'text': 'Short before. The quote. Short after.',
            'title': 'Boundary Test'
        }
        quote = 'The quote.'

        result = find_context(quote, transcript_data)

        assert result is not None
        assert not result['contextBefore'].startswith('...'), \
            "contextBefore should NOT start with '...' when at transcript start"
        assert not result['contextAfter'].endswith('...'), \
            "contextAfter should NOT end with '...' when at transcript end"

    def test_empty_inputs(self):
        """Returns None for empty quote or empty transcript."""
        assert find_context('', {'text': 'some text', 'title': ''}) is None
        assert find_context('some quote', {'text': '', 'title': ''}) is None
        assert find_context('some quote', {'text': None, 'title': ''}) is None

    def test_fallback_strips_speaker_tags(self):
        """Matches quotes where LLM removed [Speaker ID]: tags during extraction."""
        transcript_data = {
            'text': '[Speaker 6962253166522553880]: my name is Shane. [Speaker 6962253166522553880]: I\'m a scientist in GSK',
            'title': 'Fallback Test'
        }
        # LLM extracted quote without the speaker tag in the middle
        quote = "my name is Shane. I'm a scientist in GSK"

        result = find_context(quote, transcript_data)

        assert result is not None, "find_context should match via fallback speaker-tag stripping"
        assert result['callTitle'] == 'Fallback Test'
