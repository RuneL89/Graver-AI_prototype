import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { runHelloWorldTest, type HelloWorldResult } from './test/hello-world';
import Workbench from './ui/components/Workbench';
import SettingsPanel from './ui/components/SettingsPanel';
import { getWorkbenchConfig } from './workbench/config';
import type { WorkbenchSessionConfig } from './workbench/types';

function App() {
  const [result, setResult] = useState<HelloWorldResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionConfig, setSessionConfig] = useState<WorkbenchSessionConfig | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    getWorkbenchConfig().then((config) => {
      setSessionConfig(config);
      setConfigLoading(false);
    });
  }, []);

  const handleRun = async () => {
    setLoading(true);
    try {
      const res = await runHelloWorldTest();
      setResult(res);
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleRun();
  }, []);

  const handleSaveSettings = (apiConfig: WorkbenchSessionConfig['apiConfig'], braveKey: string, braveProxy: string) => {
    setSessionConfig((prev) =>
      prev
        ? {
            ...prev,
            apiConfig,
            braveApiKey: braveKey,
            braveProxyUrl: braveProxy,
          }
        : prev
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-8 mx-auto max-w-7xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">AI Investigative Workbench</h1>
        <button
          onClick={() => setSettingsOpen(true)}
          className="p-2 rounded border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      <p className="text-muted-foreground mb-6">
        Configure your LLM and Brave Search API keys via the settings gear above.
      </p>

      {configLoading && (
        <div className="max-w-xl p-6 rounded-lg border border-border text-sm text-muted-foreground">
          Loading configuration...
        </div>
      )}

      {sessionConfig && <Workbench sessionConfig={sessionConfig} />}

      {sessionConfig && (
        <SettingsPanel
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          initialConfig={sessionConfig.apiConfig}
          initialBraveKey={sessionConfig.braveApiKey}
          initialBraveProxy={sessionConfig.braveProxyUrl}
          onSave={handleSaveSettings}
        />
      )}

      <div className="mt-6 max-w-xl rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold mb-2">Hello-World Pipeline Test</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Verifies that the reused pipeline runner can execute agents and write
          files to IndexedDB.
        </p>

        <button
          onClick={handleRun}
          disabled={loading}
          className="px-4 py-2 rounded bg-primary text-primary-foreground font-medium disabled:opacity-50"
        >
          {loading ? 'Running…' : 'Run Test'}
        </button>

        {result && (
          <div
            className={`mt-4 p-3 rounded text-sm ${
              result.success
                ? 'bg-green-900/30 text-green-300'
                : 'bg-red-900/30 text-red-300'
            }`}
          >
            <strong>{result.success ? 'PASS' : 'FAIL'}</strong>: {result.message}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
