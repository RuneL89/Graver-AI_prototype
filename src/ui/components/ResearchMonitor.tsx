import { Loader2, CheckCircle, AlertCircle, Globe, BookOpen } from 'lucide-react';
import type { ResearchTaskStatus } from '../../workbench/tiprouter/researchLoop';

interface ResearchMonitorProps {
  tasks: ResearchTaskStatus[];
}

export default function ResearchMonitor({ tasks }: ResearchMonitorProps) {
  if (tasks.length === 0) return null;

  const completed = tasks.filter((t) => t.state === 'completed').length;
  const failed = tasks.filter((t) => t.state === 'failed').length;
  const running = tasks.filter((t) => t.state === 'running').length;

  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold mb-2">Research Monitor</h3>
      <div className="text-xs text-muted-foreground mb-2">
        {running > 0 && <span className="mr-3">{running} running</span>}
        {completed > 0 && <span className="mr-3 text-green-400">{completed} completed</span>}
        {failed > 0 && <span className="text-red-400">{failed} failed</span>}
      </div>

      <ul className="space-y-2">
        {tasks.map((task) => (
          <li key={task.subClaimId} className="text-sm bg-muted p-3 rounded flex items-start gap-2">
            <div className="mt-0.5">
              {task.state === 'pending' && <div className="w-4 h-4 rounded-full border-2 border-muted-foreground" />}
              {task.state === 'running' && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
              {task.state === 'completed' && <CheckCircle className="w-4 h-4 text-green-500" />}
              {task.state === 'failed' && <AlertCircle className="w-4 h-4 text-red-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{task.subClaimQuestion}</div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  {task.webFindingsCount}
                </span>
                <span className="flex items-center gap-1">
                  <BookOpen className="w-3 h-3" />
                  {task.wikiFindingsCount}
                </span>
              </div>
              {task.error && (
                <div className="text-xs text-red-400 mt-1">{task.error}</div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
