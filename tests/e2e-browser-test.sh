#!/bin/bash
# End-to-end browser tests using agent-browser CLI.
# Tests the live Vercel deployment with real SSO bypass.
#
# Usage:
#   BYPASS_SECRET=$GONG_VIEWER_BYPASS_SECRET bash tests/e2e-browser-test.sh
#
# Requires: agent-browser CLI installed

set -euo pipefail

SITE="https://gong-org-viewer-static.vercel.app"
BYPASS="${BYPASS_SECRET:?Set BYPASS_SECRET env var}"
URL="${SITE}/?x-vercel-protection-bypass=${BYPASS}"
SCREENSHOTS="tests/e2e-screenshots"
PASS=0
FAIL=0
ERRORS=""

mkdir -p "$SCREENSHOTS"

pass() { echo "  ✅ PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  ❌ FAIL: $1"; FAIL=$((FAIL + 1)); ERRORS="${ERRORS}\n  - $1"; }

echo "=== E2E Browser Tests ==="
echo "Target: $SITE"
echo ""

# ─── TEST 1: Page loads without JS errors ───
echo "Test 1: Page loads without JS errors"
agent-browser open "$URL" 2>/dev/null
sleep 3
CONSOLE=$(agent-browser console 2>/dev/null || echo "")
agent-browser screenshot "$SCREENSHOTS/e2e-1-load.png" 2>/dev/null

if echo "$CONSOLE" | grep -qi "TypeError\|ReferenceError\|is not defined\|Cannot read prop"; then
  fail "JS errors found in console"
  echo "$CONSOLE" | grep -i "TypeError\|ReferenceError\|is not defined" | head -5
else
  pass "Page loads without JS errors"
fi

# ─── TEST 2: Only Manual Map and Match Review buttons visible ───
echo "Test 2: Correct mode buttons"
BUTTONS=$(agent-browser execute 'JSON.stringify({
  hasAuto: !!document.getElementById("autoModeBtn"),
  hasManual: !!document.getElementById("manualModeBtn"),
  hasMatchReview: !!document.getElementById("matchReviewBtn"),
  hasGraduate: !!document.getElementById("graduateBtn"),
  hasDuplicates: !!document.getElementById("duplicatesBtn")
})' 2>/dev/null || echo '{}')

if echo "$BUTTONS" | grep -q '"hasAuto":false' && echo "$BUTTONS" | grep -q '"hasManual":true'; then
  pass "Only Manual Map and Match Review buttons"
else
  fail "Wrong buttons: $BUTTONS"
fi

# ─── TEST 3: Novartis renders with NBIR merge ───
echo "Test 3: Novartis manual map renders"
agent-browser execute 'document.getElementById("companySelect").value = "novartis"; document.getElementById("companySelect").dispatchEvent(new Event("change"))' 2>/dev/null
sleep 3
agent-browser screenshot "$SCREENSHOTS/e2e-3-novartis.png" 2>/dev/null

TREE_CONTENT=$(agent-browser execute 'document.getElementById("tree").textContent.substring(0, 500)' 2>/dev/null || echo "")
if echo "$TREE_CONTENT" | grep -qi "biomedical research\|Fiona Marshall"; then
  pass "Novartis renders with Biomedical Research node"
else
  fail "Novartis tree missing Biomedical Research: ${TREE_CONTENT:0:100}"
fi

# ─── TEST 4: Match Review renders ───
echo "Test 4: Match Review mode"
agent-browser execute 'document.getElementById("matchReviewBtn").click()' 2>/dev/null
sleep 2
agent-browser screenshot "$SCREENSHOTS/e2e-4-match-review.png" 2>/dev/null

MR_CONTENT=$(agent-browser execute 'document.getElementById("matchReviewContainer").textContent.substring(0, 200)' 2>/dev/null || echo "")
if echo "$MR_CONTENT" | grep -qi "unmatched\|suggestion\|approve\|snippet"; then
  pass "Match Review renders with items"
else
  fail "Match Review empty or broken: ${MR_CONTENT:0:100}"
fi

# ─── TEST 5: Switch back to Manual Map ───
echo "Test 5: Switch back to Manual Map"
agent-browser execute 'document.getElementById("manualModeBtn").click()' 2>/dev/null
sleep 2

TREE_VISIBLE=$(agent-browser execute '!document.getElementById("treeContainer").classList.contains("hidden")' 2>/dev/null || echo "false")
if echo "$TREE_VISIBLE" | grep -q "true"; then
  pass "Manual Map renders after switching back"
else
  fail "Tree not visible after switching back"
fi

# ─── TEST 6: Table view has content ───
echo "Test 6: Table view"
agent-browser execute 'document.getElementById("tableViewBtn").click()' 2>/dev/null
sleep 1
agent-browser screenshot "$SCREENSHOTS/e2e-6-table.png" 2>/dev/null

TABLE_ROWS=$(agent-browser execute 'document.querySelectorAll(".snippets-table tbody tr").length' 2>/dev/null || echo "0")
if [ "$TABLE_ROWS" -gt 0 ] 2>/dev/null; then
  pass "Table view has $TABLE_ROWS rows"
else
  fail "Table view empty (0 rows)"
fi

# Switch back to tree
agent-browser execute 'document.getElementById("treeViewBtn").click()' 2>/dev/null
sleep 1

# ─── TEST 7: Click node shows evidence with context button ───
echo "Test 7: Snippet context button"
agent-browser execute 'document.querySelector(".node")?.click()' 2>/dev/null
sleep 1
agent-browser screenshot "$SCREENSHOTS/e2e-7-evidence.png" 2>/dev/null

CONTEXT_BTN=$(agent-browser execute 'document.querySelector(".snippet-context-btn") ? "found" : "none"' 2>/dev/null || echo "none")
if echo "$CONTEXT_BTN" | grep -q "found"; then
  pass "Snippet context button visible"
else
  # Not all nodes have snippets with context — try clicking a few
  agent-browser execute '
    const nodes = document.querySelectorAll(".node");
    for (let i = 1; i < Math.min(nodes.length, 5); i++) {
      nodes[i].click();
    }
  ' 2>/dev/null
  sleep 1
  CONTEXT_BTN2=$(agent-browser execute 'document.querySelector(".snippet-context-btn") ? "found" : "none"' 2>/dev/null || echo "none")
  if echo "$CONTEXT_BTN2" | grep -q "found"; then
    pass "Snippet context button visible (found on subsequent node)"
  else
    fail "No snippet context button found on any node"
  fi
fi

# ─── TEST 8: Console clean after all interactions ───
echo "Test 8: Console clean after interactions"
CONSOLE_FINAL=$(agent-browser console 2>/dev/null || echo "")

if echo "$CONSOLE_FINAL" | grep -qi "TypeError\|ReferenceError\|is not defined\|Cannot read prop"; then
  fail "JS errors after interactions"
  echo "$CONSOLE_FINAL" | grep -i "TypeError\|ReferenceError\|is not defined" | head -5
else
  pass "No JS errors after all interactions"
fi

# ─── SUMMARY ───
echo ""
echo "=== RESULTS ==="
echo "  Passed: $PASS"
echo "  Failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo -e "  Failures:$ERRORS"
  exit 1
fi
echo "  All tests passed!"
