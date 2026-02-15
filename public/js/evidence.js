// Evidence: snippet context, manual node evidence

function showSnippetContext(snippetIdx) {
  const node = selectedNode;
  if (!node) return;
  const snippets = typeof getNodeSnippets === 'function'
    ? getNodeSnippets(node) : (node.snippets || []);

  // Sort snippets by date (newest first) to match the displayed order
  const sortedSnippets = [...snippets].sort((a, b) => new Date(b.date) - new Date(a.date));
  const s = sortedSnippets[snippetIdx];
  if (!s || s.contextBefore === undefined) {
    showToast('Context not available for this snippet', 'info');
    return;
  }

  document.getElementById('snippetContextTitle').textContent = s.callTitle || 'Call Context';
  document.getElementById('snippetContextMeta').textContent =
    `${s.date || ''}  \u2022  ${s.customerName || ''} ${s.internalName ? '/ ' + s.internalName : ''}`;

  // Show Gong link if available
  const gongLink = document.getElementById('snippetContextGongLink');
  if (s.gongUrl) {
    gongLink.href = s.gongUrl;
    gongLink.style.display = 'inline';
  } else {
    gongLink.style.display = 'none';
  }

  // Resolve speaker IDs to names using speakerId from extraction data.
  // The snippet's speakerId = the transcript speaker who said the extracted quote.
  // Combined with customerName/internalName, we can map both speakers on 2-person calls.
  const fullContext = (s.contextBefore || '') + s.quote + (s.contextAfter || '');
  const speakerIdSet = [...new Set((fullContext.match(/\[Speaker (\d+)\]/g) || []).map(m => m.match(/\d+/)[0]))];
  const speakerMap = {};

  if (s.speakerId && speakerIdSet.length === 2 && speakerIdSet.includes(s.speakerId)) {
    // We know which speaker said the quote (speakerId from extraction).
    // Find the nearest [Speaker ID] tag before the quote to confirm which ID = quote speaker.
    const quoteIdx = fullContext.toLowerCase().indexOf(s.quote.toLowerCase().substring(0, 40));
    let quoteSpeakerId = s.speakerId;
    if (quoteIdx > 0) {
      const before = fullContext.substring(0, quoteIdx);
      const nearestMatch = before.match(/\[Speaker (\d+)\][^[]*$/);
      if (nearestMatch && speakerIdSet.includes(nearestMatch[1])) {
        quoteSpeakerId = nearestMatch[1];
      }
    }
    const otherSpeakerId = speakerIdSet.find(id => id !== quoteSpeakerId);

    // Determine if the quote speaker is customer or BioRender:
    // The extraction's speaker_id is the person who spoke the raw_quote.
    // Snippets about org structure are typically spoken by the CUSTOMER.
    // customerName = customer on the call, internalName = BioRender rep.
    const customerFirst = (s.customerName || 'Customer').split(';')[0].trim();
    const biorenderFirst = (s.internalName || 'BioRender Rep').split(';')[0].trim();

    // Map: quote speaker → customer (org structure quotes are typically customer speech)
    // Other speaker → BioRender rep
    speakerMap[quoteSpeakerId] = customerFirst;
    if (otherSpeakerId) speakerMap[otherSpeakerId] = biorenderFirst;
  }

  function resolveSpeakers(text) {
    // Apply known name mappings
    for (const [id, name] of Object.entries(speakerMap)) {
      text = text.replace(new RegExp('\\[Speaker ' + id + '\\]', 'g'), '[' + name + ']');
    }
    // Any remaining unresolved speakers → short labels [Speaker A], [Speaker B]
    const remaining = [...new Set((text.match(/\[Speaker (\d+)\]/g) || []).map(m => m.match(/\d+/)[0]))];
    const labels = 'ABCDEFGH';
    remaining.forEach((id, i) => {
      text = text.replace(new RegExp('\\[Speaker ' + id + '\\]', 'g'), '[Speaker ' + labels[i] + ']');
    });
    return text;
  }

  const body = document.getElementById('snippetContextBody');
  body.innerHTML = '';

  if (s.contextBefore) {
    const el = document.createElement('div');
    el.className = 'snippet-context-text';
    el.textContent = resolveSpeakers(s.contextBefore);
    body.appendChild(el);
  }

  const highlight = document.createElement('div');
  highlight.className = 'snippet-context-highlight';
  highlight.textContent = s.quote;
  body.appendChild(highlight);

  if (s.contextAfter) {
    const el = document.createElement('div');
    el.className = 'snippet-context-text';
    el.textContent = resolveSpeakers(s.contextAfter);
    body.appendChild(el);
  }

  document.getElementById('snippetContextModal').classList.add('active');
}

// Close snippet context modal
function closeSnippetContextModal() {
  document.getElementById('snippetContextModal').classList.remove('active');
}

// Close snippet context modal on backdrop click
document.getElementById('snippetContextModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'snippetContextModal') closeSnippetContextModal();
});

// Close snippet context modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('snippetContextModal')?.classList.contains('active')) {
    closeSnippetContextModal();
  }
});

// Count nodes in tree

function getApprovedMatchesForNode(company, nodeName) {
  if (!hasMatchReviewData(company)) return [];
  if (!matchReviewState[company]?.approved) return [];

  const approvedItems = [];
  const items = MATCH_REVIEW_DATA.companies[company]?.items || [];

  Object.entries(matchReviewState[company].approved).forEach(([itemId, approval]) => {
    // Check if this approval maps to our node
    if (approval.manualNode === nodeName) {
      const item = items.find(i => i.id === itemId);
      if (item) {
        approvedItems.push(item);
      }
    }
  });

  return approvedItems;
}


function showManualNodeEvidence(node) {
  const evidence = node.gongEvidence || {};
  let snippets = [...(evidence.snippets || [])];
  const matchedEntities = evidence.matchedEntities || [];
  const matchedContacts = evidence.matchedContacts || [];
  let sizeMentions = [...(evidence.sizeMentions || [])];

  // Get dynamically approved matches and add their evidence
  const approvedMatches = getApprovedMatchesForNode(currentCompany, node.name);
  approvedMatches.forEach(match => {
    // Add snippet from approved match if it has one
    if (match.snippet) {
      snippets.push({
        date: match.snippet_date,
        quote: match.snippet,
        internalName: match.person_name,
        customerName: null,
        gongUrl: null,
        entityName: match.gong_entity + ' (approved match)'
      });
    }
    // Add team size as a size mention if present
    if (match.team_size) {
      sizeMentions.push({
        value: String(match.team_size),
        source: {
          callDate: match.snippet_date,
          customerName: match.person_name
        },
        snippetIndex: snippets.length - 1 // Link to the snippet we just added
      });
    }
  });

  // Update evidence panel title
  document.getElementById('evidenceTitleText').textContent = `Evidence: ${node.name}`;

  const content = document.getElementById('evidenceContent');

  // Build size mentions HTML with clickable chips - no separate label since we have the input row
  const sizeOverrideKey = getSizeOverrideKey(currentCompany, node.id);
  const currentSizeOverride = sizeOverrides[sizeOverrideKey];
  let sizeMentionsHtml = '';
  if (sizeMentions.length > 0 || evidence.teamSizes?.length > 0) {
    sizeMentionsHtml = '<div class="size-mentions-row">';

    if (sizeMentions.length > 0) {
      sizeMentions.forEach((m, idx) => {
        const dateStr = m.source?.callDate ? m.source.callDate.substring(0, 10) : '';
        const customerShort = m.source?.customerName?.split(';')[0]?.split(' ')[0] || '';
        const isSelected = currentSizeOverride?.selectedSizeIndex === idx;
        const selectedClass = isSelected ? ' selected' : '';
        const checkmark = isSelected ? '<span class="size-chip-check">✓</span> ' : '';
        sizeMentionsHtml += `
          <a class="size-chip${selectedClass}" href="#" data-snippet-idx="${m.snippetIndex}" data-size-idx="${idx}"
             onclick="handleSizeChipClick(event, '${node.id}', ${idx}, ${m.snippetIndex})"
             title="${isSelected ? '✓ Selected as source of truth. ' : ''}Click to select and populate Team size. Shift+click to view snippet.">
            ${checkmark}${m.value}
            <span class="size-chip-source">${dateStr}${customerShort ? ' · ' + customerShort : ''}</span>
          </a>`;
      });
      if (currentSizeOverride?.selectedSizeIndex !== undefined && currentSizeOverride?.selectedSizeIndex !== null) {
        sizeMentionsHtml += `
          <button class="size-chip-clear" onclick="clearSizeOverride('${node.id}'); showManualNodeEvidence(selectedManualNode);" title="Clear size selection">
            ✕ clear
          </button>`;
      }
    } else if (evidence.teamSizes?.length > 0) {
      // Fallback to old teamSizes if sizeMentions not populated
      evidence.teamSizes.forEach(size => {
        sizeMentionsHtml += `
          <span class="size-chip untraceable" title="No traceable snippet source found">
            ${size}
            <span class="size-chip-warning">⚠ no source</span>
          </span>`;
      });
    }

    sizeMentionsHtml += '</div>';
  }

  // Build team size input HTML for Manual Map mode
  const currentDisplayedSizeManual = getDisplaySize(node, currentCompany) || '';
  const currentSizeNumberManual = currentSizeOverride?.customValue ||
    (currentDisplayedSizeManual ? currentDisplayedSizeManual.replace(/[^\d]/g, '') : '');

  let teamSizeInputHtml = `
    <div class="team-size-override">
      <span class="team-size-override-label">Team size</span>
      <input type="text" class="team-size-override-input" id="teamSizeInput-${node.id}"
             value="${currentSizeNumberManual}"
             placeholder="—"
             onchange="handleTeamSizeInputChange('${node.id}', this.value)"
             onkeydown="if(event.key==='Enter') this.blur()"
             title="Enter team size or click a mention below to populate">
      <span class="team-size-override-hint">Enter or click below</span>
    </div>`;

  // Check if this node is the root (can't delete root)
  const isRoot = !findManualNodeParent(MANUAL_DATA[currentCompany]?.root, node.id);

  let html = `
    <div class="evidence-entity-info">
      <h4>${escapeHtml(node.name)}</h4>
      <div class="evidence-info-row">
        <span class="evidence-info-label">Type</span>
        <span>${escapeHtml(node.type || 'unknown')}</span>
      </div>
      <div class="evidence-info-row">
        <span class="evidence-info-label">Status</span>
        <span style="color: ${evidence.status === 'supported' ? '#059669' : evidence.status === 'conflicting' ? '#dc2626' : '#888'}">
          ${escapeHtml(evidence.status || 'unverified')}${approvedMatches.length > 0 ? ` (+${approvedMatches.length} approved)` : ''}
        </span>
      </div>
      <div class="evidence-info-row">
        <span class="evidence-info-label">Mentions</span>
        <span>${(evidence.totalMentions || 0) + snippets.length - (evidence.snippets?.length || 0)}</span>
      </div>
      ${teamSizeInputHtml}
      ${sizeMentionsHtml}
      ${node.sites?.length > 0 ? `<div class="evidence-info-row"><span class="evidence-info-label">Sites</span><span>${node.sites.map(s => escapeHtml(s)).join(', ')}</span></div>` : ''}
      <div class="entity-crud-buttons" style="margin-top: 12px; display: flex; gap: 8px;">
        <button onclick="showAddChildModal('${node.id}')" style="flex: 1; padding: 6px 12px; font-size: 12px; background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer;">
          + Add Child
        </button>
        ${!isRoot ? `
        <button onclick="confirmDeleteEntity('${node.id}')" style="flex: 1; padding: 6px 12px; font-size: 12px; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Delete
        </button>` : ''}
      </div>
    </div>
  `;

  // Show matched contacts/people (LinkedIn/external matches)
  if (matchedContacts.length > 0) {
    html += '<div class="evidence-contacts" style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #e0e0e0;"><h5 style="margin: 0 0 8px; font-size: 12px; color: #666;">People</h5>';
    matchedContacts.forEach(c => {
      html += `
        <div style="padding: 6px 0; border-bottom: 1px solid #eee; font-size: 12px;">
          <strong>${escapeHtml(c.name || '')}</strong>
          ${c.title ? `<span style="color: #666;"> - ${escapeHtml(c.title)}</span>` : ''}
          ${c.isDecisionMaker ? '<span style="color: #059669; font-size: 10px; margin-left: 6px;">(Decision Maker)</span>' : ''}
        </div>
      `;
    });
    html += '</div>';
  }

  html += '<div class="evidence-snippets">';

  if (snippets.length === 0) {
    html += '<div class="evidence-empty">No Gong snippets for this entity</div>';
  } else {
    snippets.forEach((s, idx) => {
      html += `
        <div class="snippet-card" data-snippet-orig-idx="${idx}">
          <div class="snippet-date">
            ${s.gongUrl ? `<a href="${sanitizeUrl(s.gongUrl)}" target="_blank" class="snippet-link" style="color: #2563eb; text-decoration: none;">${escapeHtml(s.date || '')} ↗</a>` : escapeHtml(s.date || '')}
          </div>
          <div class="snippet-quote">"${boldSizeMentions(escapeHtml(s.quote))}"</div>
          <div class="snippet-attribution">
            <span>
              ${s.internalName ? `Internal: ${escapeHtml(s.internalName)}` : ''}
              ${s.internalName && s.customerName ? ' | ' : ''}
              ${s.customerName ? `Customer: ${escapeHtml(s.customerName)}` : ''}
              ${!s.internalName && !s.customerName ? '—' : ''}
            </span>
            ${s.gongUrl ? `<a href="${sanitizeUrl(s.gongUrl)}" class="snippet-link" target="_blank">↗ Gong</a>` : ''}
          </div>
          ${s.entityName ? `<div class="snippet-entity" style="font-size: 11px; color: #888; margin-top: 4px;">from: ${escapeHtml(s.entityName)}</div>` : ''}
          ${s.contextBefore !== undefined ? `<button class="snippet-context-btn" onclick="showManualSnippetContext(${idx})">📄 Context</button>` : ''}
        </div>
      `;
    });
    // Store snippets for context popout
    window.manualEvidenceSnippets = snippets;
  }

  html += '</div>';
  content.innerHTML = html;
}

// Show context for manual map evidence snippets.
// Delegates to showSnippetContext's rendering logic using the shared modal.
function showManualSnippetContext(idx) {
  const snippets = window.manualEvidenceSnippets;
  if (!snippets || !snippets[idx]) return;
  const s = snippets[idx];
  if (s.contextBefore === undefined) {
    showToast('Context not available for this snippet', 'info');
    return;
  }

  document.getElementById('snippetContextTitle').textContent = s.callTitle || 'Call Context';
  document.getElementById('snippetContextMeta').textContent =
    `${s.date || ''}  \u2022  ${s.customerName || ''} ${s.internalName ? '/ ' + s.internalName : ''}`;

  const gongLink = document.getElementById('snippetContextGongLink');
  if (s.gongUrl) { gongLink.href = s.gongUrl; gongLink.style.display = 'inline'; }
  else { gongLink.style.display = 'none'; }

  const fullContext = (s.contextBefore || '') + s.quote + (s.contextAfter || '');
  const speakerIdSet = [...new Set((fullContext.match(/\[Speaker (\d+)\]/g) || []).map(m => m.match(/\d+/)[0]))];
  const speakerMap = {};
  if (s.speakerId && speakerIdSet.length === 2 && speakerIdSet.includes(s.speakerId)) {
    const quoteIdx = fullContext.toLowerCase().indexOf(s.quote.toLowerCase().substring(0, 40));
    let quoteSpeakerId = s.speakerId;
    if (quoteIdx > 0) {
      const before = fullContext.substring(0, quoteIdx);
      const nearestMatch = before.match(/\[Speaker (\d+)\][^[]*$/);
      if (nearestMatch && speakerIdSet.includes(nearestMatch[1])) quoteSpeakerId = nearestMatch[1];
    }
    const otherSpeakerId = speakerIdSet.find(id => id !== quoteSpeakerId);
    const customerFirst = (s.customerName || 'Customer').split(';')[0].trim();
    const biorenderFirst = (s.internalName || 'BioRender Rep').split(';')[0].trim();
    speakerMap[quoteSpeakerId] = customerFirst;
    if (otherSpeakerId) speakerMap[otherSpeakerId] = biorenderFirst;
  }
  function resolveSpeakers(text) {
    for (const [id, name] of Object.entries(speakerMap))
      text = text.replace(new RegExp('\\[Speaker ' + id + '\\]', 'g'), '[' + name + ']');
    const remaining = [...new Set((text.match(/\[Speaker (\d+)\]/g) || []).map(m => m.match(/\d+/)[0]))];
    remaining.forEach((id, i) => text = text.replace(new RegExp('\\[Speaker ' + id + '\\]', 'g'), '[Speaker ' + 'ABCDEFGH'[i] + ']'));
    return text;
  }

  // P0 FIX: Use same CSS classes as showSnippetContext (snippet-context-text, snippet-context-highlight)
  // and open modal via classList.add('active') so closeSnippetContextModal works correctly
  const body = document.getElementById('snippetContextBody');
  body.innerHTML = '';
  if (s.contextBefore) {
    const el = document.createElement('div');
    el.className = 'snippet-context-text';
    el.textContent = resolveSpeakers(s.contextBefore);
    body.appendChild(el);
  }
  const quoteEl = document.createElement('div');
  quoteEl.className = 'snippet-context-highlight';
  quoteEl.textContent = s.quote;
  body.appendChild(quoteEl);
  if (s.contextAfter) {
    const el = document.createElement('div');
    el.className = 'snippet-context-text';
    el.textContent = resolveSpeakers(s.contextAfter);
    body.appendChild(el);
  }

  // P0 FIX: Use classList.add('active') instead of style.display = 'flex'
  // so that closeSnippetContextModal() (which uses classList.remove) actually closes the modal
  document.getElementById('snippetContextModal').classList.add('active');
}

// Render manual map view (horizontal tree in main tree container)
