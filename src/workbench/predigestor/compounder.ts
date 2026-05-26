import type { ApiConfig } from '../types-shared';
import type { DocumentChunk } from './chunker';
import { callLLM } from '../lib/apiConfig';
import {
  writeWikiPage,
  readWikiPage,
  listWikiPages,
  readWikiPageTitle,
  readAllWikiPages,
} from './schema';
import schemaMarkdown from './schema.md?raw';
import type { AgentOutput, StageRecord } from '../lib/pipelineTypes';
import type { WorkbenchAgentContext } from '../lib/workbenchAgentContext';
import { checkAborted, emitReasoning, buildAgentOutput } from '../lib/workbenchAgentContext';

export interface CompoundCallbacks {
  onReasoningChunk?: (chunk: string) => void;
  onStepComplete?: (step: string, pagesAffected: string[]) => void;
}

export interface CompoundResult {
  success: boolean;
  pagesAffected: string[];
  error?: string;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_.-]/g, '_').replace(/_+/g, '_');
}

function formatChunksForPrompt(chunks: DocumentChunk[]): string {
  return chunks
    .map(
      (c, i) =>
        `## Chunk ${i + 1}\n` +
        `**Anchor:** ${c.anchor}\n` +
        `**Lines:** ${c.startLine}-${c.endLine}\n\n` +
        `${c.text}\n`
    )
    .join('\n---\n\n');
}

function parseFileBlocks(output: string): Array<{ path: string; content: string }> {
  const pages: Array<{ path: string; content: string }> = [];
  const regex = /---FILE:\s*([^\n]+)---\n([\s\S]*?)(?=---FILE:|---END---|$)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(output)) !== null) {
    const path = match[1].trim();
    let content = match[2].trim();
    content = content.replace(/---END---\s*$/, '').trim();
    pages.push({ path, content });
  }
  return pages;
}

async function getPageCatalog(wikiId: string): Promise<string> {
  const pages = await listWikiPages(wikiId);
  const lines: string[] = [];
  for (const path of pages) {
    const title = await readWikiPageTitle(path, wikiId);
    lines.push(`- ${path}: ${title}`);
  }
  return lines.join('\n') || '(no pages yet)';
}

async function getExistingPagesInFolder(folder: string, wikiId: string): Promise<string> {
  const pages = await listWikiPages(wikiId);
  const prefix = folder.endsWith('/') ? folder : `${folder}/`;
  const filtered = pages.filter((p) => p.startsWith(prefix));
  const lines: string[] = [];
  for (const path of filtered) {
    const content = await readWikiPage(path, wikiId);
    const preview = content ? content.split('\n').slice(0, 6).join('\n') : '(empty)';
    lines.push(`## ${path}\n${preview}\n`);
  }
  return lines.join('\n') || '(no existing pages)';
}

async function getFullWikiContext(wikiId: string, maxChars: number = 8000): Promise<string> {
  const allPages = await readAllWikiPages(wikiId);
  let context = '';
  for (const [path, content] of Object.entries(allPages)) {
    const snippet = `## ${path}\n${content.slice(0, 1500)}\n\n`;
    if (context.length + snippet.length > maxChars) break;
    context += snippet;
  }
  return context || '(wiki is empty)';
}

// ---------------------------------------------------------------------------
// Step 1: Source summary
// ---------------------------------------------------------------------------
async function step1SourceSummary(
  documentName: string,
  chunks: DocumentChunk[],
  apiConfig: ApiConfig,
  wikiId: string,
  callbacks?: CompoundCallbacks,
  signal?: AbortSignal
): Promise<string> {
  const safeDocName = sanitizeFilename(documentName);
  const path = `sources/${safeDocName}.md`;

  callbacks?.onReasoningChunk?.(`[Compound] Step 1/6: Writing source summary for ${documentName}...`);

  const prompt =
    `${schemaMarkdown}\n\n` +
    `You are compounding a new document into an existing investigative wiki.\n\n` +
    `# Document: ${documentName}\n\n` +
    `${formatChunksForPrompt(chunks)}\n\n` +
    `Write a source summary page for \`${path}\`.\n\n` +
    `Requirements:\n` +
    `- Start with an H1 heading matching the document name\n` +
    `- Brief scope paragraph\n` +
    `- Key themes as bullet points\n` +
    `- Notable people, organizations, locations mentioned\n` +
    `- Important claims with citation anchors like (${documentName} lines X-Y)\n` +
    `- Use [[wikilink]] syntax for cross-references\n` +
    `- Note any relationships to other sources if you can infer them\n\n` +
    `Output ONLY the markdown content for the page. Do not wrap in delimiters.`;

  const { content, reasoning } = await callLLM(apiConfig, prompt, undefined, signal);
  if (reasoning) callbacks?.onReasoningChunk?.(reasoning);

  await writeWikiPage(path, content.trim(), wikiId);
  callbacks?.onStepComplete?.('source-summary', [path]);
  return content.trim();
}

// ---------------------------------------------------------------------------
// Step 2: Index update
// ---------------------------------------------------------------------------
async function step2Index(
  documentName: string,
  newPages: string[],
  apiConfig: ApiConfig,
  wikiId: string,
  callbacks?: CompoundCallbacks,
  signal?: AbortSignal
): Promise<void> {
  callbacks?.onReasoningChunk?.(`[Compound] Step 2/6: Updating index.md...`);

  const catalog = await getPageCatalog(wikiId);

  const prompt =
    `${schemaMarkdown}\n\n` +
    `You are updating the wiki index after compounding a new document.\n\n` +
    `# All pages currently in the wiki:\n${catalog}\n\n` +
    `# New document just added: ${documentName}\n` +
    `# New pages created: ${newPages.join(', ') || 'none yet'}\n\n` +
    `Write the complete content for \`index.md\`.\n\n` +
    `Requirements:\n` +
    `- H1: # Wiki Index\n` +
    `- Group by category: Sources, Entities, Concepts, Findings, Log\n` +
    `- For each page, list: \`- [[Page Title]]\` — one-line summary\n` +
    `- Ensure every page is listed\n` +
    `- Include a brief intro paragraph at the top\n` +
    `- If sources relate to each other, note those connections\n\n` +
    `Output ONLY the markdown content for index.md.`;

  const { content, reasoning } = await callLLM(apiConfig, prompt, undefined, signal);
  if (reasoning) callbacks?.onReasoningChunk?.(reasoning);

  await writeWikiPage('index.md', content.trim(), wikiId);
  callbacks?.onStepComplete?.('index', ['index.md']);
}

// ---------------------------------------------------------------------------
// Step 3: Entities
// ---------------------------------------------------------------------------
async function step3Entities(
  documentName: string,
  sourceSummary: string,
  apiConfig: ApiConfig,
  wikiId: string,
  callbacks?: CompoundCallbacks,
  signal?: AbortSignal
): Promise<string[]> {
  callbacks?.onReasoningChunk?.(`[Compound] Step 3/6: Extracting and merging entities...`);

  const existing = await getExistingPagesInFolder('entities', wikiId);
  const wikiContext = await getFullWikiContext(wikiId, 4000);

  const prompt =
    `${schemaMarkdown}\n\n` +
    `You are compounding a new source into an existing investigative wiki.\n\n` +
    `# Source summary:\n${sourceSummary.slice(0, 3000)}\n\n` +
    `# Existing entity pages:\n${existing.slice(0, 3000)}\n\n` +
    `# Broader wiki context:\n${wikiContext.slice(0, 2000)}\n\n` +
    `Identify all named people, organizations, and locations from the NEW source.\n` +
    `For each entity, write or update a page using this exact format:\n\n` +
    `---FILE: entities/{lowercase-hyphenated-name}.md---\n` +
    `# {Entity Name}\n` +
    `{description with citation anchors like (${documentName} lines X-Y)}\n` +
    `---END---\n\n` +
    `Rules:\n` +
    `- Only include entities actually mentioned in the new source\n` +
    `- If an entity page already exists, MERGE new info into it; do not duplicate existing content\n` +
    `- Add cross-links to related entities, concepts, and findings using [[wikilink]] syntax\n` +
    `- If the new source CONTRADICTS existing info, flag it with a [CONTRADICTION] marker and explain both claims\n` +
    `- If the new source STRENGTHENS existing info, note that explicitly\n` +
    `- Output ONLY the delimited file blocks; no extra commentary`;

  const { content, reasoning } = await callLLM(apiConfig, prompt, undefined, signal);
  if (reasoning) callbacks?.onReasoningChunk?.(reasoning);

  const pages = parseFileBlocks(content);
  const affected: string[] = [];
  for (const page of pages) {
    await writeWikiPage(page.path, page.content, wikiId);
    affected.push(page.path);
  }
  callbacks?.onStepComplete?.('entities', affected);
  return affected;
}

// ---------------------------------------------------------------------------
// Step 4: Concepts
// ---------------------------------------------------------------------------
async function step4Concepts(
  documentName: string,
  sourceSummary: string,
  apiConfig: ApiConfig,
  wikiId: string,
  callbacks?: CompoundCallbacks,
  signal?: AbortSignal
): Promise<string[]> {
  callbacks?.onReasoningChunk?.(`[Compound] Step 4/6: Extracting and merging concepts...`);

  const existing = await getExistingPagesInFolder('concepts', wikiId);
  const wikiContext = await getFullWikiContext(wikiId, 4000);

  const prompt =
    `${schemaMarkdown}\n\n` +
    `You are compounding a new source into an existing investigative wiki.\n\n` +
    `# Source summary:\n${sourceSummary.slice(0, 3000)}\n\n` +
    `# Existing concept pages:\n${existing.slice(0, 3000)}\n\n` +
    `# Broader wiki context:\n${wikiContext.slice(0, 2000)}\n\n` +
    `Identify all themes, legal terms, financial instruments, or other concepts from the NEW source.\n` +
    `For each concept, write or update a page using this exact format:\n\n` +
    `---FILE: concepts/{lowercase-hyphenated-name}.md---\n` +
    `# {Concept Name}\n` +
    `{definition and context with citation anchors like (${documentName} lines X-Y)}\n` +
    `---END---\n\n` +
    `Rules:\n` +
    `- Only include concepts actually relevant to the new source\n` +
    `- If a concept page already exists, MERGE new info into it; do not duplicate existing content\n` +
    `- Add cross-links to related entities and findings using [[wikilink]] syntax\n` +
    `- If the new source CONTRADICTS existing definitions or context, flag it with a [CONTRADICTION] marker\n` +
    `- If the new source STRENGTHENS existing understanding, note that explicitly\n` +
    `- Output ONLY the delimited file blocks; no extra commentary`;

  const { content, reasoning } = await callLLM(apiConfig, prompt, undefined, signal);
  if (reasoning) callbacks?.onReasoningChunk?.(reasoning);

  const pages = parseFileBlocks(content);
  const affected: string[] = [];
  for (const page of pages) {
    await writeWikiPage(page.path, page.content, wikiId);
    affected.push(page.path);
  }
  callbacks?.onStepComplete?.('concepts', affected);
  return affected;
}

// ---------------------------------------------------------------------------
// Step 5: Findings
// ---------------------------------------------------------------------------
async function step5Findings(
  documentName: string,
  sourceSummary: string,
  apiConfig: ApiConfig,
  wikiId: string,
  callbacks?: CompoundCallbacks,
  signal?: AbortSignal
): Promise<string[]> {
  callbacks?.onReasoningChunk?.(`[Compound] Step 5/6: Extracting and merging findings...`);

  const existing = await getExistingPagesInFolder('findings', wikiId);
  const wikiContext = await getFullWikiContext(wikiId, 4000);

  const prompt =
    `${schemaMarkdown}\n\n` +
    `You are compounding a new source into an existing investigative wiki.\n\n` +
    `# Source summary:\n${sourceSummary.slice(0, 3000)}\n\n` +
    `# Existing finding pages:\n${existing.slice(0, 3000)}\n\n` +
    `# Broader wiki context:\n${wikiContext.slice(0, 2000)}\n\n` +
    `Identify all significant claims, facts, or discoveries from the NEW source.\n` +
    `For each finding, write or update a page using this exact format:\n\n` +
    `---FILE: findings/{lowercase-hyphenated-name}.md---\n` +
    `# {Finding Name}\n` +
    `{claim statement with citation anchors like (${documentName} lines X-Y)}\n` +
    `- Confidence: high/medium/low\n` +
    `- Supporting evidence\n` +
    `---END---\n\n` +
    `Rules:\n` +
    `- Only include significant claims actually supported by the new source\n` +
    `- If a finding page already exists, MERGE new info or create a related finding page\n` +
    `- Add cross-links to related entities and concepts using [[wikilink]] syntax\n` +
    `- If the new source CONTRADICTS an existing finding, flag it with a [CONTRADICTION] marker and explain both claims\n` +
    `- If the new source STRENGTHENS or CHALLENGES an existing finding, note that explicitly\n` +
    `- Output ONLY the delimited file blocks; no extra commentary`;

  const { content, reasoning } = await callLLM(apiConfig, prompt, undefined, signal);
  if (reasoning) callbacks?.onReasoningChunk?.(reasoning);

  const pages = parseFileBlocks(content);
  const affected: string[] = [];
  for (const page of pages) {
    await writeWikiPage(page.path, page.content, wikiId);
    affected.push(page.path);
  }
  callbacks?.onStepComplete?.('findings', affected);
  return affected;
}

// ---------------------------------------------------------------------------
// Step 6: Log append
// ---------------------------------------------------------------------------
async function step6Log(
  documentName: string,
  allPages: string[],
  wikiId: string
): Promise<void> {
  const now = new Date().toISOString();
  const entry = `## [${now}] compound | ${documentName}\n- Pages: ${allPages.join(', ')}\n\n`;

  const existing = await readWikiPage('log.md', wikiId);
  const newContent = existing ? existing + '\n' + entry : '# Ingestion Log\n\n' + entry;
  await writeWikiPage('log.md', newContent, wikiId);
}

// ---------------------------------------------------------------------------
// Main compound function
// ---------------------------------------------------------------------------
export async function compoundDocument(
  documentName: string,
  chunks: DocumentChunk[],
  apiConfig: ApiConfig,
  wikiId: string,
  callbacks?: CompoundCallbacks,
  signal?: AbortSignal
): Promise<CompoundResult> {
  const allPages: string[] = [];

  try {
    // Step 1: Source summary
    const sourceSummary = await step1SourceSummary(documentName, chunks, apiConfig, wikiId, callbacks, signal);
    const safeDocName = sanitizeFilename(documentName);
    allPages.push(`sources/${safeDocName}.md`);

    // Step 2: Index
    await step2Index(documentName, allPages, apiConfig, wikiId, callbacks, signal);
    allPages.push('index.md');

    // Step 3: Entities
    const entityPages = await step3Entities(documentName, sourceSummary, apiConfig, wikiId, callbacks, signal);
    allPages.push(...entityPages);

    // Step 4: Concepts
    const conceptPages = await step4Concepts(documentName, sourceSummary, apiConfig, wikiId, callbacks, signal);
    allPages.push(...conceptPages);

    // Step 5: Findings
    const findingPages = await step5Findings(documentName, sourceSummary, apiConfig, wikiId, callbacks, signal);
    allPages.push(...findingPages);

    // Re-update index with all pages
    await step2Index(documentName, allPages, apiConfig, wikiId, callbacks, signal);

    // Step 6: Log
    await step6Log(documentName, allPages, wikiId);
    allPages.push('log.md');

    callbacks?.onReasoningChunk?.(`[Compound] Complete. ${allPages.length} pages affected.`);

    return {
      success: true,
      pagesAffected: [...new Set(allPages)],
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    callbacks?.onReasoningChunk?.(`[Compound] Error: ${error}`);
    return {
      success: false,
      pagesAffected: allPages,
      error,
    };
  }
}

/**
 * AgentFn implementation of document compounding.
 * Receives { documentName, chunks } JSON via `ctx.currentDraft`.
 */
export async function compoundDocumentAgent(
  ctx: WorkbenchAgentContext,
  onReasoningChunk: (chunk: string) => void,
  onUpdate?: (partial: Partial<StageRecord>) => void
): Promise<AgentOutput> {
  checkAborted(ctx);
  const input = JSON.parse(ctx.currentDraft) as { documentName: string; chunks: DocumentChunk[] };
  const documentName = input.documentName;
  const chunks = input.chunks;
  const apiConfig = ctx.apiConfig;
  const wikiId = ctx.wikiId ?? 'default';
  const allPages: string[] = [];

  const stepCallbacks: CompoundCallbacks = {
    onReasoningChunk: (chunk) => emitReasoning(chunk, onReasoningChunk, onUpdate),
    onStepComplete: (step, pages) => {
      emitReasoning(`[Compound] Step complete: ${step} → ${pages.join(', ')}`, onReasoningChunk, onUpdate);
    },
  };

  // Step 1: Source summary
  const sourceSummary = await step1SourceSummary(documentName, chunks, apiConfig, wikiId, stepCallbacks, ctx.abortSignal);
  const safeDocName = sanitizeFilename(documentName);
  allPages.push(`sources/${safeDocName}.md`);

  // Step 2: Index
  await step2Index(documentName, allPages, apiConfig, wikiId, stepCallbacks, ctx.abortSignal);
  allPages.push('index.md');

  // Step 3: Entities
  const entityPages = await step3Entities(documentName, sourceSummary, apiConfig, wikiId, stepCallbacks, ctx.abortSignal);
  allPages.push(...entityPages);

  // Step 4: Concepts
  const conceptPages = await step4Concepts(documentName, sourceSummary, apiConfig, wikiId, stepCallbacks, ctx.abortSignal);
  allPages.push(...conceptPages);

  // Step 5: Findings
  const findingPages = await step5Findings(documentName, sourceSummary, apiConfig, wikiId, stepCallbacks, ctx.abortSignal);
  allPages.push(...findingPages);

  // Re-update index with all pages
  await step2Index(documentName, allPages, apiConfig, wikiId, stepCallbacks, ctx.abortSignal);

  // Step 6: Log
  await step6Log(documentName, allPages, wikiId);
  allPages.push('log.md');

  emitReasoning(`[Compound] Complete. ${allPages.length} pages affected.`, onReasoningChunk, onUpdate);

  const uniquePages = [...new Set(allPages)];
  return buildAgentOutput({
    draft: JSON.stringify({ pagesAffected: uniquePages }),
    reasoning: `Compounded ${documentName} into wiki ${wikiId}. ${uniquePages.length} pages affected.`,
    metadata: { pagesAffected: uniquePages },
  });
}
