import { useState } from 'react';
import { ShieldCheck, Loader2, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { PipelineRunner } from '../../workbench/lib/pipeline';
import { workbenchPredigestorAgentMap } from '../../workbench/lib/workbenchAgentMap';
import { WORKBENCH_PREDIGESTOR_STAGE_DEFS } from '../../workbench/lib/workbenchStages';
import { createWorkbenchContextBuilder } from '../../workbench/lib/workbenchAgentContext';
import type { WorkbenchSessionConfig } from '../../workbench/types';
import type { LintIssue } from '../../workbench/predigestor/linter';

interface WikiLintProps {
  sessionConfig: WorkbenchSessionConfig;
  wikiId: string | null;
}

const severityIcon = {
  error: <AlertCircle className="w-4 h-4 text-red-400" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-400" />,
  info: <Info className="w-4 h-4 text-blue-400" />,
};

const typeLabel: Record<LintIssue['type'], string> = {
  contradiction: 'Contradiction',
  orphan: 'Orphan',
  stale: 'Stale Claim',
  missing_ref: 'Missing Reference',
  empty: 'Empty Page',
};

export default function WikiLint({ sessionConfig, wikiId }: WikiLintProps) {
  const [issues, setIssues] = useState<LintIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasoning, setReasoning] = useState<string[]>([]);

  const handleLint = async () => {
    if (!wikiId) return;
    setLoading(true);
    setError(null);
    setIssues([]);
    setReasoning([]);

    try {
      const runner = new PipelineRunner(
        workbenchPredigestorAgentMap as unknown as import('../../workbench/lib/pipelineTypes').AgentMap,
        {
          onStateChange: () => {},
          onComplete: () => {},
          onError: (err) => setError(err),
        },
        {
          stageDefinitions: WORKBENCH_PREDIGESTOR_STAGE_DEFS,
          initialStageId: 'lint',
          enableTopicLoop: false,
          contextBuilder: createWorkbenchContextBuilder(sessionConfig, wikiId),
        }
      );

      const result = await runner.executeStage(
        'lint',
        sessionConfig,
        '',
        undefined
      );

      const meta = result.metadata as { issues?: LintIssue[] };
      setIssues(meta?.issues ?? []);
      if (result.reasoning) {
        setReasoning([result.reasoning]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  return (
    <div className="rounded-lg border border-border p-6">
      <h2 className="text-lg font-semibold mb-2">Wiki Lint</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Run a health check on the wiki for contradictions, orphans, stale claims, and missing cross-references.
      </p>

      <button
        onClick={handleLint}
        disabled={loading || !wikiId}
        className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
        Run Lint
      </button>

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

      {issues.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-4 mb-2 text-xs">
            {errorCount > 0 && <span className="text-red-400">{errorCount} errors</span>}
            {warningCount > 0 && <span className="text-amber-400">{warningCount} warnings</span>}
            {infoCount > 0 && <span className="text-blue-400">{infoCount} info</span>}
          </div>
          <ul className="space-y-2">
            {issues.map((issue, idx) => (
              <li key={idx} className="text-sm bg-muted p-3 rounded flex items-start gap-2">
                {severityIcon[issue.severity]}
                <div className="flex-1">
                  <div className="font-medium">
                    {typeLabel[issue.type]}
                  </div>
                  <div className="text-muted-foreground">{issue.description}</div>
                  {issue.affectedPages.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Pages: {issue.affectedPages.join(', ')}
                    </div>
                  )}
                  {issue.suggestion && (
                    <div className="text-xs text-blue-300 mt-1">
                      Suggestion: {issue.suggestion}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!loading && issues.length === 0 && !error && reasoning.length > 0 && (
        <div className="mt-4 p-3 rounded bg-green-900/30 text-green-300 text-sm">
          No issues found. Wiki looks healthy.
        </div>
      )}
    </div>
  );
}
