# Sprint Instructions

## AI Investigative Workbench — Improvement Sprints

**Reference Document:** `planning/FRD_AI_Investigative_Workbench.md`  
**Implementation Plan:** `IMPROVEMENT_IMPLEMENTATION_PLAN.md`  
**Source Repository for Reuse:** `https://github.com/RuneL89/Ai-newsroom/tree/Web_version`

---

## Process Rules

1. **Self-contained sprints:** Each sprint has its own instruction file and acceptance criteria. Do not mix sprint work.
2. **No skipping:** Sprints must be completed in order (1 → 2 → 3 → 4 → 5 → 6).
3. **Auto-advance:** The coding agent auto-advances to the next sprint immediately after all acceptance criteria for the current sprint are met and verified by tests.
4. **Update-on-start:** When a sprint begins, update its status to `🔄 In Progress` in the tracker below.
5. **Update-on-end:** When a sprint completes, update its status to `✅ Completed`, fill in the Sprint Status section, and immediately begin the next sprint.
6. **User review:** The user reviews completed work at natural breakpoints but does not need to give explicit approval between every sprint.

---

## Sprint Overview

| # | Name | Status | Instructions |
|---|------|--------|--------------|
| 1 | AgentFn Interface Standardization | ✅ Completed | [sprints/sprint-1-agentfn/instructions.md](sprints/sprint-1-agentfn/instructions.md) |
| 2 | PipelineRunner Integration | ✅ Completed | [sprints/sprint-2-runner/instructions.md](sprints/sprint-2-runner/instructions.md) |
| 3 | Resume, Abort, and Recovery | ✅ Completed | [sprints/sprint-3-recovery/instructions.md](sprints/sprint-3-recovery/instructions.md) |
| 4 | SessionConfig Unification and Dead Code Removal | ✅ Completed | [sprints/sprint-4-cleanup/instructions.md](sprints/sprint-4-cleanup/instructions.md) |
| 5 | Automated Pipeline Execution and Agent Visibility | ✅ Completed | [sprints/sprint-5-visibility/instructions.md](sprints/sprint-5-visibility/instructions.md) |
| 6 | README Documentation | ✅ Completed | [sprints/sprint-6-readme/instructions.md](sprints/sprint-6-readme/instructions.md) |

---

## Sprint Status

### Sprint 1: AgentFn Interface Standardization
- **What was done:**
  - Created `src/workbench/lib/workbenchAgentContext.ts` with `WorkbenchAgentContext`, `buildWorkbenchAgentContext`, `emitReasoning`, `isAborted`, `checkAborted`, and `buildAgentOutput` helpers.
  - Converted all 12 workbench agents to export AgentFn implementations:
    - Tip Router: `decomposeTipAgent`, `researchSubClaimWebAgent`, `researchSubClaimWikiAgent`, `synthesizeEvidenceAgent`, `validateMechanicallyAgent`, `auditSynthesisAgent`, `rewriteSynthesisAgent`, `assembleEvidenceMemoAgent`
    - Pre-Digestor: `ingestDocumentAgent`, `compoundDocumentAgent`, `queryWikiAgent`, `lintWikiAgent`
  - Each AgentFn accepts `WorkbenchAgentContext`, uses `onReasoningChunk` and `onUpdate`, returns `AgentOutput` with `draft`, `reasoning`, `metadata`, and `prompt`.
  - Cross-agent feedback wired via `ctx.feedback` (rewriteSynthesisAgent reads EvidenceAudit from feedback).
  - Created `src/test/sprint1-agentfn-verification.ts` with 33 passing tests.
- **What is left / deferred:**
  - Nothing. Sprint 1 acceptance criteria fully met.
- **Scope changes / blockers:**
  - None.

### Sprint 2: PipelineRunner Integration
- **What was done:**
  - Refactored `PipelineRunner` to accept configurable `PipelineRunnerOptions` with `stageDefinitions`, `getNextStage`, `initialStageId`, `stageOrder`, `enableTopicLoop`, and `contextBuilder`.
  - Made `PipelineRunner` generic over config type (`T extends SessionConfig`) to support both newsroom and workbench configs.
  - Created `src/workbench/lib/workbenchStages.ts` with `WORKBENCH_TIP_ROUTER_STAGE_DEFS`, `WORKBENCH_PREDIGESTOR_STAGE_DEFS`, `WORKBENCH_TIP_ROUTER_ORDER`, and `getWorkbenchNextStage` routing logic.
  - Created `src/workbench/lib/workbenchAgentMap.ts` with `workbenchTipRouterAgentMap`, `workbenchPredigestorAgentMap`, and combined `workbenchAgentMap`.
  - Refactored `TipInput.tsx` to instantiate `PipelineRunner` with workbench stages and execute via `runner.executeStage()` and `runner.runFromStage()`.
  - Refactored `WikiQuery.tsx` to execute queries through `PipelineRunner.executeStage('query', ...)`.
  - Refactored `WikiLint.tsx` to execute lint through `PipelineRunner.executeStage('lint', ...)`.
  - Updated `Workbench.tsx` to pass `sessionConfig` to `WikiQuery` and `WikiLint` (instead of `apiConfig`).
  - Deleted `src/workbench/tiprouter/synthesisLoop.ts` after its logic was absorbed by the runner's `getWorkbenchNextStage` routing.
  - Added `getRunFromInputs()` support for workbench stages in `PipelineRunner` (decompose, research, synthesize, audit, rewrite, assemble, ingest, query, lint).
  - Created `src/test/sprint2-runner-verification.ts` with 59 passing tests covering stage defs, agent map, routing logic, executeStage, runFromStage, and source inspection.
- **What is left / deferred:**
  - Nothing. Sprint 2 acceptance criteria fully met.
- **Scope changes / blockers:**
  - None.

### Sprint 3: Resume, Abort, and Recovery
- **What was done:**
  - Wired abort signal through `fetchWithAdaptiveRetry`, `callLLM`, and `streamLLM` in `llmAdapter.ts` and `apiConfig.ts`.
  - Added `checkAborted(ctx)` to all workbench agent wrappers and ensured `ctx.abortSignal` is passed to LLM calls.
  - Updated `checkAborted` to throw `'Pipeline aborted by user'` for proper retry handling in `PipelineRunner`.
  - `fetchWithAdaptiveRetry` catches `AbortError` and re-throws as `'Pipeline aborted by user'`.
  - `streamLLM` checks abort signal in the read loop and cancels the reader when aborted.
  - Implemented round-based stall recovery in `researchLoop.ts` using `src/workbench/lib/researchStallRecovery.ts`.
  - Added `stalled` state to `ResearchTaskStatus` and `ResearchMonitor.tsx` UI.
  - Max 3 retry waves per sub-claim; after max waves, sub-claims are marked `failed` and pipeline continues.
  - Updated `PipelineService.ts` to track active state and current status.
  - Updated `PipelineNotifications.ts` with browser notification support (fires only when tab is inactive).
  - Wired `notifyComplete` and `notifyAttention` into `TipInput.tsx` callbacks.
  - Cancel button already present in `TipInput.tsx` calling `runnerRef.current?.stop()`.
  - Created `src/test/sprint3-recovery-verification.ts` with 24 passing tests.
- **What is left / deferred:**
  - Nothing. Sprint 3 acceptance criteria fully met.
- **Scope changes / blockers:**
  - None.

### Sprint 4: SessionConfig Unification and Dead Code Removal
- **What was done:**
  - Removed all newsroom-specific types from `types-shared.ts`, keeping only `ApiProvider`, `ApiConfig`, `AppApiConfig`.
  - Replaced `sessionConfig.ts` with minimal `SessionConfig` interface (`{ apiConfig: ApiConfig; [key: string]: unknown }`).
  - Removed newsroom serialization (`buildSessionConfig`, `getPodcastFileName`, `formatSessionContextForLLM`).
  - Stripped `fileManager.ts` down to generic IndexedDB wrappers (`dbGet`, `dbSet`, `dbDelete`, `dbKeys`).
  - Removed all audio/podcast functions (`writeAudioFile`, `appendAudioChunk`, `getPodcastPlaybackUrl`, etc.).
  - Removed all segment file functions (`writeSegment`, `readSegment`, `readAllSegments`, etc.).
  - Removed `SegmentId`, `ArticleSource`, `SelectedArticle` types and related helpers.
  - Updated `pipelineTypes.ts` to use `string` instead of `SegmentId` for `TopicStatus.segmentId`.
  - Updated `pipeline.ts` to cast to `Record<string, any>` for newsroom-specific field access.
  - Updated `hello-world.ts` to use minimal `SessionConfig` and generic `dbSet`/`dbGet`.
  - Updated `PROJECT.md` with cleanup documentation.
  - Created `src/test/sprint4-cleanup-verification.ts` with 34 passing tests.
- **What is left / deferred:**
  - Nothing. Sprint 4 acceptance criteria fully met.
- **Scope changes / blockers:**
  - None.

### Sprint 5: Automated Pipeline Execution and Agent Visibility
- **What was done:**
  - Created `PipelineVisualizer.tsx` — visual stage flow diagram with status colors, Lucide icons, and loop-back arrows for audit→rewrite iterations.
  - Created `AgentDashboard.tsx` — live agent status cards mapping each stage to a Lucide icon, showing latest reasoning snippets for running agents.
  - Created `PromptInspector.tsx` — slide-out drawer listing every LLM prompt and response with filtering by stage and search.
  - Created `src/workbench/lib/agentRegistry.ts` — agent metadata registry for dashboard and visualizer.
  - Refactored `TipInput.tsx` — replaced manual per-stage buttons with single "Run Investigation" flow. Added pause, resume, and cancel controls. Integrated PipelineVisualizer, AgentDashboard, and PromptInspector.
  - Added `pause()`, `resume()`, and `getPromptLog()` to `PipelineRunner` with prompt log collection in `executeStage()`.
  - Replaced all emojis in UI components with Lucide icons.
  - Replaced markdown emoji markers with text labels: `[CONTRADICTION]`, `[GAP]` in `reportAssembler.ts`, `compounder.ts`, and `linter.ts`.
  - Created `src/test/sprint5-visibility-verification.ts` with 17 passing tests.
- **What is left / deferred:**
  - Nothing. Sprint 5 acceptance criteria fully met.
- **Scope changes / blockers:**
  - None.

### Sprint 6: README Documentation
- **What was done:**
  - Rewrote `README.md` with a 5-section structure:
    1. **Introduction** -- elevator pitch for investigative journalists, non-technical readers.
    2. **Functional Architecture** -- end-user friendly explanation of Tip Router and Document Pre-Digestor, what the human does vs. what the system does.
    3. **Agent Flow and Orchestration** -- mid-level developer walkthrough of the decompose -> research -> synthesize -> audit -> rewrite -> assemble pipeline, two-layer audit gate, rewrite loop mechanics, parallel research, stall recovery, Document Pre-Digestor three-layer architecture, key data structures, and PipelineRunner state machine.
    4. **Technical Architecture** -- senior developer deep-dive covering directory structure, AgentFn interface, PipelineRunner generics and options, metadata-driven routing, LLM adapter cross-provider abstraction, file manager IndexedDB wrappers, agent architecture with WorkbenchAgentContext, session management and abort propagation, two-layer audit pattern, wiki architecture (chunking, citation anchors, compounding, schema document), stall recovery rounds, prompt logging, and UI architecture with React event subscriptions and real-time streaming.
    5. **Project Structure** -- complete tree view with one-line descriptions of every folder and key file.
  - No emojis anywhere in the README. Lucide icon names (`Play`, `BookOpen`, `CheckCircle`, `Loader2`, `RotateCcw`, `Settings`) used when referencing UI elements.
  - Accurate external references to AI Newsroom repo and Karpathy coding guidelines.
  - Updated verification commands to include all 11 sprint tests.
  - `src/test/sprint6-verification.ts` passes (12 tests).
- **What is left / deferred:**
  - Nothing. Sprint 6 acceptance criteria fully met.
- **Scope changes / blockers:**
  - None.

---

## References

- **Functional Requirements Document:** `planning/FRD_AI_Investigative_Workbench.md`
- **Improvement Implementation Plan:** `IMPROVEMENT_IMPLEMENTATION_PLAN.md`
- **AI Newsroom Web Version (reusable patterns):** `https://github.com/RuneL89/Ai-newsroom/tree/Web_version`
- **Project Background:** `PROJECT.md`
- **Agent Coding Guidelines:** `AGENTS.md`
