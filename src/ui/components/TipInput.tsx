import { useState, useRef } from 'react';
import {
  Lightbulb,
  AlertCircle,
  CheckCircle,
  Play,
  Pause,
  FileText,
  RotateCcw,
  BookOpen,
  Square,
} from 'lucide-react';
import { PipelineNotifications } from '../../workbench/lib/pipelineNotifications';
import { PipelineRunner } from '../../workbench/lib/pipeline';
import { workbenchTipRouterAgentMap } from '../../workbench/lib/workbenchAgentMap';
import {
  WORKBENCH_TIP_ROUTER_STAGE_DEFS,
  WORKBENCH_TIP_ROUTER_ORDER,
  getWorkbenchNextStage,
} from '../../workbench/lib/workbenchStages';
import { createWorkbenchContextBuilder } from '../../workbench/lib/workbenchAgentContext';
import type { WorkbenchSessionConfig } from '../../workbench/types';
import type { ResearchPlan, EvidenceAudit } from '../../workbench/types';
import type { PipelineStage } from '../../workbench/session';
import type { ResearchTaskStatus } from '../../workbench/tiprouter/researchLoop';
import ResearchMonitor from './ResearchMonitor';
import PipelineVisualizer from './PipelineVisualizer';
import AgentDashboard from './AgentDashboard';
import PromptInspector from './PromptInspector';

interface TipInputProps {
  sessionConfig: WorkbenchSessionConfig;
  wikiId: string | null;
  onTipCreated?: (tipId: string) => void;
  onStageChange?: (stage: PipelineStage) => void;
}

export default function TipInput({ sessionConfig, wikiId, onTipCreated, onStageChange }: TipInputProps) {
  const [tipText, setTipText] = useState('');
  const [phase, setPhase] = useState<'idle' | 'running' | 'paused' | 'done' | 'error'>('idle');

  const setStage = (stage: PipelineStage) => {
    onStageChange?.(stage);
  };
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ResearchPlan | null>(null);
  const [taskStatuses, setTaskStatuses] = useState<ResearchTaskStatus[]>([]);
  const [synthesisEntries, setSynthesisEntries] = useState<number>(0);
  const [finalAudit, setFinalAudit] = useState<EvidenceAudit | null>(null);
  const [auditIterations, setAuditIterations] = useState<{ iteration: number; audit: EvidenceAudit }[]>([]);
  const [reasoning, setReasoning] = useState<string[]>([]);
  const [currentRunnerStage, setCurrentRunnerStage] = useState<string | null>(null);
  const [runnerState, setRunnerState] = useState<import('../../workbench/lib/pipelineTypes').PipelineState | null>(null);

  const runnerRef = useRef<PipelineRunner<WorkbenchSessionConfig> | null>(null);

  const getOrCreateRunner = (): PipelineRunner<WorkbenchSessionConfig> => {
    if (!runnerRef.current) {
      runnerRef.current = new PipelineRunner(
        workbenchTipRouterAgentMap as unknown as import('../../workbench/lib/pipelineTypes').AgentMap,
        {
          onStateChange: (state) => {
            setRunnerState(state);
            setCurrentRunnerStage(state.currentStageId);
            // Derive task statuses from research stage metadata if available
            const researchStage = state.stages.find((s) => s.id === 'research');
            if (researchStage?.metadata) {
              const meta = researchStage.metadata as { taskStatuses?: ResearchTaskStatus[] };
              if (meta.taskStatuses) {
                setTaskStatuses(meta.taskStatuses);
              }
            }
            // Derive audit status from audit stage
            const auditStage = state.stages.find((s) => s.id === 'audit');
            if (auditStage?.metadata) {
              const meta = auditStage.metadata as { audit?: EvidenceAudit };
              if (meta.audit) {
                setFinalAudit(meta.audit);
                setAuditIterations((prev) => {
                  const exists = prev.some((p) => p.iteration === auditStage.iteration);
                  if (exists) return prev;
                  return [...prev, { iteration: auditStage.iteration, audit: meta.audit! }];
                });
              }
            }
            // Derive synthesis entries
            const synthesizeStage = state.stages.find((s) => s.id === 'synthesize');
            if (synthesizeStage?.metadata) {
              const meta = synthesizeStage.metadata as { synthesis?: { entries?: unknown[] } };
              if (meta.synthesis?.entries) {
                setSynthesisEntries(meta.synthesis.entries.length);
              }
            }
          },
          onComplete: (_draft) => {
            setPhase('done');
            setStage('done');
            PipelineNotifications.notifyComplete('Pipeline Complete', 'The investigative pipeline has finished.');
          },
          onError: (err) => {
            setPhase('error');
            setStage('error');
            setError(err);
            PipelineNotifications.notifyAttention('Pipeline Error', err);
          },
        },
        {
          stageDefinitions: WORKBENCH_TIP_ROUTER_STAGE_DEFS,
          getNextStage: getWorkbenchNextStage,
          initialStageId: 'decompose',
          stageOrder: WORKBENCH_TIP_ROUTER_ORDER,
          enableTopicLoop: false,
          contextBuilder: createWorkbenchContextBuilder(sessionConfig, wikiId),
        }
      );
    }
    return runnerRef.current;
  };

  const handleRun = async () => {
    if (!tipText.trim()) return;
    setPhase('running');
    setStage('decomposing');
    setError(null);
    setPlan(null);
    setTaskStatuses([]);
    setSynthesisEntries(0);
    setFinalAudit(null);
    setAuditIterations([]);
    setReasoning([]);
    runnerRef.current = null;

    try {
      const runner = getOrCreateRunner();
      await runner.run(sessionConfig, false, tipText);

      const finalState = runner.getState();
      const decomposeStage = finalState.stages.find((s) => s.id === 'decompose');
      if (decomposeStage?.status === 'completed') {
        try {
          const meta = decomposeStage.metadata as { plan?: ResearchPlan };
          if (meta?.plan) {
            setPlan(meta.plan);
            onTipCreated?.(meta.plan.tipId);
          }
        } catch {
          // ignore
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== 'Pipeline aborted by user') {
        setPhase('error');
        setStage('error');
        setError(msg);
      } else {
        setPhase('idle');
        setStage('idle');
      }
    }
  };

  const handlePause = () => {
    runnerRef.current?.pause();
    setPhase('paused');
  };

  const handleResume = async () => {
    if (!runnerRef.current) return;
    setPhase('running');
    runnerRef.current?.resume();
    const state = runnerRef.current.getState();
    const currentStage = state.currentStageId;
    if (currentStage) {
      try {
        await runnerRef.current.runFromStage(currentStage, sessionConfig, state);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg !== 'Pipeline aborted by user') {
          setPhase('error');
          setStage('error');
          setError(msg);
        } else {
          setPhase('idle');
          setStage('idle');
        }
      }
    }
  };

  const handleCancel = () => {
    runnerRef.current?.stop();
    setPhase('idle');
    setStage('idle');
  };

  return (
    <div className="rounded-lg border border-border p-6 space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Tip Router</h2>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Enter an investigative tip and click Run Investigation to execute the full pipeline automatically.
      </p>

      <textarea
        value={tipText}
        onChange={(e) => setTipText(e.target.value)}
        placeholder="e.g., 'Mayor Smith received a $50,000 donation from a developer who was later awarded a zoning contract...'"
        rows={4}
        className="w-full px-3 py-2 rounded border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
      />

      <div className="flex flex-wrap gap-2 mt-3">
        {phase === 'idle' && (
          <button
            onClick={handleRun}
            disabled={!tipText.trim()}
            className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            Run Investigation
          </button>
        )}

        {phase === 'running' && (
          <button
            onClick={handlePause}
            className="px-4 py-2 rounded bg-amber-600 text-white text-sm font-medium flex items-center gap-2"
          >
            <Pause className="w-4 h-4" />
            Pause
          </button>
        )}

        {phase === 'paused' && (
          <button
            onClick={handleResume}
            className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            Resume
          </button>
        )}

        {(phase === 'running' || phase === 'paused') && (
          <button
            onClick={handleCancel}
            className="px-4 py-2 rounded border border-red-500 text-red-400 text-sm font-medium flex items-center gap-2"
          >
            <Square className="w-4 h-4" />
            Cancel
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

      {runnerState && (
        <PipelineVisualizer stages={runnerState.stages} currentStageId={runnerState.currentStageId} />
      )}

      {runnerState && (
        <AgentDashboard stages={runnerState.stages} />
      )}

      {runnerRef.current && (
        <PromptInspector entries={runnerRef.current.getPromptLog()} />
      )}

      {currentRunnerStage && (
        <div className="mt-2 text-xs text-muted-foreground">
          Current stage: <span className="font-medium capitalize">{currentRunnerStage}</span>
        </div>
      )}

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

      {(phase === 'running' || phase === 'paused') && taskStatuses.length > 0 && (
        <ResearchMonitor tasks={taskStatuses} />
      )}

      {synthesisEntries > 0 && (
        <div className="mt-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Synthesis ({synthesisEntries} entries)
          </h3>
        </div>
      )}

      {finalAudit && (
        <div className={`mt-4 text-sm p-3 rounded ${
          finalAudit.approval_status === 'APPROVED'
            ? 'bg-green-900/30 text-green-300'
            : 'bg-amber-900/30 text-amber-300'
        }`}>
          <strong>{finalAudit.approval_status}</strong>
          {finalAudit.rewriter_instructions && (
            <div className="mt-1 text-xs">{finalAudit.rewriter_instructions}</div>
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
