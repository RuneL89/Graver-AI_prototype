import { useState, useCallback } from 'react';
import { X, Eye, EyeOff, Settings, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import type { ApiConfig, ApiProvider } from '../../workbench/types-shared';
import {
  providerOptions,
  saveApiConfig,
  saveBraveApiKey,
  saveBraveProxyUrl,
  testApiConnection,
  testBraveApiKey,
  loadApiConfig,
} from '../../workbench/lib/apiConfig';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialConfig: ApiConfig;
  initialBraveKey: string;
  initialBraveProxy: string;
  onSave: (config: ApiConfig, braveKey: string, braveProxy: string) => void;
}

type TestState = 'idle' | 'running' | 'success' | 'error';

interface TestResult {
  state: TestState;
  message: string;
  warning?: string;
}

export default function SettingsPanel({
  isOpen,
  onClose,
  initialConfig,
  initialBraveKey,
  initialBraveProxy,
  onSave,
}: SettingsPanelProps) {
  const [config, setConfig] = useState<ApiConfig>({ ...initialConfig });
  const [braveKey, setBraveKey] = useState(initialBraveKey);
  const [braveProxy, setBraveProxy] = useState(initialBraveProxy);

  const [showKey, setShowKey] = useState(false);
  const [showBraveKey, setShowBraveKey] = useState(false);

  const [llmTest, setLlmTest] = useState<TestResult>({ state: 'idle', message: '' });
  const [braveTest, setBraveTest] = useState<TestResult>({ state: 'idle', message: '' });

  const handleProviderChange = useCallback(
    (provider: ApiProvider) => {
      const option = providerOptions.find((o) => o.value === provider);
      setConfig((prev) => ({
        ...prev,
        provider,
        baseUrl: option?.defaultBaseUrl || '',
        model: option?.defaultModel || '',
      }));
    },
    []
  );

  const handleTestLlm = async () => {
    setLlmTest({ state: 'running', message: 'Testing connection...' });
    try {
      const result = await testApiConnection(config);
      if (result.success) {
        setLlmTest({
          state: 'success',
          message: result.message,
          warning: result.warning,
        });
      } else {
        setLlmTest({ state: 'error', message: result.message });
      }
    } catch (err) {
      setLlmTest({
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleTestBrave = async () => {
    setBraveTest({ state: 'running', message: 'Testing connection...' });
    try {
      const result = await testBraveApiKey(braveKey, braveProxy);
      if (result.success) {
        setBraveTest({ state: 'success', message: result.message });
      } else {
        setBraveTest({ state: 'error', message: result.message });
      }
    } catch (err) {
      setBraveTest({
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleSave = async () => {
    // Save as the lightweight config in AppApiConfig to reuse existing storage
    const appConfig = await loadApiConfig();
    appConfig.lightweight = config;
    await saveApiConfig(appConfig);
    await saveBraveApiKey(braveKey);
    await saveBraveProxyUrl(braveProxy);
    onSave(config, braveKey, braveProxy);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* LLM Connection */}
          <section>
            <h3 className="text-sm font-semibold mb-3">LLM Connection</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Provider</label>
                <select
                  value={config.provider}
                  onChange={(e) => handleProviderChange(e.target.value as ApiProvider)}
                  className="w-full px-3 py-2 rounded border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {providerOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">API Key</label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={config.apiKey}
                    onChange={(e) => setConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 pr-10 rounded border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    onClick={() => setShowKey((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Base URL</label>
                <input
                  type="text"
                  value={config.baseUrl}
                  onChange={(e) => setConfig((prev) => ({ ...prev, baseUrl: e.target.value }))}
                  placeholder="https://api.openai.com/v1"
                  className="w-full px-3 py-2 rounded border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Model</label>
                <input
                  type="text"
                  value={config.model}
                  onChange={(e) => setConfig((prev) => ({ ...prev, model: e.target.value }))}
                  placeholder="gpt-4o"
                  className="w-full px-3 py-2 rounded border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <button
                onClick={handleTestLlm}
                disabled={llmTest.state === 'running'}
                className="px-3 py-1.5 rounded border border-border text-xs font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {llmTest.state === 'running' && <Loader2 className="w-3 h-3 animate-spin" />}
                Test Connection
              </button>

              {llmTest.state === 'success' && (
                <div className="p-2 rounded bg-green-900/30 text-green-300 text-xs flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <div>{llmTest.message}</div>
                    {llmTest.warning && (
                      <div className="text-amber-300 mt-1">{llmTest.warning}</div>
                    )}
                  </div>
                </div>
              )}

              {llmTest.state === 'error' && (
                <div className="p-2 rounded bg-red-900/30 text-red-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {llmTest.message}
                </div>
              )}
            </div>
          </section>

          {/* Brave Search */}
          <section>
            <h3 className="text-sm font-semibold mb-3">Brave Search</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">API Key</label>
                <div className="relative">
                  <input
                    type={showBraveKey ? 'text' : 'password'}
                    value={braveKey}
                    onChange={(e) => setBraveKey(e.target.value)}
                    placeholder="Brave Search API key"
                    className="w-full px-3 py-2 pr-10 rounded border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    onClick={() => setShowBraveKey((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showBraveKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Proxy URL</label>
                <input
                  type="text"
                  value={braveProxy}
                  onChange={(e) => setBraveProxy(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 rounded border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  CORS proxy required for browser-based Brave Search calls.
                </p>
              </div>

              <button
                onClick={handleTestBrave}
                disabled={braveTest.state === 'running'}
                className="px-3 py-1.5 rounded border border-border text-xs font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {braveTest.state === 'running' && <Loader2 className="w-3 h-3 animate-spin" />}
                Test Connection
              </button>

              {braveTest.state === 'success' && (
                <div className="p-2 rounded bg-green-900/30 text-green-300 text-xs flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {braveTest.message}
                </div>
              )}

              {braveTest.state === 'error' && (
                <div className="p-2 rounded bg-red-900/30 text-red-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {braveTest.message}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded border border-border text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
}
