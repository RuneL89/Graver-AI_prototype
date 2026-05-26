import {
  GitBranch,
  Globe,
  Combine,
  Scale,
  Pencil,
  FileText,
  Database,
  Search,
  Stethoscope,
  Circle,
  Loader2,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import type { StageRecord } from '../../workbench/lib/pipelineTypes';

interface AgentDashboardProps {
  stages: StageRecord[];
}

const AGENT_ICONS: Record<string, React.ElementType> = {
  decompose: GitBranch,
  research: Globe,
  synthesize: Combine,
  audit: Scale,
  rewrite: Pencil,
  assemble: FileText,
  ingest: Database,
  query: Search,
  lint: Stethoscope,
};

const AGENT_NAMES: Record<string, string> = {
  decompose: 'Tip Decomposer',
  research: 'Parallel Researcher',
  synthesize: 'Evidence Synthesizer',
  audit: 'Evidence Auditor',
  rewrite: 'Evidence Writer',
  assemble: 'Report Assembler',
  ingest: 'Document Ingestor',
  query: 'Wiki Querier',
  lint: 'Wiki Linter',
};

function StatusIcon({ status }: { status: StageRecord['status'] }) {
  switch (status) {
    case 'running':
      return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
    case 'completed':
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'error':
      return <XCircle className="w-4 h-4 text-red-500" />;
    case 'rejected':
      return <Scale className="w-4 h-4 text-amber-500" />;
    default:
      return <Circle className="w-4 h-4 text-muted-foreground" />;
  }
}

export default function AgentDashboard({ stages }: AgentDashboardProps) {
  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="text-sm font-semibold mb-3">Agents</h3>
      <div className="space-y-2">
        {stages.map((stage) => {
          const Icon = AGENT_ICONS[stage.id] || Circle;
          return (
            <div
              key={stage.id}
              className={`flex items-center gap-3 px-3 py-2 rounded border text-sm ${
                stage.status === 'running'
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-muted/30'
              }`}
            >
              <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {AGENT_NAMES[stage.id] || stage.name}
                </div>
                {stage.reasoning && stage.status === 'running' && (
                  <div className="text-xs text-muted-foreground truncate">
                    {stage.reasoning.slice(-80)}
                  </div>
                )}
              </div>
              <StatusIcon status={stage.status} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
