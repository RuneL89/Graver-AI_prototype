import { useState } from 'react';
import { FileText, Download, AlertCircle, CheckCircle } from 'lucide-react';
import { assembleEvidenceMemo } from '../../workbench/tiprouter/reportAssembler';

interface EvidenceMemoProps {
  tipId: string | null;
}

export default function EvidenceMemo({ tipId }: EvidenceMemoProps) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!tipId) return;
    setLoading(true);
    setError(null);
    setMarkdown(null);

    try {
      const result = await assembleEvidenceMemo(tipId);
      if (!result.success || !result.markdown) {
        throw new Error(result.error || 'Assembly failed');
      }
      setMarkdown(result.markdown);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evidence-memo-${tipId}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-lg border border-border p-6">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Evidence Memo</h2>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Generate a markdown evidence memo from the approved synthesis.
      </p>

      <div className="flex gap-2">
        <button
          onClick={handleGenerate}
          disabled={loading || !tipId}
          className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? (
            <span className="animate-pulse">Generating…</span>
          ) : (
            <>
              <FileText className="w-4 h-4" />
              Generate Memo
            </>
          )}
        </button>

        {markdown && (
          <button
            onClick={handleDownload}
            className="px-4 py-2 rounded border border-border text-sm font-medium flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 p-3 rounded bg-red-900/30 text-red-300 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {markdown && (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-sm font-medium">Memo Ready</span>
          </div>
          <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap">
            {markdown}
          </pre>
        </div>
      )}
    </div>
  );
}
