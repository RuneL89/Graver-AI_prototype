import { useState, useCallback } from 'react';
import { Lightbulb, Loader2, AlertCircle, CheckCircle, Play, ShieldCheck, FileText, RotateCcw, BookOpen } from 'lucide-react';
import { decomposeTip, type DecomposeResult } from '../../workbench/tiprouter/decomposer';
import { runParallelResearch, type ResearchLoopResult, type ResearchTaskStatus } from '../../workbench/tiprouter/researchLoop';
import { runSynthesisLoop, type SynthesisLoopResult } from '../../workbench/tiprouter/synthesisLoop';
import type { WorkbenchSessionConfig } from '../../workbench/types';
import type { ResearchPlan, EvidenceAudit } from '../../workbench/types';
import type { PipelineStage } from '../../workbench/session';
import ResearchMonitor from './ResearchMonitor';

interface TipInputProps {
  sessionConfig: WorkbenchSessionConfig;
  wikiId: string | null;
  onTipCreated?: (tipId: string) => void;
  onStageChange?: (stage: PipelineStage) => void;
}

export default function TipInput({ sessionConfig, wikiId, onTipCreated, onStageChange }: TipInputProps) {
  const [tipText, setTipText] = useState('');
  const [phase, setPhase] = useState<'idle' | 'decomposing' | 'researching' | 'done' | 'error'>('idle');

  const setStage = (stage: PipelineStage) => {
    onStageChange?.(stage);
  };
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ResearchPlan | null>(null);
  const [researchResult, setResearchResult] = useState<ResearchLoopResult | null>(null);
  const [taskStatuses, setTaskStatuses] = useState<ResearchTaskStatus[]>([]);
  const [synthesisResult, setSynthesisResult] = useState<SynthesisLoopResult | null>(null);
  const [auditIterations, setAuditIterations] = useState<{ iteration: number; audit: EvidenceAudit }[]>([]);
  const [reasoning, setReasoning] = useState<string[]>([]);

  const appendReasoning = useCallback((chunk: string) => {
    setReasoning((prev) => [...prev, chunk]);
  }, []);

  const handleDecompose = async () => {
    if (!tipText.trim()) return;
    setPhase('decomposing');
    setStage('decomposing');
    setError(null);
    setPlan(null);
    setResearchResult(null);
    setTaskStatuses([]);
    setSynthesisResult(null);
    setAuditIterations([]);
    setReasoning([]);

    try {
      const result: DecomposeResult = await decomposeTip(
        tipText.trim(),
        sessionConfig.apiConfig,
        {
          onReasoningChunk: appendReasoning,
        }
      );

      if (!result.success || !result.plan) {
        throw new Error(result.error || 'Decomposition failed');
      }

      setPlan(result.plan);
      setPhase('done');
      setStage('idle');
      onTipCreated?.(result.plan.tipId);
    } catch (err) {
      setPhase('error');
      setStage('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleResearch = async () => {
    if (!plan) return;
    setPhase('researching');
    setStage('researching');
    setError(null);
    setResearchResult(null);
    setSynthesisResult(null);
    setAuditIterations([]);
    setTaskStatuses(
      plan.subClaims.map((sc) => ({
        subClaimId: sc.id,
        subClaimQuestion: sc.question,
        state: 'pending' as const,
        webFindingsCount: 0,
        wikiFindingsCount: 0,
      }))
    );

    try {
      const result = await runParallelResearch(
        plan,
        sessionConfig.apiConfig,
        sessionConfig.braveApiKey,
        sessionConfig.braveProxyUrl,
        wikiId,
        {
          onReasoningChunk: appendReasoning,
          onTaskUpdate: (status) => {
            setTaskStatuses((prev) => {
              const idx = prev.findIndex((t) => t.subClaimId === status.subClaimId);
              if (idx === -1) return [...prev, status];
              const next = [...prev];
              next[idx] = status;
              return next;
            });
          },
        }
      );

      if (!result.success) {
        throw new Error(result.error || 'Research failed');
      }

      setResearchResult(result);
      setPhase('done');
      setStage('idle');
    } catch (err) {
      setPhase('error');
      setStage('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSynthesize = async () => {
    if (!plan) return;
    setPhase('researching');
    setStage('synthesizing');
    setError(null);
    setSynthesisResult(null);
    setAuditIterations([]);

    try {
      const result = await runSynthesisLoop(plan.tipId, sessionConfig.apiConfig, {
        onReasoningChunk: appendReasoning,
        onAuditIteration: (iteration, audit) => {
          setAuditIterations((prev) => [...prev, { iteration, audit }]);
        },
      });

      if (!result.success) {
        throw new Error(result.error || 'Synthesis failed');
      }

      setSynthesisResult(result);
      setPhase('done');
      setStage(result.finalAudit?.approval_status === 'APPROVED' ? 'done' : 'idle');
    } catch (err) {
      setPhase('error');
      setStage('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="rounded-lg border border-border p-6">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Tip Router</h2>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Enter an investigative tip. The system will decompose it into sub-claims and research them in parallel.
      </p>

      <textarea
        value={tipText}
        onChange={(e) => setTipText(e.target.value)}
        placeholder="e.g., 'Mayor Smith received a $50,000 donation from a developer who was later awarded a zoning contract...'"
        rows={4}
        className="w-full px-3 py-2 rounded border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
      />

      <div className="flex flex-wrap gap-2 mt-3">
        <button
          onClick={handleDecompose}
          disabled={phase === 'decomposing' || !tipText.trim()}
          className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-2"
        >
          {phase === 'decomposing' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Lightbulb className="w-4 h-4" />
          )}
          Decompose
        </button>

        {plan && (
          <button
            onClick={handleResearch}
            disabled={phase === 'researching'}
            className="px-4 py-2 rounded bg-secondary text-secondary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {phase === 'researching' && !synthesisResult ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Run Research
          </button>
        )}

        {researchResult && (
          <button
            onClick={handleSynthesize}
            disabled={phase === 'researching'}
            className="px-4 py-2 rounded bg-accent text-accent-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {phase === 'researching' && synthesisResult === null ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
            Synthesize & Audit
          </button>
        )}

        <button
          onClick={async () => {
            try {
              const response = await fetch('/demo/sample-tip.txt');
              const text = await response.text();
              setTipText(text);
            } catch {
              setTipText('A city council member accepted a $25,000 campaign donation from a real estate developer. Two months later, the developer\'s firm was awarded a lucrative zoning contract worth over $2 million.');
            }
          }}
          className="px-4 py-2 rounded border border-border text-sm font-medium flex items-center gap-2"
        >
          <BookOpen className="w-4 h-4" />
          Load Demo Tip
        </button>

        {error && (
          <button
            onClick={() => {
              setError(null);
              if (phase === 'error') setPhase('idle');
            }}
            className="px-4 py-2 rounded border border-border text-sm font-medium flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Retry
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 p-3 rounded bg-red-900/30 text-red-300 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {plan && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            Research Plan ({plan.subClaims.length} sub-claims)
          </h3>
          <ul className="space-y-2">
            {plan.subClaims.map((sc, i) => (
              <li key={sc.id} className="text-sm bg-muted p-3 rounded">
                <div className="font-medium">{i + 1}. {sc.question}</div>
                <div className="text-muted-foreground mt-0.5">{sc.claim}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {phase === 'researching' && (
        <ResearchMonitor tasks={taskStatuses} />
      )}

      {researchResult && (
        <div className="mt-4 space-y-3">
          <h3 className="text-sm font-semibold">Research Results</h3>
          <div className="text-sm bg-muted p-3 rounded">
            <div>Web findings: {researchResult.externalFindings.length}</div>
            <div>Wiki findings: {researchResult.internalFindings.length}</div>
          </div>
        </div>
      )}

      {synthesisResult && synthesisResult.synthesis && (
        <div className="mt-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Synthesis ({synthesisResult.synthesis.entries.length} entries)
          </h3>
          <div className="text-sm bg-muted p-3 rounded space-y-2">
            {synthesisResult.synthesis.entries.map((entry) => (
              <div key={entry.subClaimId}>
                <div className="font-medium">{entry.subClaimId}</div>
                <div className="text-xs text-muted-foreground">
                  Sources: {entry.supportingSources.length} · Contradictions: {entry.contradictions.length} · Gaps: {entry.gaps.length}
                </div>
              </div>
            ))}
          </div>
          {synthesisResult.finalAudit && (
            <div className={`text-sm p-3 rounded ${
              synthesisResult.finalAudit.approval_status === 'APPROVED'
                ? 'bg-green-900/30 text-green-300'
                : 'bg-amber-900/30 text-amber-300'
            }`}>
              <strong>{synthesisResult.finalAudit.approval_status}</strong> after {synthesisResult.iterations} iteration(s)
              {synthesisResult.finalAudit.rewriter_instructions && (
                <div className="mt-1 text-xs">{synthesisResult.finalAudit.rewriter_instructions}</div>
              )}
            </div>
          )}
        </div>
      )}

      {auditIterations.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-2">Audit Iterations</h3>
          <ul className="space-y-2">
            {auditIterations.map(({ iteration, audit }) => (
              <li key={iteration} className="text-sm bg-muted p-3 rounded">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Iteration {iteration}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    audit.approval_status === 'APPROVED'
                      ? 'bg-green-900/30 text-green-300'
                      : 'bg-red-900/30 text-red-300'
                  }`}>
                    {audit.approval_status}
                  </span>
                </div>
                {audit.rewriter_instructions && (
                  <div className="text-xs text-muted-foreground mt-1">{audit.rewriter_instructions}</div>
                )}
              </li>
            ))}
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
    </div>
  );
}
