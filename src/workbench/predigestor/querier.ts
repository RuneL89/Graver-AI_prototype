import type { ApiConfig } from '../types-shared';
import { callLLM } from '../lib/apiConfig';
import { readWikiPage, listWikiPages } from './schema';
import schemaMarkdown from './schema.md?raw';

export interface QueryCallbacks {
  onReasoningChunk?: (chunk: string) => void;
}

export interface QueryResult {
  success: boolean;
  answer: string;
  pagesRead: string[];
  error?: string;
}

/**
 * Query the wiki by reading the index first, then drilling into relevant pages,
 * and synthesizing an answer with citations.
 */
export async function queryWiki(
  question: string,
  apiConfig: ApiConfig,
  wikiId: string = 'default',
  callbacks?: QueryCallbacks
): Promise<QueryResult> {
  try {
    callbacks?.onReasoningChunk?.('[Query] Reading index.md...');
    const indexContent = await readWikiPage('index.md', wikiId);
    if (!indexContent) {
      return {
        success: false,
        answer: '',
        pagesRead: [],
        error: 'Wiki is empty. No index.md found.',
      };
    }

    // Step 1: Ask LLM which pages are relevant
    callbacks?.onReasoningChunk?.('[Query] Identifying relevant pages...');
    const relevancePrompt =
      `${schemaMarkdown}\n\n` +
      `You are querying an investigative wiki.\n\n` +
      `# Question:\n${question}\n\n` +
      `# Wiki Index:\n${indexContent.slice(0, 4000)}\n\n` +
      `Based on the index, list the page paths (one per line) that are most relevant to answering this question.\n` +
      `Format: just the paths, no bullets, no explanations.\n` +
      `If the question is about the overall wiki, include index.md.\n` +
      `Include at most 5 pages.`;

    const { content: relevanceRaw, reasoning: relevanceReasoning } = await callLLM(
      apiConfig,
      relevancePrompt
    );
    if (relevanceReasoning) callbacks?.onReasoningChunk?.(relevanceReasoning);

    const relevantPaths = relevanceRaw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('-'))
      .slice(0, 5);

    // Validate paths exist
    const allPages = await listWikiPages(wikiId);
    const validPaths = relevantPaths.filter((p) => allPages.includes(p));
    if (validPaths.length === 0) {
      // Fallback: include index if nothing matched
      validPaths.push('index.md');
    }

    // Step 2: Read relevant pages
    callbacks?.onReasoningChunk?.(`[Query] Reading ${validPaths.length} page(s)...`);
    const pageContents: string[] = [];
    for (const path of validPaths) {
      const content = await readWikiPage(path, wikiId);
      if (content) {
        pageContents.push(`## ${path}\n${content.slice(0, 3000)}\n`);
      }
    }

    // Step 3: Synthesize answer
    callbacks?.onReasoningChunk?.('[Query] Synthesizing answer...');
    const synthesisPrompt =
      `${schemaMarkdown}\n\n` +
      `You are answering a question using an investigative wiki.\n\n` +
      `# Question:\n${question}\n\n` +
      `# Relevant wiki pages:\n${pageContents.join('\n')}\n\n` +
      `Synthesize a clear, concise answer.\n` +
      `- Cite specific claims using the citation anchors from the wiki pages\n` +
      `- Mention which wiki pages support each part of the answer\n` +
      `- If the wiki does not contain enough information, say so explicitly\n` +
      `- Keep the answer factual and grounded in the source material`;

    const { content: answer, reasoning: synthesisReasoning } = await callLLM(
      apiConfig,
      synthesisPrompt
    );
    if (synthesisReasoning) callbacks?.onReasoningChunk?.(synthesisReasoning);

    return {
      success: true,
      answer: answer.trim(),
      pagesRead: validPaths,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    callbacks?.onReasoningChunk?.(`[Query] Error: ${error}`);
    return {
      success: false,
      answer: '',
      pagesRead: [],
      error,
    };
  }
}
