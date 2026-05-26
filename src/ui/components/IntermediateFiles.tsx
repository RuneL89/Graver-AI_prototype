import { useState, useEffect, useCallback } from 'react';
import { FolderOpen, FileText, Loader2 } from 'lucide-react';
import { listIntermediateFiles, loadIntermediateFile, type IntermediateFile } from '../../workbench/session';

interface IntermediateFilesProps {
  tipId: string | null;
}

export default function IntermediateFiles({ tipId }: IntermediateFilesProps) {
  const [files, setFiles] = useState<IntermediateFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadFiles = useCallback(async () => {
    if (!tipId) {
      setFiles([]);
      return;
    }
    setLoading(true);
    const list = await listIntermediateFiles(tipId);
    setFiles(list);
    setLoading(false);
  }, [tipId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleView = async (file: IntermediateFile) => {
    if (!file.exists) return;
    setSelectedFile(file.name);
    const content = await loadIntermediateFile(file.key);
    setFileContent(content || '(empty)');
  };

  return (
    <div className="rounded-lg border border-border p-6">
      <div className="flex items-center gap-2 mb-4">
        <FolderOpen className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Intermediate Files</h2>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Inspect pipeline outputs: research plan, evidence files, synthesis, and audit results.
      </p>

      {!tipId && (
        <p className="text-sm text-muted-foreground">Enter a tip to generate intermediate files.</p>
      )}

      {tipId && loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading...
        </div>
      )}

      {tipId && !loading && (
        <ul className="space-y-2">
          {files.map((file) => (
            <li key={file.key}>
              <button
                onClick={() => handleView(file)}
                disabled={!file.exists}
                className={`w-full flex items-center gap-2 p-3 rounded text-sm text-left transition-colors ${
                  file.exists
                    ? 'hover:bg-accent cursor-pointer'
                    : 'opacity-50 cursor-not-allowed'
                } ${selectedFile === file.name ? 'bg-accent' : 'bg-muted'}`}
              >
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="flex-1">{file.name}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    file.exists ? 'bg-green-900/30 text-green-300' : 'bg-muted-foreground/20 text-muted-foreground'
                  }`}
                >
                  {file.exists ? 'Available' : 'Missing'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedFile && fileContent !== null && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-1">{selectedFile}</h3>
          <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
            {fileContent}
          </pre>
        </div>
      )}
    </div>
  );
}
