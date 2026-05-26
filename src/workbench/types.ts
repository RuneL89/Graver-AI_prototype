/**
 * Workbench-specific types for the AI Investigative Workbench.
 *
 * These types extend the shared newsroom types with structures for
 * tip decomposition, evidence collection, wiki management, and report assembly.
 */

// ---------------------------------------------------------------------------
// Tip Router
// ---------------------------------------------------------------------------

export interface Tip {
  id: string;
  text: string;
  createdAt: string;
}

export interface SubClaim {
  id: string;
  question: string;
  claim: string;
}

export interface ResearchPlan {
  tipId: string;
  subClaims: SubClaim[];
  createdAt: string;
}

export interface EvidenceFinding {
  id: string;
  subClaimId: string;
  sourceType: 'web' | 'document';
  sourceUrl?: string;
  documentRef?: string;
  citationAnchor?: string;
  passage: string;
  summary: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ExternalEvidence {
  findings: EvidenceFinding[];
}

export interface InternalEvidence {
  findings: EvidenceFinding[];
}

export interface SynthesisSource {
  sourceType: 'web' | 'document';
  ref: string;
  citationAnchor?: string;
  passage: string;
}

export interface SynthesisContradiction {
  between: [string, string];
  description: string;
}

export interface SynthesisEntry {
  subClaimId: string;
  supportingSources: SynthesisSource[];
  contradictions: SynthesisContradiction[];
  gaps: string[];
}

export interface Synthesis {
  tipId: string;
  entries: SynthesisEntry[];
  createdAt: string;
}

export interface EvidenceAudit {
  approval_status: 'APPROVED' | 'REJECTED';
  mechanical_pass: boolean;
  qualitative_pass: boolean;
  rewriter_instructions?: string;
  has_feedback: boolean;
}

export interface EvidenceMemo {
  tip: Tip;
  researchPlan: ResearchPlan;
  findings: SynthesisEntry[];
  contradictions: SynthesisContradiction[];
  gaps: string[];
  confidenceSummary: Record<string, 'high' | 'medium' | 'low'>;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Document Pre-Digestor (Wiki)
// ---------------------------------------------------------------------------

export interface WikiPage {
  path: string;
  title: string;
  content: string;
  lastUpdated: string;
  sourceRefs: string[];
}

export interface WikiIndex {
  pages: Array<{ path: string; title: string }>;
  lastUpdated: string;
}

export interface WikiLogEntry {
  timestamp: string;
  action: 'created' | 'updated' | 'compounded';
  sourceDocument: string;
  pagesAffected: string[];
}

// ---------------------------------------------------------------------------
// Session / Config
// ---------------------------------------------------------------------------

export interface WorkbenchSessionConfig {
  id: string;
  name: string;
  createdAt: string;
  apiConfig: import('./types-shared').ApiConfig;
  braveApiKey: string;
  braveProxyUrl: string;
}
