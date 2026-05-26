import type { ApiConfig } from '../types-shared';
import type { SubClaim, EvidenceFinding } from '../types';
import { queryWiki } from '../predigestor/querier';
import { dbSet } from '../lib/fileManager';

export interface WikiResearchCallbacks {
  onReasoningChunk?: (chunk: string) => void;
}

export interface WikiResearchResult {
  success: boolean;
  findings: EvidenceFinding[];
  error?: string;
}

function generateFindingId(index: number): string {
  return `doc-${Date.now()}-${index}`;
}

/**
 * Research a single sub-claim against the local wiki.
 */
export async function researchSubClaimWiki(
  subClaim: SubClaim,
  apiConfig: ApiConfig,
  wikiId: string | null,
  callbacks?: WikiResearchCallbacks
): Promise<WikiResearchResult> {
  if (!wikiId) {
    callbacks?.onReasoningChunk?.('[WikiQuerier] No wiki selected. Skipping internal evidence.');
    return { success: true, findings: [] };
  }

  try {
    callbacks?.onReasoningChunk?.(`[WikiQuerier] Querying wiki for: ${subClaim.question}`);

    const result = await queryWiki(
      subClaim.question,
      apiConfig,
      wikiId,
      {
        onReasoningChunk: (chunk) => {
          callbacks?.onReasoningChunk?.(chunk);
        },
      }
    );

    if (!result.success) {
      if (result.error?.includes('empty') || result.error?.includes('No index')) {
        callbacks?.onReasoningChunk?.('[WikiQuerier] Wiki is empty. No internal evidence.');
        return { success: true, findings: [] };
      }
      throw new Error(result.error || 'Wiki query failed');
    }

    // If answer is empty or says no info, return empty findings
    if (!result.answer.trim() || result.answer.toLowerCase().includes('does not contain')) {
      callbacks?.onReasoningChunk?.('[WikiQuerier] No relevant info found in wiki.');
      return { success: true, findings: [] };
    }

    const findings: EvidenceFinding[] = [
      {
        id: generateFindingId(0),
        subClaimId: subClaim.id,
        sourceType: 'document',
        documentRef: `wiki:${wikiId}`,
        citationAnchor: result.pagesRead.join(', '),
        passage: result.answer,
        summary: `Wiki query for: ${subClaim.question}`,
        confidence: 'medium',
      },
    ];

    callbacks?.onReasoningChunk?.(`[WikiQuerier] Found evidence from pages: ${result.pagesRead.join(', ')}`);

    return { success: true, findings };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    callbacks?.onReasoningChunk?.(`[WikiQuerier] Error: ${error}`);
    return { success: false, findings: [], error };
  }
}

/**
 * Save internal evidence to IndexedDB.
 */
export async function saveInternalEvidence(
  tipId: string,
  findings: EvidenceFinding[]
): Promise<void> {
  await dbSet(`internal-evidence/${tipId}`, JSON.stringify({ findings }, null, 2));
}
