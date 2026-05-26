/**
 * Workbench AgentMap — maps stage IDs to AgentFn implementations.
 *
 * Tip Router agents handle the investigative pipeline (decompose → research → ... → assemble).
 * Pre-Digestor agents handle document ingestion, wiki query, and wiki lint.
 */

import type { AgentFn } from './pipelineTypes';

// Tip Router agents
import { decomposeTipAgent } from '../tiprouter/decomposer';
import { synthesizeEvidenceAgent } from '../tiprouter/synthesizer';
import { rewriteSynthesisAgent } from '../tiprouter/evidenceWriter';
import { assembleEvidenceMemoAgent } from '../tiprouter/reportAssembler';
import { researchLoopAgent } from '../tiprouter/researchLoop';
import { auditAgent } from '../tiprouter/auditor';

// Pre-Digestor agents
import { ingestDocumentAgent } from '../predigestor/ingestor';
import { queryWikiAgent } from '../predigestor/querier';
import { lintWikiAgent } from '../predigestor/linter';

/**
 * Agent map for the Tip Router pipeline.
 */
export const workbenchTipRouterAgentMap: Record<string, AgentFn> = {
  decompose: decomposeTipAgent as AgentFn,
  research: researchLoopAgent as AgentFn,
  synthesize: synthesizeEvidenceAgent as AgentFn,
  audit: auditAgent as AgentFn,
  rewrite: rewriteSynthesisAgent as AgentFn,
  assemble: assembleEvidenceMemoAgent as AgentFn,
};

/**
 * Agent map for the Pre-Digestor operations.
 */
export const workbenchPredigestorAgentMap: Record<string, AgentFn> = {
  ingest: ingestDocumentAgent as AgentFn,
  query: queryWikiAgent as AgentFn,
  lint: lintWikiAgent as AgentFn,
};

/**
 * Combined agent map for all workbench stages.
 */
export const workbenchAgentMap: Record<string, AgentFn> = {
  ...workbenchTipRouterAgentMap,
  ...workbenchPredigestorAgentMap,
};
