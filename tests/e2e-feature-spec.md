# E2E Feature Specification

Source of truth for all testable features in the GongOrgViewerStatic app.

## Navigation & Mode Switching

| ID | Feature | Trigger | Expected Result | API |
|----|---------|---------|-----------------|-----|
| NAV-01 | Company selector | Change `#companySelect` dropdown | Tree re-renders for selected company, stats update | None |
| NAV-02 | Switch to Match Review mode | Click `#matchReviewBtn` | Tree hidden, match review table shown | None |
| NAV-03 | Switch to Manual Map mode | Click `#manualModeBtn` | Match review hidden, manual map tree shown | None |
| NAV-04 | Tree view toggle | Click `#treeViewBtn` | Tree container visible | None |
| NAV-05 | Table view toggle | Click `#tableViewBtn` | Table container visible | None |
| NAV-06 | Timeline date filter | Drag `#startSlider` / `#endSlider` | Date labels update, snippets filtered | None |

## Manual Map CRUD

| ID | Feature | Trigger | Expected Result | API |
|----|---------|---------|-----------------|-----|
| CRUD-01 | View org tree | Page load / company change | Tree renders with nodes, stats show count | None |
| CRUD-02 | Select node (view evidence) | Click `.mm-node` | Node highlights, evidence panel shows snippets | None |
| CRUD-03 | Edit node name | Double-click node | Edit form appears inline | None |
| CRUD-04 | Save node edit | Click save in edit form | Name updates in tree, saved to KV | POST `/api/graduated-map` |
| CRUD-05 | Cancel node edit | Click cancel or Escape | Edit form removed, original values restored | None |
| CRUD-06 | Add child entity | Click + button, enter name | New node appears as child, saved to KV | POST `/api/graduated-map` |
| CRUD-07 | Delete entity (leaf) | Click delete, confirm | Node removed from tree, saved to KV | POST `/api/graduated-map` |
| CRUD-08 | Delete entity (with children) | Click delete, confirm | Node + descendants removed | POST `/api/graduated-map` |
| CRUD-09 | Drag node to new parent | Drag `.mm-node`, drop on another | Node reparents, tree re-renders | POST `/api/graduated-map` |

## Match Review

| ID | Feature | Trigger | Expected Result | API |
|----|---------|---------|-----------------|-----|
| MR-01 | View match review list | Switch to match review mode | Items listed with suggestions | GET `/api/match-review` |
| MR-02 | Approve match | Click approve button | Status -> "Approved" (green) | POST `/api/match-review` |
| MR-03 | Reject match | Click reject button | Status -> "Rejected" (red) | POST `/api/match-review` |
| MR-04 | Manual match | Type in search, select node | Status -> "Matched to [name]" | POST `/api/match-review` |
| MR-05 | Reset decision | Click reset on decided item | Status -> "Pending" | DELETE `/api/match-review` |
| MR-06 | Approve then reject same item | Approve then reject | Item is ONLY rejected, NOT approved | POST `/api/match-review` |
| MR-07 | Filter by status | Change `#mrStatusFilter` | List shows only matching items | None |
| MR-08 | Filter by confidence | Change `#mrConfidenceFilter` | List shows only matching items | None |
| MR-09 | Search filter | Type in `#mrSearchFilter` | List filters by name/snippet | None |

## Entity Merge & Alias

| ID | Feature | Trigger | Expected Result | API |
|----|---------|---------|-----------------|-----|
| MERGE-01 | Open manage entities modal | Click "Manage Entities" button | Modal appears with 3 tabs | None |
| MERGE-02 | Merge two entities | Select A + B, click Merge | A absorbed into B, saved to KV | POST `/api/merges` |
| MERGE-03 | Add alias | Type alias name, click Add | Alias chip appears, saved to KV | POST `/api/merges` |
| MERGE-04 | Remove alias | Click x on alias chip | Alias removed, saved to KV | POST `/api/merges` |

## Evidence & Snippet Context

| ID | Feature | Trigger | Expected Result | API |
|----|---------|---------|-----------------|-----|
| EV-01 | Evidence panel populates | Click a node | Evidence panel shows snippets | None |
| EV-02 | Snippet context modal | Click "Show context" button | Modal opens with transcript excerpt | None |
| EV-03 | Close context modal (button) | Click close button | Modal closes | None |
| EV-04 | Close context modal (Escape) | Press Escape key | Modal closes | None |
| EV-05 | Close context modal (backdrop) | Click outside modal | Modal closes | None |
| EV-06 | Size mention chips | Click size chip | Size override applied | POST `/api/sizes` |

## Multi-User Sync

| ID | Feature | Trigger | Expected Result | API |
|----|---------|---------|-----------------|-----|
| SYNC-01 | User A approves, User B sees it | A approves, wait 15s | B sees approved status | GET `/api/sync-version` |
| SYNC-02 | User A edits node, User B sees it | A saves edit, wait 15s | B sees new name | GET `/api/sync-version` |
| SYNC-03 | Concurrent conflict | A rejects, B approves same item | Last write wins, exactly ONE state | POST `/api/match-review` |
| SYNC-04 | Concurrent different items | A approves X, B rejects Y | Both decisions preserved | POST `/api/match-review` |
