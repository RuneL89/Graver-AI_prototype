import type { ApiConfig } from '../types-shared';
import type { DocumentChunk } from './chunker';
import { callLLM } from '../lib/apiConfig';
import {
  writeWikiPage,
  readWikiPage,
  listWikiPages,
  readWikiPageTitle,
} from './schema';
import schemaMarkdown from './schema.md?raw';

export interface IngestCallbacks {
  onReasoningChunk?: (chunk: string) => void;
  onStepComplete?: (step: string, pagesAffected: string[]) => void;
}

export interface IngestResult {
  success: boolean;
  pagesGenerated: string[];
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
    const preview = content ? content.split('\n').slice(0, 3).join('\n') : '(empty)';
    lines.push(`## ${path}\n${preview}\n`);
  }
  return lines.join('\n') || '(no existing pages)';
}

// ---------------------------------------------------------------------------
// Step 1: Source summary
// ---------------------------------------------------------------------------
async function step1SourceSummary(
  documentName: string,
  chunks: DocumentChunk[],
  apiConfig: ApiConfig,
  wikiId: string,
  callbacks?: IngestCallbacks
): Promise<string> {
  const safeDocName = sanitizeFilename(documentName);
  const path = `sources/${safeDocName}.md`;

  callbacks?.onReasoningChunk?.(`[Ingest] Step 1/6: Writing source summary for ${documentName}...`);

  const prompt =
    `${schemaMarkdown}\n\n` +
    `You are ingesting a new document into an investigative wiki.\n\n` +
    `# Document: ${documentName}\n\n` +
    `${formatChunksForPrompt(chunks)}\n\n` +
    `Write a source summary page for \`${path}\`.\n\n` +
    `Requirements:\n` +
    `- Start with an H1 heading matching the document name\n` +
    `- Brief scope paragraph\n` +
    `- Key themes as bullet points\n` +
    `- Notable people, organizations, locations mentioned\n` +
    `- Important claims with citation anchors like (${documentName} lines X-Y)\n` +
    `- Use [[wikilink]] syntax for cross-references\n\n` +
    `Output ONLY the markdown content for the page. Do not wrap in delimiters.`;

  const { content, reasoning } = await callLLM(apiConfig, prompt);
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
  callbacks?: IngestCallbacks
): Promise<void> {
  callbacks?.onReasoningChunk?.(`[Ingest] Step 2/6: Updating index.md...`);

  const catalog = await getPageCatalog(wikiId);

  const prompt =
    `${schemaMarkdown}\n\n` +
    `You are updating the wiki index after ingesting a new document.\n\n` +
    `# All pages currently in the wiki:\n${catalog}\n\n` +
    `# New document just added: ${documentName}\n` +
    `# New pages created: ${newPages.join(', ') || 'none yet'}\n\n` +
    `Write the complete content for \`index.md\`.\n\n` +
    `Requirements:\n` +
    `- H1: # Wiki Index\n` +
    `- Group by category: Sources, Entities, Concepts, Findings, Log\n` +
    `- For each page, list: \`- [[Page Title]]\` — one-line summary\n` +
    `- Ensure every page is listed\n` +
    `- Include a brief intro paragraph at the top\n\n` +
    `Output ONLY the markdown content for index.md.`;

  const { content, reasoning } = await callLLM(apiConfig, prompt);
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
  callbacks?: IngestCallbacks
): Promise<string[]> {
  callbacks?.onReasoningChunk?.(`[Ingest] Step 3/6: Extracting entities...`);

  const existing = await getExistingPagesInFolder('entities', wikiId);

  const prompt =
    `${schemaMarkdown}\n\n` +
    `You are extracting entities from a newly ingested source.\n\n` +
    `# Source summary:\n${sourceSummary.slice(0, 3000)}\n\n` +
    `# Existing entity pages:\n${existing.slice(0, 2000)}\n\n` +
    `Identify all named people, organizations, and locations.\n` +
    `For each entity, write or update a page using this exact format:\n\n` +
    `---FILE: entities/{lowercase-hyphenated-name}.md---\n` +
    `# {Entity Name}\n` +
    `{description with citation anchors like (${documentName} lines X-Y)}\n` +
    `---END---\n\n` +
    `Rules:\n` +
    `- Only include entities actually mentioned in the source\n` +
    `- If an entity page already exists, merge new info into it\n` +
    `- Use [[wikilink]] syntax for cross-references\n` +
    `- Output ONLY the delimited file blocks; no extra commentary`;

  const { content, reasoning } = await callLLM(apiConfig, prompt);
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
  callbacks?: IngestCallbacks
): Promise<string[]> {
  callbacks?.onReasoningChunk?.(`[Ingest] Step 4/6: Extracting concepts...`);

  const existing = await getExistingPagesInFolder('concepts', wikiId);

  const prompt =
    `${schemaMarkdown}\n\n` +
    `You are extracting concepts from a newly ingested source.\n\n` +
    `# Source summary:\n${sourceSummary.slice(0, 3000)}\n\n` +
    `# Existing concept pages:\n${existing.slice(0, 2000)}\n\n` +
    `Identify all themes, legal terms, financial instruments, or other concepts.\n` +
    `For each concept, write or update a page using this exact format:\n\n` +
    `---FILE: concepts/{lowercase-hyphenated-name}.md---\n` +
    `# {Concept Name}\n` +
    `{definition and context with citation anchors like (${documentName} lines X-Y)}\n` +
    `---END---\n\n` +
    `Rules:\n` +
    `- Only include concepts actually relevant to the source\n` +
    `- If a concept page already exists, merge new info into it\n` +
    `- Use [[wikilink]] syntax for cross-references\n` +
    `- Output ONLY the delimited file blocks; no extra commentary`;

  const { content, reasoning } = await callLLM(apiConfig, prompt);
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
  callbacks?: IngestCallbacks
): Promise<string[]> {
  callbacks?.onReasoningChunk?.(`[Ingest] Step 5/6: Extracting findings...`);

  const existing = await getExistingPagesInFolder('findings', wikiId);

  const prompt =
    `${schemaMarkdown}\n\n` +
    `You are extracting findings from a newly ingested source.\n\n` +
    `# Source summary:\n${sourceSummary.slice(0, 3000)}\n\n` +
    `# Existing finding pages:\n${existing.slice(0, 2000)}\n\n` +
    `Identify all significant claims, facts, or discoveries.\n` +
    `For each finding, write or update a page using this exact format:\n\n` +
    `---FILE: findings/{lowercase-hyphenated-name}.md---\n` +
    `# {Finding Name}\n` +
    `{claim statement with citation anchors like (${documentName} lines X-Y)}\n` +
    `- Confidence: high/medium/low\n` +
    `- Supporting evidence\n` +
    `---END---\n\n` +
    `Rules:\n` +
    `- Only include significant claims actually supported by the source\n` +
    `- If a finding page already exists, merge new info or create a related finding\n` +
    `- Use [[wikilink]] syntax for cross-references\n` +
    `- Output ONLY the delimited file blocks; no extra commentary`;

  const { content, reasoning } = await callLLM(apiConfig, prompt);
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
  const entry = `## [${now}] ingest | ${documentName}\n- Pages: ${allPages.join(', ')}\n\n`;

  const existing = await readWikiPage('log.md', wikiId);
  const newContent = existing ? existing + '\n' + entry : '# Ingestion Log\n\n' + entry;
  await writeWikiPage('log.md', newContent, wikiId);
}

// ---------------------------------------------------------------------------
// Main ingest function
// ---------------------------------------------------------------------------
export async function ingestDocument(
  documentName: string,
  chunks: DocumentChunk[],
  apiConfig: ApiConfig,
  wikiId: string = 'default',
  callbacks?: IngestCallbacks
): Promise<IngestResult> {
  const allPages: string[] = [];

  try {
    // Step 1: Source summary
    const sourceSummary = await step1SourceSummary(documentName, chunks, apiConfig, wikiId, callbacks);
    const safeDocName = sanitizeFilename(documentName);
    allPages.push(`sources/${safeDocName}.md`);

    // Step 2: Index (passing pages generated so far; entities/concepts/findings not yet done)
    // We update index again after steps 3-5
    await step2Index(documentName, allPages, apiConfig, wikiId, callbacks);
    allPages.push('index.md');

    // Step 3: Entities
    const entityPages = await step3Entities(documentName, sourceSummary, apiConfig, wikiId, callbacks);
    allPages.push(...entityPages);

    // Step 4: Concepts
    const conceptPages = await step4Concepts(documentName, sourceSummary, apiConfig, wikiId, callbacks);
    allPages.push(...conceptPages);

    // Step 5: Findings
    const findingPages = await step5Findings(documentName, sourceSummary, apiConfig, wikiId, callbacks);
    allPages.push(...findingPages);

    // Re-update index with all pages
    await step2Index(documentName, allPages, apiConfig, wikiId, callbacks);

    // Step 6: Log
    await step6Log(documentName, allPages, wikiId);
    allPages.push('log.md');

    callbacks?.onReasoningChunk?.(`[Ingest] Complete. ${allPages.length} pages affected.`);

    return {
      success: true,
      pagesGenerated: [...new Set(allPages)],
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    callbacks?.onReasoningChunk?.(`[Ingest] Error: ${error}`);
    return {
      success: false,
      pagesGenerated: allPages,
      error,
    };
  }
}
