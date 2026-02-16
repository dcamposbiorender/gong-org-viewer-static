// Pure functions for resolving speaker IDs to names in transcript context.

interface SnippetSpeakerInfo {
  quote: string;
  speakerId?: string;
  customerName?: string;
  internalName?: string;
}

/** Build a map from speaker ID → display name using a 2-speaker heuristic. */
export function buildSpeakerMap(
  fullContext: string,
  snippet: SnippetSpeakerInfo
): Record<string, string> {
  const speakerIdSet = [
    ...new Set(
      (fullContext.match(/\[Speaker (\d+)\]/g) || []).map(
        (m) => m.match(/\d+/)![0]
      )
    ),
  ];
  const speakerMap: Record<string, string> = {};

  if (
    snippet.speakerId &&
    speakerIdSet.length === 2 &&
    speakerIdSet.includes(snippet.speakerId)
  ) {
    const quoteIdx = fullContext
      .toLowerCase()
      .indexOf(snippet.quote.toLowerCase().substring(0, 40));
    let quoteSpeakerId = snippet.speakerId;
    if (quoteIdx > 0) {
      const before = fullContext.substring(0, quoteIdx);
      const nearestMatch = before.match(/\[Speaker (\d+)\][^[]*$/);
      if (nearestMatch && speakerIdSet.includes(nearestMatch[1]))
        quoteSpeakerId = nearestMatch[1];
    }
    const otherSpeakerId = speakerIdSet.find((id) => id !== quoteSpeakerId);
    const customerFirst = (snippet.customerName || "Customer")
      .split(";")[0]
      .trim();
    const biorenderFirst = (snippet.internalName || "BioRender Rep")
      .split(";")[0]
      .trim();
    speakerMap[quoteSpeakerId] = customerFirst;
    if (otherSpeakerId) speakerMap[otherSpeakerId] = biorenderFirst;
  }
  return speakerMap;
}

/** Replace [Speaker N] tags with resolved names or fallback labels (A, B, C...). */
export function resolveSpeakers(
  text: string,
  speakerMap: Record<string, string>
): string {
  let result = text;
  for (const [id, name] of Object.entries(speakerMap)) {
    result = result.replace(
      new RegExp("\\[Speaker " + id + "\\]", "g"),
      "[" + name + "]"
    );
  }
  const remaining = [
    ...new Set(
      (result.match(/\[Speaker (\d+)\]/g) || []).map(
        (m) => m.match(/\d+/)![0]
      )
    ),
  ];
  const labels = "ABCDEFGH";
  remaining.forEach((id, i) => {
    result = result.replace(
      new RegExp("\\[Speaker " + id + "\\]", "g"),
      "[Speaker " + labels[i] + "]"
    );
  });
  return result;
}
