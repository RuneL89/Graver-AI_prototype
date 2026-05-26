import type { ApiConfig } from '../types-shared';
import { callLLM } from '../lib/apiConfig';
import { listWikiPages, readAllWikiPages } from './schema';
import schemaMarkdown from './schema.md?raw';
import type { AgentOutput, StageRecord } from '../lib/pipelineTypes';
import type { WorkbenchAgentContext } from '../lib/workbenchAgentContext';
import { checkAborted, emitReasoning, buildAgentOutput } from '../lib/workbenchAgentContext';

export interface LintCallbacks {
  onReasoningChunk?: (chunk: string) => void;
}

export interface LintIssue {
  severity: 'error' | 'warning' | 'info';
  type: 'contradiction' | 'orphan' | 'stale' | 'missing_ref' | 'empty';
  description: string;
  affectedPages: string[];
  suggestion?: string;
}

export interface LintResult {
  success: boolean;
  issues: LintIssue[];
  error?: string;
}

function parseLintIssues(output: string): LintIssue[] {
  // Try to find a JSON block
  const jsonMatch = output.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed)) return parsed as LintIssue[];
      if (parsed.issues && Array.isArray(parsed.issues)) return parsed.issues as LintIssue[];
    } catch {
      // fall through to text parsing
    }
  }

  // Fallback: parse markdown bullet list
  const issues: LintIssue[] = [];
  const lines = output.split('\n');
  let currentIssue: Partial<LintIssue> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (currentIssue && currentIssue.description) {
        issues.push(currentIssue as LintIssue);
      }
      const text = trimmed.slice(2);
      // Try to infer severity and type from text
      let severity: LintIssue['severity'] = 'info';
      if (/\b(contradiction|error|broken|missing)\b/i.test(text)) severity = 'error';
      else if (/\b(orphan|stale|warning)\b/i.test(text)) severity = 'warning';

      let type: LintIssue['type'] = 'missing_ref';
      if (/contradiction/i.test(text)) type = 'contradiction';
      else if (/orphan/i.test(text)) type = 'orphan';
      else if (/stale/i.test(text)) type = 'stale';
      else if (/empty/i.test(text)) type = 'empty';

      currentIssue = {
        severity,
        type,
        description: text,
        affectedPages: [],
      };
    } else if (trimmed.startsWith('Pages:')) {
      if (currentIssue) {
        currentIssue.affectedPages = trimmed
          .replace('Pages:', '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
    } else if (trimmed.startsWith('Suggestion:')) {
      if (currentIssue) {
        currentIssue.suggestion = trimmed.replace('Suggestion:', '').trim();
      }
    }
  }

  if (currentIssue && currentIssue.description) {
    issues.push(currentIssue as LintIssue);
  }

  return issues;
}

/**
 * Lint the wiki by scanning for contradictions, orphans, stale claims,
 * missing cross-references, and empty pages.
 */
export async function lintWiki(
  apiConfig: ApiConfig,
  wikiId: string = 'default',
  callbacks?: LintCallbacks,
  signal?: AbortSignal
): Promise<LintResult> {
  try {
    callbacks?.onReasoningChunk?.('[Lint] Reading wiki pages...');
    const pages = await listWikiPages(wikiId);
    if (pages.length === 0) {
      return {
        success: true,
        issues: [],
        error: 'Wiki is empty. Nothing to lint.',
      };
    }

    // For small wikis, include all pages. For large wikis, sample.
    const allContent = await readAllWikiPages(wikiId);
    const pageEntries = Object.entries(allContent);
    const maxChars = 12000;
    let wikiText = '';
    for (const [path, content] of pageEntries) {
      const snippet = `## ${path}\n${content.slice(0, 2000)}\n\n`;
      if (wikiText.length + snippet.length > maxChars) break;
      wikiText += snippet;
    }

    callbacks?.onReasoningChunk?.('[Lint] Analyzing with LLM...');
    const prompt =
      `${schemaMarkdown}\n\n` +
      `You are auditing an investigative wiki.\n\n` +
      `# Wiki pages (sampled):\n${wikiText}\n\n` +
      `# Total pages: ${pages.length}\n\n` +
      `Scan for issues and report them as a JSON array inside a code block.\n\n` +
      `Each issue must have:\n` +
      `- severity: "error" | "warning" | "info"\n` +
      `- type: "contradiction" | "orphan" | "stale" | "missing_ref" | "empty"\n` +
      `- description: string\n` +
      `- affectedPages: string[]\n` +
      `- suggestion?: string\n\n` +
      `Output format:\n` +
      `\`\`\`json\n` +
      `[\n` +
      `  {\n` +
      `    "severity": "warning",\n` +
      `    "type": "orphan",\n` +
      `    "description": "Page entities/alice-smith.md has no incoming wikilinks.",\n` +
      `    "affectedPages": ["entities/alice-smith.md"],\n` +
      `    "suggestion": "Add a reference from findings/consulting-fees.md"\n` +
      `  }\n` +
      `]\n` +
      `\`\`\`\n\n` +
      `If no issues are found, output an empty JSON array.`;

    const { content, reasoning } = await callLLM(apiConfig, prompt, undefined, signal);
    if (reasoning) callbacks?.onReasoningChunk?.(reasoning);

    const issues = parseLintIssues(content);
    callbacks?.onReasoningChunk?.(`[Lint] Found ${issues.length} issue(s).`);

    return {
      success: true,
      issues,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    callbacks?.onReasoningChunk?.(`[Lint] Error: ${error}`);
    return {
      success: false,
      issues: [],
      error,
    };
  }
}

/**
 * AgentFn implementation of wiki lint.
 * Uses `ctx.wikiId` (or `ctx.currentDraft` as fallback).
 */
export async function lintWikiAgent(
  ctx: WorkbenchAgentContext,
  onReasoningChunk: (chunk: string) => void,
  onUpdate?: (partial: Partial<StageRecord>) => void
): Promise<AgentOutput> {
  checkAborted(ctx);
  const apiConfig = ctx.apiConfig;
  const wikiId = ctx.wikiId ?? ctx.currentDraft ?? 'default';

  emitReasoning('[Lint] Reading wiki pages...', onReasoningChunk, onUpdate);
  const pages = await listWikiPages(wikiId);
  if (pages.length === 0) {
    return buildAgentOutput({
      draft: JSON.stringify({ issues: [] }),
      reasoning: 'Wiki is empty. Nothing to lint.',
      metadata: { issues: [], error: 'Wiki is empty. Nothing to lint.' },
    });
  }

  const allContent = await readAllWikiPages(wikiId);
  const pageEntries = Object.entries(allContent);
  const maxChars = 12000;
  let wikiText = '';
  for (const [path, content] of pageEntries) {
    const snippet = `## ${path}\n${content.slice(0, 2000)}\n\n`;
    if (wikiText.length + snippet.length > maxChars) break;
    wikiText += snippet;
  }

  emitReasoning('[Lint] Analyzing with LLM...', onReasoningChunk, onUpdate);
  const prompt =
    `${schemaMarkdown}\n\n` +
    `You are auditing an investigative wiki.\n\n` +
    `# Wiki pages (sampled):\n${wikiText}\n\n` +
    `# Total pages: ${pages.length}\n\n` +
    `Scan for issues and report them as a JSON array inside a code block.\n\n` +
    `Each issue must have:\n` +
    `- severity: "error" | "warning" | "info"\n` +
    `- type: "contradiction" | "orphan" | "stale" | "missing_ref" | "empty"\n` +
    `- description: string\n` +
    `- affectedPages: string[]\n` +
    `- suggestion?: string\n\n` +
    `Output format:\n` +
    `\`\`\`json\n` +
    `[\n` +
    `  {\n` +
    `    "severity": "warning",\n` +
    `    "type": "orphan",\n` +
    `    "description": "Page entities/alice-smith.md has no incoming wikilinks.",\n` +
    `    "affectedPages": ["entities/alice-smith.md"],\n` +
    `    "suggestion": "Add a reference from findings/consulting-fees.md"\n` +
    `  }\n` +
    `]\n` +
    `\`\`\`\n\n` +
    `If no issues are found, output an empty JSON array.`;

  const { content, reasoning } = await callLLM(apiConfig, prompt, undefined, ctx.abortSignal);
  if (reasoning) emitReasoning(reasoning, onReasoningChunk, onUpdate);

  const issues = parseLintIssues(content);
  emitReasoning(`[Lint] Found ${issues.length} issue(s).`, onReasoningChunk, onUpdate);

  return buildAgentOutput({
    draft: JSON.stringify({ issues }),
    reasoning: `Found ${issues.length} lint issue(s) in wiki ${wikiId}`,
    metadata: { issues },
    prompt,
  });
}
