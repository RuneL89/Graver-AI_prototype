export interface DocumentChunk {
  id: string;
  documentName: string;
  text: string;
  anchor: string;
  startLine: number;
  endLine: number;
  estimatedTokens: number;
}

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-5.5': 256000,
  'claude-3-5-sonnet': 200000,
  'claude-3-7-sonnet': 200000,
  'gemini-1.5-pro': 2000000,
  'gemini-1.5-flash': 1000000,
};

function getContextWindow(model: string): number {
  const lower = model.toLowerCase();
  for (const [key, value] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (lower.includes(key.toLowerCase())) return value;
  }
  return 128000;
}

function estimateTokens(text: string): number {
  // Rough heuristic: ~4 characters per token for English text
  return Math.ceil(text.length / 4);
}

export function getChunkTokenLimit(model: string): number {
  const contextWindow = getContextWindow(model);
  // Use 25% of context window for chunks to leave room for prompts and responses
  return Math.min(16000, Math.floor(contextWindow * 0.25));
}

export function chunkDocument(text: string, documentName: string, model: string): DocumentChunk[] {
  const maxTokens = getChunkTokenLimit(model);
  const maxChars = maxTokens * 4;

  const lines = text.split('\n');
  const chunks: DocumentChunk[] = [];
  let currentLines: string[] = [];
  let currentChars = 0;
  let startLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineChars = line.length + 1; // +1 for newline

    if (currentChars + lineChars > maxChars && currentLines.length > 0) {
      const chunkText = currentLines.join('\n');
      const endLine = i;
      chunks.push({
        id: `${documentName}-chunk-${chunks.length}`,
        documentName,
        text: chunkText,
        anchor: `${documentName} (lines ${startLine + 1}-${endLine})`,
        startLine: startLine + 1,
        endLine,
        estimatedTokens: estimateTokens(chunkText),
      });
      currentLines = [line];
      currentChars = lineChars;
      startLine = i;
    } else {
      currentLines.push(line);
      currentChars += lineChars;
    }
  }

  // Final chunk
  if (currentLines.length > 0) {
    const chunkText = currentLines.join('\n');
    chunks.push({
      id: `${documentName}-chunk-${chunks.length}`,
      documentName,
      text: chunkText,
      anchor: `${documentName} (lines ${startLine + 1}-${lines.length})`,
      startLine: startLine + 1,
      endLine: lines.length,
      estimatedTokens: estimateTokens(chunkText),
    });
  }

  return chunks;
}
