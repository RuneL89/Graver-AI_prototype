/**
 * Workbench stage definitions and routing logic for the AI Investigative Workbench.
 *
 * Tip Router flow: decompose → research → synthesize → audit → (rewrite → audit loop) → assemble
 * Pre-Digestor stages: ingest, query, lint (user-triggered, not sequential)
 */

import type { StageId, StageRecord, PipelineState } from './pipelineTypes';
import type { EvidenceAudit } from '../types';

export const WORKBENCH_TIP_ROUTER_STAGE_DEFS: Omit<
  StageRecord,
  'status' | 'iteration' | 'reasoning' | 'output' | 'metadata' | 'startedAt' | 'completedAt'
>[] = [
  { id: 'decompose', name: 'Tip Decomposer', shortName: 'Decompose', icon: 'GitBranch' },
  { id: 'research', name: 'Parallel Research', shortName: 'Research', icon: 'Search' },
  { id: 'synthesize', name: 'Evidence Synthesizer', shortName: 'Synthesize', icon: 'Combine' },
  { id: 'audit', name: 'Evidence Auditor', shortName: 'Audit', icon: 'Scale' },
  { id: 'rewrite', name: 'Evidence Writer', shortName: 'Rewrite', icon: 'Pencil' },
  { id: 'assemble', name: 'Report Assembler', shortName: 'Assemble', icon: 'FileText' },
];

export const WORKBENCH_PREDIGESTOR_STAGE_DEFS: Omit<
  StageRecord,
  'status' | 'iteration' | 'reasoning' | 'output' | 'metadata' | 'startedAt' | 'completedAt'
>[] = [
  { id: 'ingest', name: 'Document Ingestor', shortName: 'Ingest', icon: 'Database' },
  { id: 'query', name: 'Wiki Querier', shortName: 'Query', icon: 'Search' },
  { id: 'lint', name: 'Wiki Linter', shortName: 'Lint', icon: 'Stethoscope' },
];

export const WORKBENCH_TIP_ROUTER_ORDER: StageId[] = [
  'decompose',
  'research',
  'synthesize',
  'audit',
  'rewrite',
  'assemble',
];

/**
 * Determine the next stage for the workbench Tip Router pipeline.
 *
 * Routing rules:
 * - decompose → research
 * - research → synthesize
 * - synthesize → audit
 * - audit:
 *   - if metadata.audit.approval_status === 'REJECTED' → rewrite
 *   - if APPROVED → assemble
 * - rewrite → audit (loop back)
 * - assemble → COMPLETE
 *
 * Pre-Digestor stages are standalone:
 * - ingest → COMPLETE
 * - query → COMPLETE
 * - lint → COMPLETE
 */
export async function getWorkbenchNextStage(
  current: StageId,
  metadata: unknown,
  _draft: string,
  _state: PipelineState
): Promise<StageId | 'COMPLETE'> {
  switch (current) {
    case 'decompose':
      return 'research';

    case 'research':
      return 'synthesize';

    case 'synthesize':
      return 'audit';

    case 'audit': {
      const audit = extractAudit(metadata);
      if (audit?.approval_status === 'REJECTED') {
        return 'rewrite';
      }
      return 'assemble';
    }

    case 'rewrite':
      return 'audit';

    case 'assemble':
      return 'COMPLETE';

    case 'ingest':
    case 'query':
    case 'lint':
      return 'COMPLETE';

    default:
      return 'COMPLETE';
  }
}

/**
 * Extract an EvidenceAudit from stage metadata.
 * Handles both { audit: EvidenceAudit } and { auditResult: EvidenceAudit } shapes.
 */
function extractAudit(metadata: unknown): EvidenceAudit | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const m = metadata as Record<string, unknown>;
  if (m.audit && typeof m.audit === 'object') {
    return m.audit as EvidenceAudit;
  }
  if (m.auditResult && typeof m.auditResult === 'object') {
    return m.auditResult as EvidenceAudit;
  }
  return undefined;
}
