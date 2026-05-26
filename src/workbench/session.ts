import { dbGet, dbSet } from './lib/fileManager';

export type PipelineStage =
  | 'idle'
  | 'decomposing'
  | 'researching'
  | 'synthesizing'
  | 'auditing'
  | 'assembling'
  | 'done'
  | 'error';

export interface WorkbenchSession {
  tipId: string | null;
  wikiId: string | null;
  stage: PipelineStage;
  createdAt: string;
  updatedAt: string;
}

const SESSION_KEY = 'workbench-session';

export async function loadSession(): Promise<WorkbenchSession | null> {
  const raw = await dbGet(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw as string) as WorkbenchSession;
  } catch {
    return null;
  }
}

export async function saveSession(session: WorkbenchSession): Promise<void> {
  await dbSet(SESSION_KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await dbSet(SESSION_KEY, JSON.stringify(createSession()));
}

export function createSession(): WorkbenchSession {
  const now = new Date().toISOString();
  return {
    tipId: null,
    wikiId: null,
    stage: 'idle',
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateSessionStage(stage: PipelineStage, tipId?: string, wikiId?: string): Promise<void> {
  const session = (await loadSession()) || createSession();
  session.stage = stage;
  if (tipId !== undefined) session.tipId = tipId;
  if (wikiId !== undefined) session.wikiId = wikiId;
  session.updatedAt = new Date().toISOString();
  await saveSession(session);
}

export interface IntermediateFile {
  name: string;
  key: string;
  exists: boolean;
}

export async function listIntermediateFiles(tipId: string): Promise<IntermediateFile[]> {
  const keys = await Promise.all([
    dbGet(`research-plan/${tipId}`).then((r) => !!r),
    dbGet(`external-evidence/${tipId}`).then((r) => !!r),
    dbGet(`internal-evidence/${tipId}`).then((r) => !!r),
    dbGet(`synthesis/${tipId}`).then((r) => !!r),
  ]);

  return [
    { name: 'Research Plan', key: `research-plan/${tipId}`, exists: keys[0] },
    { name: 'External Evidence', key: `external-evidence/${tipId}`, exists: keys[1] },
    { name: 'Internal Evidence', key: `internal-evidence/${tipId}`, exists: keys[2] },
    { name: 'Synthesis', key: `synthesis/${tipId}`, exists: keys[3] },
  ];
}

export async function loadIntermediateFile(key: string): Promise<string | null> {
  const raw = await dbGet(key);
  if (!raw) return null;
  return typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
}
