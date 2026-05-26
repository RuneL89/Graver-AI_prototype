import {
  Circle,
  Loader2,
  CheckCircle,
  XCircle,
  RotateCcw,
  GitBranch,
  Search,
  Combine,
  Scale,
  Pencil,
  FileText,
} from 'lucide-react';
import type { StageRecord, StageId } from '../../workbench/lib/pipelineTypes';

interface PipelineVisualizerProps {
  stages: StageRecord[];
  currentStageId: StageId | null;
}

const STAGE_ICONS: Record<string, React.ReactNode> = {
  decompose: <GitBranch className="w-4 h-4" />,
  research: <Search className="w-4 h-4" />,
  synthesize: <Combine className="w-4 h-4" />,
  audit: <Scale className="w-4 h-4" />,
  rewrite: <Pencil className="w-4 h-4" />,
  assemble: <FileText className="w-4 h-4" />,
};

function StageNode({ stage, isLoopBack }: { stage: StageRecord; isLoopBack?: boolean }) {
  const icon = STAGE_ICONS[stage.id] ?? <Circle className="w-4 h-4" />;

  const statusClass =
    stage.status === 'running'
      ? 'bg-orange-500/20 text-orange-400 border-orange-500'
      : stage.status === 'completed'
      ? 'bg-green-500/20 text-green-400 border-green-500'
      : stage.status === 'error'
      ? 'bg-red-500/20 text-red-400 border-red-500'
      : stage.status === 'rejected'
      ? 'bg-amber-500/20 text-amber-400 border-amber-500'
      : 'bg-muted text-muted-foreground border-border';

  const statusIcon =
    stage.status === 'running' ? (
      <Loader2 className="w-4 h-4 animate-spin" />
    ) : stage.status === 'completed' ? (
      <CheckCircle className="w-4 h-4" />
    ) : stage.status === 'error' ? (
      <XCircle className="w-4 h-4" />
    ) : stage.status === 'rejected' ? (
      <RotateCcw className="w-4 h-4" />
    ) : (
      <Circle className="w-4 h-4" />
    );

  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded border text-xs font-medium transition-colors ${statusClass}`}
      >
        {icon}
        <span className="capitalize">{stage.shortName || stage.name}</span>
        {statusIcon}
        {stage.iteration > 1 && (
          <span className="text-[10px] opacity-70">x{stage.iteration}</span>
        )}
      </div>
      {isLoopBack && (
        <div className="flex items-center text-amber-400">
          <RotateCcw className="w-3 h-3" />
          <span className="text-[10px] ml-0.5">Loop</span>
        </div>
      )}
    </div>
  );
}

export default function PipelineVisualizer({ stages, currentStageId: _currentStageId }: PipelineVisualizerProps) {
  if (!stages.length) return null;

  // Detect loop back: audit → rewrite
  const auditStage = stages.find((s) => s.id === 'audit');
  const rewriteStage = stages.find((s) => s.id === 'rewrite');
  const showLoopBack =
    auditStage &&
    rewriteStage &&
    (auditStage.status === 'rejected' || rewriteStage.iteration > 0);

  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold mb-2">Pipeline</h3>
      <div className="flex flex-wrap items-center gap-2">
        {stages.map((stage, index) => {
          const isLoop = showLoopBack && stage.id === 'audit';
          return (
            <div key={stage.id} className="flex items-center gap-2">
              {index > 0 && <span className="text-muted-foreground text-xs">→</span>}
              <StageNode stage={stage} isLoopBack={isLoop} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
