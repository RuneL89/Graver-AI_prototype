import { useState } from 'react';
import { ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import type { PromptLogEntry } from '../../workbench/lib/pipeline';

interface PromptInspectorProps {
  entries: PromptLogEntry[];
}

export default function PromptInspector({ entries }: PromptInspectorProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
        No prompts recorded yet.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <MessageSquare className="w-4 h-4" />
        Prompt Log ({entries.length})
      </h3>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {entries.map((entry) => {
          const isOpen = expandedId === entry.id;
          return (
            <div key={entry.id} className="border border-border rounded overflow-hidden">
              <button
                onClick={() => setExpandedId(isOpen ? null : entry.id)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs bg-muted hover:bg-muted/80"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{entry.agentName}</span>
                  <span className="text-muted-foreground">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                {isOpen ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
              {isOpen && (
                <div className="px-3 py-2 space-y-2 text-xs">
                  <div>
                    <div className="font-semibold text-muted-foreground mb-1">Prompt</div>
                    <div className="bg-background border border-border rounded p-2 max-h-32 overflow-y-auto whitespace-pre-wrap">
                      {entry.prompt}
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-muted-foreground mb-1">Response</div>
                    <div className="bg-background border border-border rounded p-2 max-h-32 overflow-y-auto whitespace-pre-wrap">
                      {entry.response}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
