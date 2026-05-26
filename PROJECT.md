# AI Investigative Workbench — Project Architecture

This document maps which files are reused from the AI Newsroom `Web_version` branch and which are new to the workbench.

## Reused Files

All reused files are copied with **import-path adjustments only**. No business logic is modified.

| Original Source (AI Newsroom `Web_version`) | Destination (Workbench) | Purpose |
|---|---|---|
| `src/lib/pipeline.ts` | `src/workbench/lib/pipeline.ts` | Pipeline runner with stage orchestration, retry logic, and parallel topic loops |
| `src/lib/llmAdapter.ts` | `src/workbench/lib/llmAdapter.ts` | Model-agnostic LLM API adapter with adaptive retry |
| `src/lib/fileManager.ts` | `src/workbench/lib/fileManager.ts` | IndexedDB generic wrappers (`dbGet`, `dbSet`, `dbDelete`, `dbKeys`). Newsroom segment/audio functions removed in Sprint 4. |
| `src/lib/sessionConfig.ts` | `src/workbench/lib/sessionConfig.ts` | Minimal `SessionConfig` base interface. Newsroom serialization removed in Sprint 4. |
| `src/lib/apiConfig.ts` | `src/workbench/lib/apiConfig.ts` | API config persistence, LLM call helpers, Brave Search helpers |
| `src/types.ts` | `src/workbench/types-shared.ts` | Orchestration types only (ApiProvider, ApiConfig, AppApiConfig). Newsroom types removed in Sprint 4. |

### Transitive Dependencies (also reused)

These files are required by the reused files above and are copied unchanged except for import paths.

| Original Source | Destination | Required By |
|---|---|---|
| `src/lib/pipelineTypes.ts` | `src/workbench/lib/pipelineTypes.ts` | `pipeline.ts` |
| `src/lib/pipelineService.ts` | `src/workbench/lib/pipelineService.ts` | `pipeline.ts`, `pipelineNotifications.ts` |
| `src/lib/pipelineNotifications.ts` | `src/workbench/lib/pipelineNotifications.ts` | `pipeline.ts` |

**Deleted in Sprint 4:** `src/workbench/data/bias.ts` and `src/workbench/data/timeframes.ts` (newsroom data files no longer needed).

## New Files

| File | Purpose |
|---|---|
| `src/workbench/types.ts` | Workbench-specific types: Tip, ResearchPlan, EvidenceFinding, Synthesis, WikiPage, EvidenceMemo, WorkbenchSessionConfig |
| `src/workbench/config.ts` | Default workbench session configuration |
| `src/App.tsx` | Root React component (minimal Sprint 0 shell) |
| `src/main.tsx` | React entry point |
| `src/index.css` | Tailwind base styles |
| `src/test/hello-world.ts` | Sprint 0 acceptance test: runs a dummy agent through the pipeline runner and verifies an IndexedDB write |
| `src/workbench/lib/workbenchAgentContext.ts` | Sprint 1: `WorkbenchAgentContext`, `buildWorkbenchAgentContext`, `emitReasoning`, `checkAborted`, `buildAgentOutput` |
| `src/workbench/lib/workbenchStages.ts` | Sprint 2: Workbench stage definitions and `getWorkbenchNextStage` routing logic |
| `src/workbench/lib/workbenchAgentMap.ts` | Sprint 2: Maps workbench stage IDs to `AgentFn` implementations |
| `src/workbench/lib/researchStallRecovery.ts` | Sprint 3: `isRetryableError`, `runWithStallRecovery`, `MAX_STALL_WAVES` |
| `src/test/sprint1-agentfn-verification.ts` | Sprint 1: 33 tests verifying AgentFn wrappers |
| `src/test/sprint2-runner-verification.ts` | Sprint 2: 59 tests verifying PipelineRunner integration |
| `src/test/sprint3-recovery-verification.ts` | Sprint 3: 24 tests verifying abort, resume, and stall recovery |
| `src/test/sprint4-cleanup-verification.ts` | Sprint 4: 29 tests verifying dead code removal |

## Build Tooling

Build configuration is carried over from the AI Newsroom project with minimal adaptation:

| File | Origin | Changes |
|---|---|---|
| `package.json` | AI Newsroom | Removed newsroom-specific dependencies (leaflet, react-leaflet, lamejs, sonner). Renamed package. |
| `vite.config.ts` | AI Newsroom | None |
| `tsconfig.json` | AI Newsroom | None |
| `tsconfig.node.json` | AI Newsroom | None |
| `tailwind.config.js` | AI Newsroom | None |
| `postcss.config.js` | AI Newsroom | None |
| `index.html` | AI Newsroom | Updated title, removed lamejs script tag |

## Sprint 4 Cleanup Notes

The following newsroom-specific code was removed during Sprint 4 (SessionConfig Unification and Dead Code Removal):

### Removed from `src/workbench/types-shared.ts`
- `ContinentCode`, `Continent`, `ContinentNewsSource`, `Country`
- `Timeframe`, `TimeframeConfig`
- `Voice`, `MusicStyle`, `MusicSuite`
- `Topic`, `BiasPosition`, `BiasConfig`, `GeneratedPrompt`
- Kept: `ApiProvider`, `ApiConfig`, `AppApiConfig`

### Removed from `src/workbench/lib/sessionConfig.ts`
- `BuildSessionConfigParams`, `buildSessionConfig()`
- `getPodcastFileName()`, `formatSessionContextForLLM()`
- Kept: minimal `SessionConfig` interface (`{ apiConfig: ApiConfig; [key: string]: unknown }`)

### Removed from `src/workbench/lib/fileManager.ts`
- `SegmentId`, `ALL_SEGMENT_IDS`, `SEGMENT_FILE_NAMES`
- `writeSegment()`, `readSegment()`, `writeFullScript()`, `readFullScript()`
- `readAllSegments()`, `writeAllSegments()`, `listSegmentFiles()`, `clearAllSegments()`
- `segmentsExist()`, `getSegmentInfo()`
- `ArticleSource`, `SelectedArticle`, `SelectedArticlesMap`
- `writeSelectedArticles()`, `readSelectedArticles()`
- `writeAudioFile()`, `readAudioFile()`, `audioFileExists()`, `createAudioFile()`
- `appendAudioChunk()`, `getPodcastPlaybackUrl()`, `copyPodcastToDocuments()`, `readAudioFileBinary()`
- Kept: generic IndexedDB wrappers (`dbGet`, `dbSet`, `dbDelete`, `dbKeys`)

### Removed data files
- `src/workbench/data/bias.ts`
- `src/workbench/data/timeframes.ts`

### Updated references
- `pipelineTypes.ts`: `TopicStatus.segmentId` changed from `SegmentId` to `string`
- `pipeline.ts`: `INDEX_TO_SEGMENT` changed from `SegmentId[]` to `string[]`
- `hello-world.ts`: updated to use minimal `SessionConfig` and generic `dbSet`/`dbGet`

## Agent Interface Pattern

The `AgentFn` interface from `pipelineTypes.ts` is preserved intact:

```typescript
type AgentFn = (
  ctx: AgentContext,
  onReasoningChunk: (chunk: string) => void,
  onUpdate?: (partial: Partial<AgentOutput>) => void
) => Promise<AgentOutput>;
```

All future workbench agents implement this interface.
