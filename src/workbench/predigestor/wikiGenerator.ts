import type { ApiConfig } from '../types-shared';
import type { DocumentChunk } from './chunker';
import { callLLM } from '../lib/apiConfig';
import { writeWikiPage } from './schema';

export interface WikiGenerationResult {
  success: boolean;
  pagesGenerated: string[];
  error?: string;
}

export function formatChunksForPrompt(chunks: DocumentChunk[]): string {
  return chunks
    .map(
      (c, i) =>
        `## Chunk ${i + 1}\n` +
        `**Anchor:** ${c.anchor}\n` +
        `**Lines:** ${c.startLine}-${c.endLine}\n` +
        `**Tokens:** ${c.estimatedTokens}\n\n` +
        `${c.text}\n`
    )
    .join('\n---\n\n');
}

export function parseWikiOutput(output: string): Array<{ path: string; content: string }> {
  const pages: Array<{ path: string; content: string }> = [];
  const fileRegex = /---FILE:\s*([^\n]+)---\n([\s\S]*?)(?=---FILE:|---END---|$)/g;
  let match: RegExpExecArray | null;
  while ((match = fileRegex.exec(output)) !== null) {
    const path = match[1].trim();
    let content = match[2].trim();
    content = content.replace(/---END---\s*$/, '').trim();
    pages.push({ path, content });
  }
  return pages;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
}

export function buildWikiPrompt(documentName: string, chunks: DocumentChunk[]): string {
  const chunksText = formatChunksForPrompt(chunks);
  const safeDocName = sanitizeFilename(documentName);
  const now = new Date().toISOString();

  return `You are a research assistant building a structured wiki from a source document.

Your task: read the following document chunks and generate a complete wiki following the Karpathy LLM Wiki pattern.

# Document: ${documentName}

${chunksText}

# Instructions

Generate the following wiki pages using EXACTLY this delimiter format:

---FILE: index.md---
# Master Overview: ${documentName}
Write a concise master overview that summarizes the document.
Link to other pages using [[wikilink]] syntax.
---END---

---FILE: log.md---
# Ingestion Log
- ${now}: Created wiki from ${documentName}
---END---

---FILE: sources/${safeDocName}.md---
# Source: ${documentName}
Summarize the document, its scope, and key takeaways.
---END---

---FILE: entities/{entity-name}.md---
# {Entity Name}
Describe a named person, organization, or location found in the document.
Include a citation anchor like (${documentName} lines X-Y).
---END---

---FILE: concepts/{concept-name}.md---
# {Concept Name}
Explain a theme, term, or concept found in the document.
---END---

---FILE: findings/{finding-name}.md---
# {Finding Name}
State an extracted claim or fact from the document.
Include a citation anchor like (${documentName} lines X-Y).
---END---

Rules:
1. Create at least ONE page in EACH folder: sources/, entities/, concepts/, findings/.
2. Use [[wikilink]] syntax for cross-links between pages.
3. Include citation anchors (e.g., "(${documentName} lines 10-30)") in findings and entities.
4. Keep each page focused and concise.
5. Output ONLY the delimited files — no extra commentary.`;
}

export async function generateWiki(
  documentName: string,
  chunks: DocumentChunk[],
  apiConfig: ApiConfig,
  onReasoningChunk?: (chunk: string) => void
): Promise<WikiGenerationResult> {
  try {
    onReasoningChunk?.('Building wiki generation prompt...');
    const prompt = buildWikiPrompt(documentName, chunks);

    onReasoningChunk?.('Calling LLM to generate wiki...');
    const { content, reasoning } = await callLLM(apiConfig, prompt);

    if (reasoning) {
      onReasoningChunk?.(reasoning);
    }

    onReasoningChunk?.('Parsing LLM output into wiki pages...');
    const pages = parseWikiOutput(content);

    const generatedPaths: string[] = [];

    if (pages.length === 0) {
      // Fallback: write the raw response as index.md + log.md
      await writeWikiPage('index.md', content);
      await writeWikiPage(
        'log.md',
        `# Ingestion Log\n- ${new Date().toISOString()}: Created wiki from ${documentName}\n`
      );
      generatedPaths.push('index.md', 'log.md');
    } else {
      for (const page of pages) {
        await writeWikiPage(page.path, page.content);
        generatedPaths.push(page.path);
      }
    }

    // Ensure log.md exists with the full list of affected pages
    if (!generatedPaths.includes('log.md')) {
      const logContent =
        `# Ingestion Log\n` +
        `- ${new Date().toISOString()}: Created wiki from ${documentName}\n` +
        `  - Pages affected: ${generatedPaths.join(', ')}\n`;
      await writeWikiPage('log.md', logContent);
      generatedPaths.push('log.md');
    }

    onReasoningChunk?.(`Wiki generation complete. ${generatedPaths.length} pages written.`);
    return {
      success: true,
      pagesGenerated: generatedPaths,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    onReasoningChunk?.(`Error: ${error}`);
    return {
      success: false,
      pagesGenerated: [],
      error,
    };
  }
}
