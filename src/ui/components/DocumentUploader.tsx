import { useState, useCallback, useEffect } from 'react';
import { FileUp, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import {
  chunkDocument,
  type DocumentChunk,
  storeRawSource,
  ingestDocument,
  compoundDocument,
  listWikiPages,
  readWikiPage,
} from '../../workbench/predigestor';
import { refreshWikiManifest } from '../../workbench/predigestor/wikiStore';
import type { WorkbenchSessionConfig } from '../../workbench/types';

type IngestStep =
  | 'idle'
  | 'reading'
  | 'chunking'
  | 'storing'
  | 'ingesting'
  | 'done'
  | 'error';

interface DocumentUploaderProps {
  sessionConfig: WorkbenchSessionConfig;
  wikiId: string | null;
}

export default function DocumentUploader({ sessionConfig, wikiId }: DocumentUploaderProps) {
  const [status, setStatus] = useState<IngestStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [wikiPages, setWikiPages] = useState<string[]>([]);
  const [reasoning, setReasoning] = useState<string[]>([]);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [pageContent, setPageContent] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<string>('');

  const appendReasoning = useCallback((chunk: string) => {
    setReasoning((prev) => [...prev, chunk]);
  }, []);

  useEffect(() => {
    if (!wikiId) {
      setWikiPages([]);
      setSelectedPage(null);
      setPageContent(null);
      return;
    }
    listWikiPages(wikiId).then((pages) => setWikiPages(pages));
  }, [wikiId]);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file) return;
      await processFile(file);
    },
    [sessionConfig, wikiId]
  );

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await processFile(file);
    },
    [sessionConfig, wikiId]
  );

  const processFile = async (file: File) => {
    if (!wikiId) {
      setError('Please select or create a wiki first.');
      setStatus('error');
      return;
    }

    setStatus('reading');
    setError(null);
    setChunks([]);
    setReasoning([]);
    setSelectedPage(null);
    setPageContent(null);
    setCurrentStep('');

    try {
      const validExtensions = ['.pdf', '.txt', '.csv', '.md'];
      const hasValidExtension = validExtensions.some((ext) =>
        file.name.toLowerCase().endsWith(ext)
      );

      if (!hasValidExtension) {
        throw new Error(
          `Unsupported file type: ${file.name}. Please upload PDF, TXT, CSV, or MD.`
        );
      }

      // Step 1: Read file text
      let text: string;
      if (file.name.toLowerCase().endsWith('.pdf')) {
        text = await extractPdfText(file);
      } else {
        text = await readTextFile(file);
      }

      // Step 2: Store raw source immutably
      setStatus('storing');
      setCurrentStep('Storing raw source...');
      await storeRawSource(file.name, text, wikiId);

      // Step 3: Chunk document
      setStatus('chunking');
      setCurrentStep('Chunking document...');
      const model = sessionConfig.apiConfig.model || 'gpt-4o';
      const documentChunks = chunkDocument(text, file.name, model);
      setChunks(documentChunks);

      // Step 4: Determine if this is first document or compound
      const existingPages = await listWikiPages(wikiId);
      const isFirstDocument = existingPages.length === 0;

      setStatus('ingesting');
      setCurrentStep(isFirstDocument ? 'Running incremental ingest...' : 'Running compound update...');

      let result;
      if (isFirstDocument) {
        result = await ingestDocument(
          file.name,
          documentChunks,
          sessionConfig.apiConfig,
          wikiId,
          {
            onReasoningChunk: (chunk) => {
              appendReasoning(chunk);
              if (chunk.startsWith('[Ingest] Step')) {
                setCurrentStep(chunk);
              }
            },
            onStepComplete: (step, pages) => {
              appendReasoning(`[Ingest] Step complete: ${step} → ${pages.join(', ')}`);
            },
          }
        );
      } else {
        result = await compoundDocument(
          file.name,
          documentChunks,
          sessionConfig.apiConfig,
          wikiId,
          {
            onReasoningChunk: (chunk) => {
              appendReasoning(chunk);
              if (chunk.startsWith('[Compound] Step')) {
                setCurrentStep(chunk);
              }
            },
            onStepComplete: (step, pages) => {
              appendReasoning(`[Compound] Step complete: ${step} → ${pages.join(', ')}`);
            },
          }
        );
      }

      if (!result.success) {
        throw new Error(result.error || 'Ingest failed');
      }

      await refreshWikiManifest(wikiId);
      const pages = await listWikiPages(wikiId);
      setWikiPages(pages);
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const readTextFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  const extractPdfText = async (file: File): Promise<string> => {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs';
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item: unknown) => (item as { str: string }).str).join(' ');
      text += `\n--- Page ${i} ---\n${pageText}\n`;
    }
    return text;
  };

  const handleViewPage = async (path: string) => {
    if (!wikiId) return;
    const content = await readWikiPage(path, wikiId);
    setSelectedPage(path);
    setPageContent(content || '(empty)');
  };

  const statusLabel: Record<IngestStep, string> = {
    idle: '',
    reading: 'Reading file…',
    chunking: 'Chunking document…',
    storing: 'Storing raw source…',
    ingesting: currentStep || 'Ingesting…',
    done: 'Ingest complete!',
    error: 'Error',
  };

  return (
    <div className="rounded-lg border border-border p-6">
      <h2 className="text-lg font-semibold mb-2">Document Pre-Digestor</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Upload a document to store it immutably and generate a structured LLM wiki.
        {wikiId
          ? ' Adding to existing wiki.'
          : ' Select a wiki below to begin.'}
      </p>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className={`border-2 border-dashed border-border rounded-lg p-8 text-center transition-colors ${
          wikiId ? 'cursor-pointer hover:bg-accent/50' : 'opacity-50 cursor-not-allowed'
        }`}
      >
        <input
          type="file"
          accept=".pdf,.txt,.csv,.md"
          onChange={handleFileInput}
          className="hidden"
          id="file-upload"
        />
        <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-2">
          <FileUp className="w-8 h-8 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Drag & drop a file here, or click to browse
          </span>
          <span className="text-xs text-muted-foreground">Supports PDF, TXT, CSV, MD</span>
        </label>
      </div>

      {status !== 'idle' && status !== 'error' && (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          {status === 'done' ? (
            <>
              <CheckCircle className="w-4 h-4 text-green-500" /> {statusLabel[status]}
            </>
          ) : (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> {statusLabel[status]}
            </>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 rounded bg-red-900/30 text-red-300 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {chunks.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-1">Chunks ({chunks.length})</h3>
          <ul className="text-xs text-muted-foreground space-y-1">
            {chunks.slice(0, 5).map((c) => (
              <li key={c.id}>
                {c.anchor} — ~{c.estimatedTokens} tokens
              </li>
            ))}
            {chunks.length > 5 && <li>…and {chunks.length - 5} more</li>}
          </ul>
        </div>
      )}

      {reasoning.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-1">Reasoning</h3>
          <div className="text-xs text-muted-foreground space-y-1 max-h-40 overflow-y-auto">
            {reasoning.map((r, i) => (
              <p key={i}>{r}</p>
            ))}
          </div>
        </div>
      )}

      {wikiPages.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-1">Wiki Pages ({wikiPages.length})</h3>
          <div className="flex flex-wrap gap-2">
            {wikiPages.map((p) => (
              <button
                key={p}
                onClick={() => handleViewPage(p)}
                className={`text-xs px-2 py-1 rounded border ${
                  selectedPage === p
                    ? 'bg-primary text-primary-foreground'
                    : 'border-border hover:bg-accent'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedPage && pageContent !== null && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-1">{selectedPage}</h3>
          <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
            {pageContent}
          </pre>
        </div>
      )}
    </div>
  );
}
