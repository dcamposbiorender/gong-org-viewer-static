// --- Raw pipeline data (what comes from JSON files) ---

export type OrgNodeType =
  | "group"
  | "department"
  | "team"
  | "division"
  | "function"
  | "therapeutic_area"
  | "sub_team"
  | "unknown";

export type EvidenceStatus = "supported" | "conflicting" | "unverified" | "auto_matched" | "none";
export type ConfidenceLevel = "high" | "medium" | "low" | "none";

export interface OrgNode {
  id: string;
  name: string;
  type: OrgNodeType;
  leader?: { name: string; title: string };
  size?: number;
  level?: number;
  sites?: string[];
  notes?: string;
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

// --- Company data envelope (what manual.json looks like per company) ---

export interface CompanyData {
  company: string;
  source: string;
  stats: { entities: number; matched: number; snippets: number };
  dateRange?: { earliest: string; latest: string };
  root: OrgNode;
}

// --- Working tree types (enriched at runtime with overlays) ---

export interface WorkingTreeNode extends OrgNode {
  originalParent?: string | null;
  override?: ManualMapOverride;
  displayName?: string;
  displayLeaderName?: string;
  displayLeaderTitle?: string;
  absorbed?: boolean;
  children: WorkingTreeNode[];
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

export interface FieldEdit {
  name?: { original: string; edited: string };
  leaderName?: { original: string; edited: string };
  leaderTitle?: { original: string; edited: string };
  savedAt?: string;
}

export interface EntityMerge {
  absorbed: string[];
  aliases?: string[];
  mergedAt: string;
}

export interface ManualMapOverride {
  originalParent: string;
  newParent: string;
  newParentName?: string;
  movedAt: string;
}

export interface CompanyModifications {
  added: Array<{ id: string; name: string; parentId: string; addedAt: string }>;
  deleted: Array<{ id: string; deletedAt: string }>;
}

export interface MatchDecision {
  manualNodeId: string;
  manualNode: string;
  manualPath?: string;
  approvedAt?: string;
  rejectedAt?: string;
}

// --- Aggregate KV state (all state for one company) ---

export interface OrgState {
  corrections: Record<string, Override>;
  fieldEdits: Record<string, FieldEdit>;
  sizes: Record<string, SizeOverride>;
  merges: Record<string, EntityMerge>;
  graduatedMap: CompanyData | null;
  manualMapOverrides: Record<string, ManualMapOverride>;
  manualMapModifications: CompanyModifications | null;
  resolutions: Record<string, Record<string, unknown>>;
}

export const EMPTY_STATE: OrgState = {
  corrections: {},
  fieldEdits: {},
  sizes: {},
  merges: {},
  graduatedMap: null,
  manualMapOverrides: {},
  manualMapModifications: null,
  resolutions: {},
};

// --- API request types (discriminated union) ---

export type StateType =
  | "corrections"
  | "field-edits"
  | "sizes"
  | "merges"
  | "graduated-map"
  | "manual-map-overrides"
  | "manual-map-modifications"
  | "resolutions";

export type OrgStateRequest =
  | { type: "corrections"; entityId: string; override: Override }
  | { type: "field-edits"; entityId: string; edit: FieldEdit }
  | { type: "sizes"; key: string; override: SizeOverride }
  | { type: "merges"; canonicalId: string; merge: EntityMerge }
  | { type: "manual-map-overrides"; nodeId: string; override: ManualMapOverride }
  | { type: "manual-map-modifications"; modifications: CompanyModifications }
  | { type: "graduated-map"; map: CompanyData }
  | { type: "resolutions"; key: string; resolution: Record<string, unknown> };

// --- Match review data (snake_case from Python pipeline) ---

export interface MatchReviewItem {
  id: string;
  gong_entity: string;
  snippet: string;
  llm_suggested_match?: {
    manual_node_id: string;
    manual_node_name: string;
    manual_node_path?: string;
    confidence?: ConfidenceLevel;
    reasoning?: string;
  } | null;
  confidence?: ConfidenceLevel;
  reasoning?: string;
  speaker_name?: string;
  call_id?: string;
  call_date?: string;
  gong_url?: string;
  mention_count?: number;
  status: string;
  all_snippets?: Snippet[];
}

export interface MatchReviewCompany {
  total_unmatched: number;
  total_with_suggestions?: number;
  items: MatchReviewItem[];
}

export interface MatchReviewData {
  generated: string;
  companies: Record<string, MatchReviewCompany>;
}

// --- Valid account names ---

export const VALID_ACCOUNTS = [
  "abbvie",
  "astrazeneca",
  "gsk",
  "lilly",
  "novartis",
  "regeneron",
  "roche",
] as const;

export type ValidAccount = (typeof VALID_ACCOUNTS)[number];

export function isValidAccount(account: string): account is ValidAccount {
  return VALID_ACCOUNTS.includes(account.toLowerCase() as ValidAccount);
}
