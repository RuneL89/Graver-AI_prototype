import type { ApiConfig } from '../types-shared';
import type { SubClaim, EvidenceFinding } from '../types';
import { callLLM } from '../lib/apiConfig';
import { dbSet } from '../lib/fileManager';

export interface WebResearchCallbacks {
  onReasoningChunk?: (chunk: string) => void;
}

export interface WebResearchResult {
  success: boolean;
  findings: EvidenceFinding[];
  error?: string;
}

interface BraveSearchResult {
  web?: {
    results?: Array<{
      title: string;
      url: string;
      description: string;
    }>;
  };
}

async function searchBrave(
  query: string,
  apiKey: string,
  proxyUrl: string,
  count: number = 5
): Promise<BraveSearchResult> {
  const braveUrl = new URL('https://api.search.brave.com/res/v1/web/search');
  braveUrl.searchParams.set('q', query);
  braveUrl.searchParams.set('count', String(count));

  const targetUrl = proxyUrl?.trim()
    ? `${proxyUrl.trim()}?url=${encodeURIComponent(braveUrl.toString())}`
    : braveUrl.toString();

  const response = await fetch(targetUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': apiKey.trim(),
    },
  });

  if (!response.ok) {
    throw new Error(`Brave Search failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchPageText(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Mozilla/5.0 (compatible; AI-Workbench/1.0)',
      },
    });
    if (!response.ok) return '';
    const html = await response.text();
    // Very basic HTML-to-text extraction
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);
  } catch {
    return '';
  }
}

function generateFindingId(index: number): string {
  return `web-${Date.now()}-${index}`;
}

/**
 * Research a single sub-claim using Brave Search + LLM extraction.
 */
export async function researchSubClaimWeb(
  subClaim: SubClaim,
  apiConfig: ApiConfig,
  braveApiKey: string,
  braveProxyUrl: string,
  callbacks?: WebResearchCallbacks
): Promise<WebResearchResult> {
  const findings: EvidenceFinding[] = [];

  try {
    callbacks?.onReasoningChunk?.(`[WebResearcher] Searching: ${subClaim.question}`);

    const searchResults = await searchBrave(subClaim.question, braveApiKey, braveProxyUrl, 5);
    const results = searchResults.web?.results || [];

    if (results.length === 0) {
      callbacks?.onReasoningChunk?.(`[WebResearcher] No search results for: ${subClaim.question}`);
      return { success: true, findings: [] };
    }

    callbacks?.onReasoningChunk?.(`[WebResearcher] Found ${results.length} results. Extracting passages...`);

    // Fetch top 3 pages for extraction
    const pagesToFetch = results.slice(0, 3);
    const pageTexts: Array<{ url: string; title: string; text: string }> = [];

    for (const result of pagesToFetch) {
      const text = await fetchPageText(result.url);
      if (text.length > 200) {
        pageTexts.push({ url: result.url, title: result.title, text });
      }
    }

    if (pageTexts.length === 0) {
      callbacks?.onReasoningChunk?.(`[WebResearcher] Could not fetch any pages for: ${subClaim.question}`);
      return { success: true, findings: [] };
    }

    const prompt =
      `You are analyzing web sources for an investigative research task.\n\n` +
      `# Sub-claim:\nQuestion: ${subClaim.question}\nClaim: ${subClaim.claim}\n\n` +
      `# Web sources:\n` +
      pageTexts
        .map((p, i) => `## Source ${i + 1}: ${p.title}\nURL: ${p.url}\n${p.text.slice(0, 4000)}\n`)
        .join('\n---\n') +
      `\n\nFor each source that contains relevant evidence, extract:\n` +
      `- The most relevant passage (1–3 sentences)\n` +
      `- A one-sentence summary of how it relates to the sub-claim\n` +
      `- Confidence: high / medium / low\n\n` +
      `Output format (JSON array):\n` +
      `[\n` +
      `  {\n` +
      `    "sourceUrl": "...",\n` +
      `    "passage": "...",\n` +
      `    "summary": "...",\n` +
      `    "confidence": "high"\n` +
      `  }\n` +
      `]\n\n` +
      `Only include sources with actual relevance. Output ONLY valid JSON.`;

    const { content, reasoning } = await callLLM(apiConfig, prompt);
    if (reasoning) callbacks?.onReasoningChunk?.(reasoning);

    let parsed: Array<{
      sourceUrl: string;
      passage: string;
      summary: string;
      confidence: string;
    }>;
    try {
      parsed = JSON.parse(content.trim());
    } catch {
      const match = content.match(/```json\n([\s\S]*?)\n```/);
      if (match) {
        parsed = JSON.parse(match[1].trim());
      } else {
        parsed = [];
      }
    }

    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      const confidence = ['high', 'medium', 'low'].includes(item.confidence)
        ? (item.confidence as 'high' | 'medium' | 'low')
        : 'medium';

      findings.push({
        id: generateFindingId(i),
        subClaimId: subClaim.id,
        sourceType: 'web',
        sourceUrl: item.sourceUrl,
        passage: item.passage,
        summary: item.summary,
        confidence,
      });
    }

    callbacks?.onReasoningChunk?.(`[WebResearcher] Extracted ${findings.length} findings.`);

    return { success: true, findings };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    callbacks?.onReasoningChunk?.(`[WebResearcher] Error: ${error}`);
    return { success: false, findings, error };
  }
}

/**
 * Save external evidence to IndexedDB.
 */
export async function saveExternalEvidence(
  tipId: string,
  findings: EvidenceFinding[]
): Promise<void> {
  await dbSet(`external-evidence/${tipId}`, JSON.stringify({ findings }, null, 2));
}
