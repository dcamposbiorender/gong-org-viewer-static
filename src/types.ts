// --- Raw pipeline data (what comes from JSON files) ---

export type OrgNodeType =
  | 'group'
  | 'department'
  | 'team'
  | 'division'
  | 'function'
  | 'therapeutic_area'
  | 'sub_team'
  | 'unknown';

export type EvidenceStatus = 'supported' | 'conflicting' | 'unverified';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface OrgNode {
  id: string;
  name: string;
  type: OrgNodeType;
  leader?: { name: string; title: string };
  size?: number;
  level?: number;
  sites?: string[];
  gongEvidence?: GongEvidence;
  children: OrgNode[];
}

export interface Snippet {
  quote: string;
  date: string;
  gongUrl?: string;
  callId?: string;
  callTitle?: string;
  contextBefore?: string;
  contextAfter?: string;
  speakerId?: string;
  customerName?: string;
  internalName?: string;
  entityName?: string;
}

export interface SizeMention {
  value: string;
  source?: { callDate?: string; customerName?: string };
  snippetIndex?: number;
}

export interface Contact {
  name: string;
  title?: string;
  isDecisionMaker?: boolean;
}

export interface MatchedEntity {
  name: string;
  confidence: ConfidenceLevel;
}

export interface GongEvidence {
  snippets: Snippet[];
  sizeMentions: SizeMention[];
  matchedContacts: Contact[];
  matchedEntities?: MatchedEntity[];
  teamSizes?: string[];
  totalMentions: number;
  confidence: ConfidenceLevel;
  status: EvidenceStatus;
}

// --- Company data envelope (what MANUAL_DATA[company] looks like) ---

export interface CompanyData {
  company: string;
  source: string;
  stats: { entities: number; matched: number; snippets: number };
  dateRange?: { earliest: string; latest: string };
  root: OrgNode;
}

// --- Working tree types (enriched at runtime) ---

export interface WorkingTreeNode extends OrgNode {
  originalParent?: string | null;
  override?: Override;
  notes?: string;
}

// --- KV state types ---

export interface Override {
  newParent: string;
  originalParent: string;
  movedAt: string;
}

export interface SizeOverride {
  selectedSizeIndex?: number | null;
  customValue?: string | null;
  updatedAt?: string;
}

export interface MatchDecision {
  manualNodeId: string;
  manualNode: string;
  manualPath?: string;
  approvedAt?: string;
  rejectedAt?: string;
}

// --- Match review data (what MATCH_REVIEW_DATA looks like) ---
// Note: These use snake_case field names because they model raw Python pipeline
// output. The viewer types above (OrgNode, Snippet, etc.) use camelCase because
// integrate_viewer.py converts them during the snake_case → camelCase transform.

export interface MatchReviewItem {
  id: string;
  gong_entity: string;
  snippet: string;
  llm_suggested_match?: string;
  confidence?: ConfidenceLevel;
  reasoning?: string;
  speaker_name?: string;
  call_id?: string;
  call_date?: string;
}

export interface MatchReviewData {
  generated: string;
  companies: Record<string, {
    total_unmatched: number;
    items: MatchReviewItem[];
  }>;
}

// --- Valid account names ---

export type ValidAccount =
  | 'abbvie'
  | 'astrazeneca'
  | 'gsk'
  | 'lilly'
  | 'novartis'
  | 'regeneron'
  | 'roche';
