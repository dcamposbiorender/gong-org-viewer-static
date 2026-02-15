// Conflict Resolution: resolve modal, verification conflicts

function toggleEvidence() {
  const panel = document.getElementById('evidencePanel');
  const toggle = document.getElementById('evidenceToggle');
  
  if (panel.classList.contains('collapsed')) {
    panel.classList.remove('collapsed');
    toggle.textContent = '▼ collapse';
  } else if (panel.classList.contains('expanded')) {
    panel.classList.remove('expanded');
    toggle.textContent = '▲ expand';
  } else {
    panel.classList.add('expanded');
    toggle.textContent = '▼ collapse';
  }
}

function showVerificationConflicts() {
  const data = MANUAL_DATA[currentCompany] || DATA[currentCompany];
  const conflicts = (data && data.verificationConflicts) || [];

  document.getElementById('changesModalTitle').textContent = 'Verification Conflicts';
  const content = document.getElementById('changesModalContent');

  if (conflicts.length === 0) {
    content.innerHTML = '<div class="changes-modal-empty">No verification conflicts</div>';
  } else {
    content.innerHTML = conflicts.map(c => `
      <div class="change-item" style="cursor: pointer;" onclick="scrollToEntity('${c.entityId}')">
        <div class="change-item-header">
          <span class="change-item-title">${escapeHtml(c.name)}</span>
          <span class="change-item-entity">${escapeHtml(c.entityName)}</span>
        </div>
        <div class="change-item-details" style="font-size: 12px; color: #666;">
          <div><strong>Gong:</strong> ${escapeHtml(c.gong_title || '(no title)')}</div>
          <div><strong>${escapeHtml(c.source_name || 'Public')}:</strong> <a href="${sanitizeUrl(c.source_url)}" target="_blank">${escapeHtml(c.public_title || '(no title)')}</a></div>
        </div>
      </div>
    `).join('');
  }

  document.getElementById('changesModal').classList.add('active');
}

function scrollToEntity(entityId) {
  closeChangesModal();
  const nodeEl = document.querySelector(`[data-id="${entityId}"]`);
  if (nodeEl) {
    nodeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    nodeEl.classList.add('highlighted');
    setTimeout(() => nodeEl.classList.remove('highlighted'), 2000);
  }
}

const VERCEL_API_BASE = window.location.hostname.includes('vercel')
  ? '/api'
  : 'http://localhost:3000/api';

// Load resolutions from localStorage (fallback) or Vercel
async function loadResolutions() {
  // Try localStorage first as cache
  const cached = localStorage.getItem('conflictResolutions');
  if (cached) {
    conflictResolutions = safeJsonParse(cached, {});
  }

  // Then try to fetch from Vercel API
  try {
    const response = await fetch(`${VERCEL_API_BASE}/resolutions?account=${currentCompany.toLowerCase()}`);
    if (response.ok) {
      conflictResolutions = await response.json();
      localStorage.setItem('conflictResolutions', JSON.stringify(conflictResolutions));
    }
  } catch (e) {
    console.log('Using localStorage for resolutions (Vercel API not available)');
  }
}

// Save resolution to localStorage and Vercel
async function saveResolution(key, resolution) {
  conflictResolutions[key] = resolution;
  localStorage.setItem('conflictResolutions', JSON.stringify(conflictResolutions));

  // Try to sync to Vercel
  try {
    await fetch(`${VERCEL_API_BASE}/resolutions?account=${currentCompany.toLowerCase()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, resolution })
    });
  } catch (e) {
    console.log('Saved locally (Vercel sync pending)');
  }
}

// Current conflict being resolved
let currentResolveContext = null;

// Open resolve modal for a conflict
function openResolveModal(conflict, entityId, leaderName) {
  currentResolveContext = {
    company: currentCompany,
    entityId: entityId,
    leaderName: leaderName,
    conflict: conflict,
    selected: null
  };

  const verification = conflict;
  const gongData = verification.gong_data || {};
  const publicData = verification.public_data || {};

  document.getElementById('resolveModalTitle').textContent = `Resolve: ${leaderName}`;

  const body = document.getElementById('resolveModalBody');
  body.innerHTML = `
    <p style="margin-bottom: 16px; color: #666;">Which source is correct for <strong>${escapeHtml(leaderName)}</strong>?</p>

    <div class="resolve-option" data-choice="gong">
      <div class="resolve-option-header">
        <div class="resolve-option-label">
          <span class="resolve-option-source">Gong Call Data</span>
        </div>
        <button class="resolve-use-btn" onclick="selectResolveOption(this.closest('.resolve-option'), 'gong')">Use Gong</button>
      </div>
      <div class="resolve-option-title">${escapeHtml(gongData.title || '(no title)')}</div>
      <div class="resolve-option-dept">${escapeHtml(gongData.department || '(no department)')}</div>
    </div>

    <div class="resolve-option" data-choice="public">
      <div class="resolve-option-header">
        <div class="resolve-option-label">
          <span class="resolve-option-source">${escapeHtml(publicData.source_name || 'Public Source')}</span>
          ${publicData.source_url ? `<a href="${sanitizeUrl(publicData.source_url)}" target="_blank" style="font-size: 11px; margin-left: 6px;">(view source)</a>` : ''}
        </div>
        <button class="resolve-use-btn" onclick="selectResolveOption(this.closest('.resolve-option'), 'public')">Use Public</button>
      </div>
      <div class="resolve-option-title">${escapeHtml(publicData.title || '(no title)')}</div>
      <div class="resolve-option-dept">${escapeHtml(publicData.department || '(no department)')}</div>
    </div>

    <div class="resolve-option" data-choice="both">
      <div class="resolve-option-header">
        <div class="resolve-option-label">
          <span class="resolve-option-source">Both are correct</span>
        </div>
        <button class="resolve-use-btn" onclick="selectResolveOption(this.closest('.resolve-option'), 'both')">Use Both</button>
      </div>
      <div class="resolve-option-title">Role may have changed over time</div>
    </div>

    <div class="resolve-option" data-choice="review">
      <div class="resolve-option-header">
        <div class="resolve-option-label">
          <span class="resolve-option-source">Needs manual review</span>
        </div>
        <button class="resolve-use-btn" onclick="selectResolveOption(this.closest('.resolve-option'), 'review')">Flag for Review</button>
      </div>
      <div class="resolve-option-title">Flag for later investigation</div>
    </div>
  `;

  // Check if already resolved
  const key = getResolutionKey(currentCompany, entityId, leaderName);
  if (conflictResolutions[key]) {
    const existing = conflictResolutions[key];
    const option = body.querySelector(`[data-choice="${existing.choice}"]`);
    if (option) {
      option.classList.add('selected');
      currentResolveContext.selected = existing.choice;
      document.getElementById('resolveSave').disabled = false;
    }
  }

  document.getElementById('resolveModal').classList.add('active');
}

function selectResolveOption(el, choice) {
  document.querySelectorAll('.resolve-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  currentResolveContext.selected = choice;
  document.getElementById('resolveSave').disabled = false;
}

function closeResolveModal() {
  document.getElementById('resolveModal').classList.remove('active');
  currentResolveContext = null;
}

async function saveCurrentResolution() {
  if (!currentResolveContext || !currentResolveContext.selected) return;

  const key = getResolutionKey(
    currentResolveContext.company,
    currentResolveContext.entityId,
    currentResolveContext.leaderName
  );

  const resolution = {
    choice: currentResolveContext.selected,
    resolvedAt: new Date().toISOString(),
    resolvedBy: 'user', // Could be enhanced with user auth
    conflict: currentResolveContext.conflict
  };

  await saveResolution(key, resolution);
  closeResolveModal();

  // Re-render to show resolved status
  if (currentMode === 'matchReview') {
    renderMatchReview(currentCompany);
  } else {
    renderManualMapView();
  }
}

// Event listeners for resolve modal
document.getElementById('resolveModalClose').addEventListener('click', closeResolveModal);
document.getElementById('resolveCancel').addEventListener('click', closeResolveModal);
document.getElementById('resolveSave').addEventListener('click', saveCurrentResolution);
document.getElementById('resolveModal').addEventListener('click', (e) => {
  if (e.target.id === 'resolveModal') closeResolveModal();
});

// Load resolutions on startup
loadResolutions();

// ============================================
// AUTOSAVE SYSTEM
// ============================================

