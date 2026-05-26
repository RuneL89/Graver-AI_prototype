import { useState, useEffect } from 'react';
import { Activity, Lightbulb, BookOpen } from 'lucide-react';
import TipInput from './TipInput';
import WikiSelector from './WikiSelector';
import DocumentUploader from './DocumentUploader';
import WikiQuery from './WikiQuery';
import WikiLint from './WikiLint';
import EvidenceMemo from './EvidenceMemo';
import IntermediateFiles from './IntermediateFiles';
import type { WorkbenchSessionConfig } from '../../workbench/types';
import { loadSession, saveSession, createSession, type PipelineStage } from '../../workbench/session';

const STAGE_LABEL: Record<PipelineStage, string> = {
  idle: 'Idle',
  decomposing: 'Decomposing Tip...',
  researching: 'Researching...',
  synthesizing: 'Synthesizing...',
  auditing: 'Auditing...',
  assembling: 'Assembling Memo...',
  done: 'Complete',
  error: 'Error',
};

interface WorkbenchProps {
  sessionConfig: WorkbenchSessionConfig;
}

export default function Workbench({ sessionConfig }: WorkbenchProps) {
  const [selectedWikiId, setSelectedWikiId] = useState<string | null>(null);
  const [currentTipId, setCurrentTipId] = useState<string | null>(null);
  const [stage, setStage] = useState<PipelineStage>('idle');

  // Load session on mount
  useEffect(() => {
    loadSession().then((session) => {
      if (session) {
        setSelectedWikiId(session.wikiId);
        setCurrentTipId(session.tipId);
        setStage(session.stage);
      }
    });
  }, []);

  // Persist session when state changes
  useEffect(() => {
    const session = createSession();
    session.wikiId = selectedWikiId;
    session.tipId = currentTipId;
    session.stage = stage;
    saveSession(session);
  }, [selectedWikiId, currentTipId, stage]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm font-medium">Pipeline Status</span>
        </div>
        <span
          className={`text-xs px-3 py-1 rounded-full font-medium ${
            stage === 'done'
              ? 'bg-green-900/30 text-green-300'
              : stage === 'error'
              ? 'bg-red-900/30 text-red-300'
              : stage !== 'idle'
              ? 'bg-primary/20 text-primary'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {STAGE_LABEL[stage]}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tip Router Column */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 px-1">
            <Lightbulb className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-sm font-semibold">Tip Router</h2>
              <p className="text-xs text-muted-foreground">
                Decompose tips, research in parallel, and synthesize evidence.
              </p>
            </div>
          </div>

          <TipInput
            sessionConfig={sessionConfig}
            wikiId={selectedWikiId}
            onTipCreated={(tipId) => setCurrentTipId(tipId)}
            onStageChange={(s) => setStage(s)}
          />

          <IntermediateFiles tipId={currentTipId} />
          <EvidenceMemo tipId={currentTipId} />
        </div>

        {/* Document Pre-Digestor Column */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 px-1">
            <BookOpen className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-sm font-semibold">Document Pre-Digestor</h2>
              <p className="text-xs text-muted-foreground">
                Ingest documents, query the wiki, and run health checks.
              </p>
            </div>
          </div>

          <WikiSelector selectedWikiId={selectedWikiId} onSelectWiki={setSelectedWikiId} />
          <DocumentUploader sessionConfig={sessionConfig} wikiId={selectedWikiId} />
          <WikiQuery apiConfig={sessionConfig.apiConfig} wikiId={selectedWikiId} />
          <WikiLint apiConfig={sessionConfig.apiConfig} wikiId={selectedWikiId} />
        </div>
      </div>
    </div>
  );
}
