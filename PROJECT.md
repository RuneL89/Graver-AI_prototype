# AI Investigative Workbench — Project Architecture

This document maps which files are reused from the AI Newsroom `Web_version` branch and which are new to the workbench.

## Reused Files

All reused files are copied with **import-path adjustments only**. No business logic is modified.

| Original Source (AI Newsroom `Web_version`) | Destination (Workbench) | Purpose |
|---|---|---|
| `src/lib/pipeline.ts` | `src/workbench/lib/pipeline.ts` | Pipeline runner with stage orchestration, retry logic, and parallel topic loops |
| `src/lib/llmAdapter.ts` | `src/workbench/lib/llmAdapter.ts` | Model-agnostic LLM API adapter with adaptive retry |
| `src/lib/fileManager.ts` | `src/workbench/lib/fileManager.ts` | IndexedDB file storage (segments, audio, articles) |
| `src/lib/sessionConfig.ts` | `src/workbench/lib/sessionConfig.ts` | Session configuration builder and formatter |
| `src/lib/apiConfig.ts` | `src/workbench/lib/apiConfig.ts` | API config persistence, LLM call helpers, Brave Search helpers |
| `src/types.ts` | `src/workbench/types-shared.ts` | Shared TypeScript types (Country, Continent, Voice, ApiConfig, etc.) |

### Transitive Dependencies (also reused)

These files are required by the reused files above and are copied unchanged except for import paths.

| Original Source | Destination | Required By |
|---|---|---|
| `src/lib/pipelineTypes.ts` | `src/workbench/lib/pipelineTypes.ts` | `pipeline.ts` |
| `src/lib/pipelineService.ts` | `src/workbench/lib/pipelineService.ts` | `pipeline.ts`, `pipelineNotifications.ts` |
| `src/lib/pipelineNotifications.ts` | `src/workbench/lib/pipelineNotifications.ts` | `pipeline.ts` |
| `src/data/bias.ts` | `src/workbench/data/bias.ts` | `sessionConfig.ts` |
| `src/data/timeframes.ts` | `src/workbench/data/timeframes.ts` | `sessionConfig.ts` |

## New Files

| File | Purpose |
|---|---|
| `src/workbench/types.ts` | Workbench-specific types: Tip, ResearchPlan, EvidenceFinding, Synthesis, WikiPage, EvidenceMemo, WorkbenchSessionConfig |
| `src/workbench/config.ts` | Default workbench session configuration |
| `src/App.tsx` | Root React component (minimal Sprint 0 shell) |
| `src/main.tsx` | React entry point |
| `src/index.css` | Tailwind base styles |
| `src/test/hello-world.ts` | Sprint 0 acceptance test: runs a dummy agent through the pipeline runner and verifies an IndexedDB write |

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
