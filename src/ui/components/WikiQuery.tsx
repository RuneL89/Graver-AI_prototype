import { useState, useCallback } from 'react';
import { Search, Loader2, AlertCircle } from 'lucide-react';
import { queryWiki } from '../../workbench/predigestor/querier';
import type { ApiConfig } from '../../workbench/types-shared';

interface WikiQueryProps {
  apiConfig: ApiConfig;
  wikiId: string | null;
}

export default function WikiQuery({ apiConfig, wikiId }: WikiQueryProps) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [pagesRead, setPagesRead] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasoning, setReasoning] = useState<string[]>([]);

  const appendReasoning = useCallback((chunk: string) => {
    setReasoning((prev) => [...prev, chunk]);
  }, []);

  const handleQuery = async () => {
    if (!question.trim() || !wikiId) return;
    setLoading(true);
    setError(null);
    setAnswer('');
    setPagesRead([]);
    setReasoning([]);

    try {
      const result = await queryWiki(question.trim(), apiConfig, wikiId, {
        onReasoningChunk: appendReasoning,
      });

      if (!result.success) {
        throw new Error(result.error || 'Query failed');
      }

      setAnswer(result.answer);
      setPagesRead(result.pagesRead);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border p-6">
      <h2 className="text-lg font-semibold mb-2">Wiki Query</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Ask a question about the ingested documents.
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
          placeholder="What did the document say about...?"
          className="flex-1 px-3 py-2 rounded border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={handleQuery}
          disabled={loading || !question.trim() || !wikiId}
          className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Ask
        </button>
      </div>

      {error && (
        <div className="mt-4 p-3 rounded bg-red-900/30 text-red-300 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {reasoning.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-1">Reasoning</h3>
          <div className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
            {reasoning.map((r, i) => (
              <p key={i}>{r}</p>
            ))}
          </div>
        </div>
      )}

      {answer && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-1">Answer</h3>
          <div className="text-sm bg-muted p-3 rounded whitespace-pre-wrap">
            {answer}
          </div>
        </div>
      )}

      {pagesRead.length > 0 && (
        <div className="mt-2">
          <h3 className="text-xs font-semibold text-muted-foreground mb-1">Pages consulted</h3>
          <div className="flex flex-wrap gap-1">
            {pagesRead.map((p) => (
              <span key={p} className="text-xs px-2 py-0.5 rounded bg-accent">
                {p}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
