# Improvement Implementation Plan
## AI Investigative Workbench — Agent Flow Integration & Automation

**Reference Document:** `planning/FRD_AI_Investigative_Workbench.md`  
**Source Repository for Reuse:** `https://github.com/RuneL89/Ai-newsroom/tree/Web_version`

**Process Rule:** The coding agent creates a `SPRINT_INSTRUCTIONS.md` at repository root during Step 0, along with a separate instruction file for each sprint in `sprints/sprint-{n}-{name}/instructions.md`. The agent auto-advances to the next sprint immediately after all acceptance criteria for the current sprint are met and verified by tests. The user reviews the completed work at natural breakpoints but does not need to give explicit approval between every sprint. The agent updates the sprint tracker file as each sprint starts and completes.

---

## Step 0: Sprint Instructions Setup

**Objective:** Before any code changes, create the sprint tracking infrastructure: a root `SPRINT_INSTRUCTIONS.md` that references individual instruction files for each sprint.

**Scope:**
- Create the directory structure `sprints/sprint-1-agentfn/`, `sprints/sprint-2-runner/`, `sprints/sprint-3-recovery/`, `sprints/sprint-4-cleanup/`, `sprints/sprint-5-visibility/`, `sprints/sprint-6-readme/`.
- For each sprint, create an `instructions.md` file containing the full requirements, files to create/modify, key implementation notes, and acceptance criteria from the corresponding sprint section below.
- Create `SPRINT_INSTRUCTIONS.md` at repository root.
- Populate the Sprint Overview table with all improvement sprints, linking each to its individual instruction file.
- Set Sprint 1 status to `🔄 In Progress` and all others to `⏳ Pending`.
- Include process rules: self-contained sprints, no skipping, auto-advance on acceptance criteria met, update-on-start/update-on-end rules.
- Include a Sprint Status section for each sprint with `What was done`, `What is left / deferred`, and `Scope changes / blockers` fields.
- Include the References section pointing to the FRD and this implementation plan.

**Files to Create:**
- `SPRINT_INSTRUCTIONS.md` (root) — sprint tracker
- `sprints/sprint-1-agentfn/instructions.md` — Sprint 1 full instructions
- `sprints/sprint-2-runner/instructions.md` — Sprint 2 full instructions
- `sprints/sprint-3-recovery/instructions.md` — Sprint 3 full instructions
- `sprints/sprint-4-cleanup/instructions.md` — Sprint 4 full instructions
- `sprints/sprint-5-visibility/instructions.md` — Sprint 5 full instructions
- `sprints/sprint-6-readme/instructions.md` — Sprint 6 full instructions

**Acceptance Criteria:**
- [ ] `SPRINT_INSTRUCTIONS.md` exists at repository root.
- [ ] Sprint Overview table lists all improvement sprints with correct names, statuses, and links to individual instruction files.
- [ ] Each `sprints/sprint-{n}-{name}/instructions.md` contains the complete requirements for that sprint.
- [ ] Process rules are documented clearly, including the auto-advance rule.
- [ ] The sprint tracker is ready for the coding agent to update as sprints progress.

---

## Sprint 1: AgentFn Interface Standardization

**Instruction File:** `sprints/sprint-1-agentfn/instructions.md`

**Objective:** Convert all workbench agents to implement the `AgentFn` interface so they can be executed through a unified orchestration layer.

**Scope:**
- Create `WorkbenchAgentContext` that wraps `AgentContext` with workbench-specific fields (`apiConfig`, `braveApiKey`, `braveProxyUrl`, `tipId`, `wikiId`, etc.) while preserving the standard `AgentContext` shape expected by `PipelineRunner`.
- Convert `decomposeTip` to implement `AgentFn`. It receives the tip text via `ctx.currentDraft` and returns `AgentOutput` with the `DecomposeResult` in metadata.
- Convert `researchSubClaimWeb` to implement `AgentFn`. It receives the sub-claim via `ctx.currentDraft` and `ctx.feedback` (for retry context).
- Convert `researchSubClaimWiki` to implement `AgentFn`.
- Convert `synthesizeEvidence` to implement `AgentFn`.
- Convert `validateMechanically` to implement `AgentFn` (fast mechanical validation as an agent step).
- Convert `auditSynthesis` to implement `AgentFn`.
- Convert `rewriteSynthesis` to implement `AgentFn`.
- Convert `assembleEvidenceMemo` to implement `AgentFn`.
- Convert `ingestDocument` and `compoundDocument` to implement `AgentFn`.
- Convert `queryWiki` and `lintWiki` to implement `AgentFn`.
- Ensure every agent uses `onReasoningChunk` for streaming reasoning.
- Ensure every agent uses `onUpdate` for partial stage record updates.
- Ensure the `feedback` channel is used for cross-agent communication (audit result passed to writer, mechanical result passed to synthesis).

**Files to Create:**
- `src/workbench/lib/workbenchAgentContext.ts` — WorkbenchAgentContext builder and type definitions

**Files to Modify:**
- `src/workbench/tiprouter/decomposer.ts`
- `src/workbench/tiprouter/webResearcher.ts`
- `src/workbench/tiprouter/wikiQuerier.ts`
- `src/workbench/tiprouter/synthesizer.ts`
- `src/workbench/tiprouter/mechanicalValidator.ts`
- `src/workbench/tiprouter/auditor.ts`
- `src/workbench/tiprouter/evidenceWriter.ts`
- `src/workbench/tiprouter/reportAssembler.ts`
- `src/workbench/predigestor/ingestor.ts`
- `src/workbench/predigestor/compounder.ts`
- `src/workbench/predigestor/querier.ts`
- `src/workbench/predigestor/linter.ts`

**Key Implementation Notes:**
- Do not change agent logic. Only change function signatures and return shapes.
- The `AgentOutput.metadata` field is where workbench-specific results live (e.g., `metadata.decomposeResult`, `metadata.auditResult`).
- The `AgentOutput.draft` field carries the working text or JSON string that the next agent receives as `ctx.currentDraft`.
- `onUpdate` should emit partial `StageRecord` updates with `reasoning` chunks so the UI can show real-time progress.
- Mechanical validation should still run fast (pure code) but wrapped in the AgentFn interface for consistency.

**Acceptance Criteria:**
- [ ] All 12 workbench agents implement `AgentFn`.
- [ ] Every agent returns `AgentOutput` with `draft`, `reasoning`, `metadata`, and `prompt`.
- [ ] Every agent accepts `WorkbenchAgentContext` via the standard `AgentContext` parameter.
- [ ] Every agent streams reasoning via `onReasoningChunk`.
- [ ] Cross-agent communication uses `ctx.feedback` (e.g., audit passes feedback to writer).
- [ ] Unit tests verify each agent can be called through the `AgentFn` interface with mock context.
- [ ] No agent logic is broken; all existing tests still pass.

---

## Sprint 2: PipelineRunner Integration

**Instruction File:** `sprints/sprint-2-runner/instructions.md`

**Objective:** Wire the Tip Router and Pre-Digestor flows through the reused `PipelineRunner` state machine, replacing direct async calls with stage-based execution.

**Scope:**
- Create workbench stage definitions in `STAGE_DEFINITIONS` format for both modules.
- For Tip Router: `decompose` → `research` → `synthesize` → `audit` → `rewrite` (conditional) → `assemble`.
- For Pre-Digestor: `ingest` → `query` / `lint` (user-triggered, not sequential).
- Create an `AgentMap` that maps stage IDs to the AgentFn implementations from Sprint 1.
- Modify `PipelineRunner` to accept workbench stage definitions alongside or instead of newsroom stages. The runner should be configurable with a stage set at instantiation.
- Replace direct agent calls in `TipInput.tsx` with `PipelineRunner.executeStage()` calls.
- Replace direct agent calls in `WikiQuery.tsx` and `WikiLint.tsx` with runner calls.
- Implement `getNextStage()` logic for workbench stages using metadata-driven routing:
  - After `audit`, if `metadata.auditResult.approval_status === 'REJECTED'`, route to `rewrite`.
  - After `rewrite`, route back to `audit`.
  - After `audit` with `APPROVED`, route to `assemble`.
  - After `assemble`, pipeline ends.
- Ensure `PipelineRunner` can handle workbench `SessionConfig` shape by creating a compatibility layer or updating the runner to accept a generic config type.

**Files to Create:**
- `src/workbench/lib/workbenchStages.ts` — stage definitions and routing logic for workbench
- `src/workbench/lib/workbenchAgentMap.ts` — maps stage IDs to AgentFn implementations

**Files to Modify:**
- `src/workbench/lib/pipeline.ts` — make stage definitions configurable, add workbench compatibility
- `src/ui/components/TipInput.tsx` — replace direct calls with runner execution
- `src/ui/components/WikiQuery.tsx` — replace direct calls with runner execution
- `src/ui/components/WikiLint.tsx` — replace direct calls with runner execution

**Key Implementation Notes:**
- The `PipelineRunner` constructor should accept a `stageDefinitions` parameter. If not provided, it falls back to newsroom stages for backward compatibility.
- `runFromStage()` must understand workbench stage IDs.
- The synthesis loop currently lives in `synthesisLoop.ts`. This logic should move into `getNextStage()` routing. `synthesisLoop.ts` can be deleted once its logic is absorbed by the runner.
- `TipInput.tsx` should instantiate a `PipelineRunner` with workbench stages at the start of a tip flow and call `executeStage()` for each phase.
- The UI should display the current stage name, icon, and status from the runner's stage records.

**Acceptance Criteria:**
- [ ] `PipelineRunner` accepts configurable stage definitions.
- [ ] Workbench stage definitions exist for all Tip Router and Pre-Digestor stages.
- [ ] `getNextStage()` correctly routes `audit → rewrite → audit` loops based on metadata.
- [ ] `TipInput.tsx` executes the full tip flow through `PipelineRunner`.
- [ ] `WikiQuery.tsx` executes queries through `PipelineRunner`.
- [ ] `WikiLint.tsx` executes lint through `PipelineRunner`.
- [ ] `runFromStage()` works for workbench stages (test: resume from `research` after `decompose` completes).
- [ ] All existing tests pass.

---

## Sprint 3: Resume, Abort, and Recovery

**Instruction File:** `sprints/sprint-3-recovery/instructions.md`

**Objective:** Enable pause/resume, user abort, and network stall recovery across the workbench pipeline.

**Scope:**
- **Resume:** Ensure `runFromStage()` works end-to-end for workbench. Test resuming from `research`, `synthesize`, and `audit` stages. Preserve prior stage outputs in IndexedDB and reset only downstream stages.
- **Abort:** Wire the `AbortController` from `PipelineRunner` through every workbench agent. Agents must check `signal.aborted` before and during LLM calls. LLM adapters must accept and respect the abort signal.
- **Stall Recovery:** Implement round-based stall recovery in `researchLoop.ts` (or its runner equivalent). Sub-claims that hit 429 or timeout mark themselves `stalled`. After the initial wave settles, all stalled sub-claims retry together. Maximum 3 retry waves per sub-claim.
- **Notifications:** Wire `PipelineNotifications` into the workbench flow. Show browser notifications when long-running stages complete or when the pipeline needs user attention (e.g., audit rejected, waiting for rewrite).
- **Pipeline Service Status:** Integrate `PipelineService` status checks into the workbench UI.

**Files to Create:**
- `src/workbench/lib/researchStallRecovery.ts` — round-based stall recovery coordinator

**Files to Modify:**
- `src/workbench/lib/pipeline.ts` — ensure abort signal propagates to agent context
- `src/workbench/lib/llmAdapter.ts` — accept abort signal in `streamLLM` and `callLLM`
- `src/workbench/lib/apiConfig.ts` — pass abort signal to fetch calls
- `src/workbench/tiprouter/researchLoop.ts` — add stall detection and round-based retry
- `src/ui/components/TipInput.tsx` — add cancel button that triggers abort
- `src/ui/components/ResearchMonitor.tsx` — show stall/retry status per sub-claim

**Key Implementation Notes:**
- Abort signal must propagate: UI button → `PipelineRunner.abort()` → agent checks `ctx.abortSignal` → `streamLLM` passes signal to fetch.
- Stall recovery should not block non-stalled sub-claims. The initial `Promise.allSettled` wave completes, then a second wave retries only stalled items.
- Each sub-claim tracks its own stall wave count. After 3 waves, the sub-claim is marked `failed` and the pipeline continues with partial evidence.
- Notifications should only fire when the tab is not active, to avoid spam.

**Acceptance Criteria:**
- [ ] User can click "Cancel" during any stage and all active LLM calls terminate cleanly.
- [ ] Resuming from `research` stage preserves the completed `decompose` output and re-runs research only.
- [ ] Resuming from `audit` stage preserves synthesis and re-runs audit only.
- [ ] A simulated 429 error on one sub-claim triggers stall recovery; the sub-claim retries after the wave completes.
- [ ] After 3 failed retry waves, the sub-claim is marked failed and the pipeline continues.
- [ ] Browser notification fires when the pipeline completes while the tab is inactive.
- [ ] All existing tests pass; new tests cover abort, resume, and stall recovery.

---

## Sprint 4: SessionConfig Unification and Dead Code Removal

**Instruction File:** `sprints/sprint-4-cleanup/instructions.md`

**Objective:** Reconcile the workbench and newsroom configuration systems, remove dead code, and clean up type definitions.

**Scope:**
- **SessionConfig:** Create a unified `SessionConfig` type that satisfies both newsroom and workbench needs, or split them cleanly with a base interface. The `PipelineRunner` should accept a generic config type.
- **Remove newsroom baggage from `types-shared.ts`:** Delete or deprecate unused fields (`MusicSuite`, `Voice`, `BiasPosition`, `ContinentCode`, `NewsTheme`, `NewsTopic`, `Geography`, `Content`, `PodcastConfig`, `AudioConfig`). Keep only the types used by the orchestration layer (`AgentFn`, `AgentContext`, `AgentOutput`, `StageRecord`, `StageDefinition`, `AuditResult`, etc.).
- **Remove dead code from `fileManager.ts`:** Delete `writeSegment`, `readSegment`, `writeAudioFile`, `appendAudioChunk`, `getPodcastPlaybackUrl`, and any other audio/podcast-specific functions. Keep only the generic IndexedDB wrapper (`dbGet`, `dbSet`, `dbDelete`, `dbKeys`, `listFiles`, `deleteAllFiles`).
- **Update `sessionConfig.ts`:** Remove newsroom-specific serialization logic. Keep only the generic session save/load pattern.
- **Update `PROJECT.md`:** Document which newsroom files were modified and why.

**Files to Modify:**
- `src/workbench/types-shared.ts` — remove newsroom types, keep orchestration types
- `src/workbench/lib/sessionConfig.ts` — remove newsroom serialization
- `src/workbench/lib/fileManager.ts` — remove audio functions
- `src/workbench/lib/pipeline.ts` — accept generic config type
- `PROJECT.md` — document cleanup

**Key Implementation Notes:**
- Be careful not to break the newsroom types if the same file is shared between projects. If the workbench is a separate repo (which it is), you can safely delete newsroom types.
- The `fileManager.ts` audio functions are unused but exported. Check for any imports before deleting.
- If `PipelineRunner` currently types `sessionConfig` as `SessionConfig`, change it to `sessionConfig: any` or a generic `<T>` parameter so both newsroom and workbench configs work.

**Acceptance Criteria:**
- [ ] `types-shared.ts` contains only orchestration-layer types. No newsroom-specific types remain.
- [ ] `fileManager.ts` contains only generic IndexedDB operations. No audio functions remain.
- [ ] `sessionConfig.ts` contains only generic save/load. No newsroom serialization remains.
- [ ] `PipelineRunner` accepts a generic config type.
- [ ] Build passes with zero TypeScript errors.
- [ ] All existing tests pass.
- [ ] `PROJECT.md` is updated with cleanup notes.

---

## Sprint 5: Automated Pipeline Execution and Agent Visibility

**Instruction File:** `sprints/sprint-5-visibility/instructions.md`

**Objective:** Convert the Tip Router from a manual button-per-stage flow into a fully automated pipeline with rich real-time visibility into every agent action, prompt, and routing decision. Remove all emojis. Use Lucide icons exclusively.

---

### 5.1 Automated Pipeline Execution

**Current state:** `TipInput.tsx` has 5 manual phases. The user clicks "Start Investigation," then "Start Research," etc.

**Target state:** One "Run Investigation" button. After that, the pipeline executes autonomously through all stages. The user watches progress but does not click to advance.

**Implementation:**

**Modify `src/ui/components/TipInput.tsx`:**
- Replace the 5-phase card stack with a single "Run Investigation" trigger.
- On click, instantiate `PipelineRunner` (from Sprint 2) with workbench stages and call `runner.execute()`.
- The runner executes `decompose` → `research` → `synthesize` → `audit` → (`rewrite` → `audit` loop if needed) → `assemble` automatically.
- The UI subscribes to runner events (`onStageStart`, `onStageComplete`, `onStageError`) to update the visualization.
- Add a "Pause" button that calls `runner.pause()` (holds at the next stage boundary).
- Add a "Resume" button that calls `runner.runFromStage(currentStageId)`.
- Add a "Cancel" button that calls `runner.abort()` (from Sprint 3).

**Modify `src/workbench/lib/pipeline.ts`:**
- Add `execute()` method that runs stages sequentially via `getNextStage()` until no next stage exists.
- Add `pause()` method that sets a flag. The runner checks this flag between stages and stops if set.
- Add event emitters: `on('stageStart')`, `on('stageComplete')`, `on('stageError')`, `on('loopBack')`.
- The `loopBack` event fires when `getNextStage()` routes backward (e.g., audit → rewrite).

---

### 5.2 Pipeline Visualizer

**New component:** `src/ui/components/PipelineVisualizer.tsx`

A horizontal or vertical stage diagram showing every stage in the pipeline. Each stage is a node. Nodes are connected by arrows.

**Stage nodes:**
- **Idle:** Gray outline, Lucide `Circle` icon
- **Running:** Orange fill, pulsing, Lucide `Loader2` icon (spinning)
- **Completed:** Green fill, Lucide `CheckCircle` icon
- **Failed:** Red fill, Lucide `XCircle` icon
- **Loop back:** A curved arrow returning to an earlier stage, Lucide `RotateCcw` icon

**For the audit loop:**
- Show `audit` node running
- If rejected, draw a curved arrow from `audit` back to `rewrite`
- Show `rewrite` node running
- Then arrow forward to `audit` again
- Label the loop iteration count next to the curved arrow: "Iteration 2"

**For parallel research:**
- Show `research` as a parent node
- Expand into sub-nodes per sub-claim (e.g., "Sub-claim 1: Web", "Sub-claim 1: Wiki", "Sub-claim 2: Web", etc.)
- Each sub-node has its own status icon
- Sub-nodes collapse back into the parent when all complete

**Implementation:**
- Accept `stageRecords: StageRecord[]` as prop.
- Derive node states from `stageRecords`.
- For loop detection: if a stage completes and the next stage has a lower index or is `rewrite` following `audit`, render the curved back arrow.
- Use Framer Motion or CSS transitions for smooth state changes.

---

### 5.3 Prompt Inspector

**New component:** `src/ui/components/PromptInspector.tsx`

A slide-out panel or bottom drawer that shows the exact prompt sent to every agent.

**Features:**
- List of all agent calls in chronological order
- Each entry shows: agent name, timestamp, model used, token count (if available)
- Expandable to show the full prompt text
- Expandable to show the full response text
- Filter by agent type (Decomposer, WebResearcher, Auditor, etc.)
- Search within prompts

**Data source:**
- Every AgentFn returns `AgentOutput.prompt` (the exact prompt string sent to the LLM).
- The runner collects these into a `promptLog: PromptLogEntry[]` array stored in session state.
- `PromptLogEntry` type:
  ```typescript
  interface PromptLogEntry {
    id: string;
    timestamp: string;
    stageId: string;
    agentName: string;
    model: string;
    prompt: string;
    response: string;
    tokensIn?: number;
    tokensOut?: number;
  }
  ```

**Implementation:**
- Modify `PipelineRunner` to append `AgentOutput.prompt` and the response text to `promptLog` after each stage completes.
- Store `promptLog` in IndexedDB under the session ID.
- The Prompt Inspector reads from IndexedDB and renders the list.

---

### 5.4 Agent Registry and Status Dashboard

**New component:** `src/ui/components/AgentDashboard.tsx`

A live dashboard showing all available agents and what they are doing right now.

**Layout:** A grid or list of agent cards.

**Each agent card shows:**
- Agent name (e.g., "TipDecomposer", "WebResearcher", "EvidenceAuditor")
- Lucide icon representing the agent's role:
  - Decomposer: `GitBranch`
  - WebResearcher: `Globe`
  - WikiQuerier: `BookOpen`
  - Synthesizer: `Combine`
  - MechanicalValidator: `Gauge`
  - EvidenceAuditor: `Scale`
  - EvidenceWriter: `Pencil`
  - ReportAssembler: `FileText`
  - Ingestor: `Database`
  - Querier: `Search`
  - Linter: `Stethoscope`
- Current status: Idle / Running / Completed / Failed
- If running: elapsed time, progress bar, current sub-task description
- If completed: timestamp, output summary (e.g., "5 sub-claims generated")
- If failed: error message, retry button

**Data source:**
- The `PipelineRunner` maintains an `agentStatuses: Map<string, AgentStatus>` map.
- Each agent reports its status via `onUpdate` callbacks.
- The dashboard polls or subscribes to this map.

**Implementation:**
- Create `src/workbench/lib/agentRegistry.ts` that defines all available agents with metadata:
  ```typescript
  interface AgentRegistryEntry {
    id: string;
    name: string;
    description: string;
    icon: string; // Lucide icon name
    stageId: string;
  }
  ```
- The dashboard renders one card per registry entry and overlays live status from the runner.

---

### 5.5 Emoji-to-Lucide Migration

**Current emojis to replace:**

| Emoji | Context | Lucide Replacement |
|---|---|---|
| ⚠️ | Contradiction marker | `AlertTriangle` |
| 🔍 | Gap marker | `Search` |
| ✅ | Success / approved | `CheckCircle` |
| ❌ | Failure / rejected | `XCircle` |
| 📄 | Document | `FileText` |
| 🔗 | Link / citation | `Link` |
| 🔄 | Rewrite / loop | `RotateCcw` |
| ⏳ | Loading / waiting | `Clock` |
| 📝 | Writing | `Pencil` |
| 🔎 | Research | `Search` |

**Files to modify:**
- `src/workbench/tiprouter/reportAssembler.ts` — replace emoji markers in markdown output with text labels
- `src/workbench/predigestor/linter.ts` — replace emoji in lint issue severity
- `src/workbench/predigestor/compounder.ts` — replace contradiction flag emoji
- `src/ui/components/WikiLint.tsx` — render Lucide icons instead of emoji
- `src/ui/components/EvidenceMemo.tsx` — render Lucide icons for contradiction and gap markers
- `src/ui/components/TipInput.tsx` — replace any status emoji with Lucide icons
- `src/ui/components/ResearchMonitor.tsx` — replace status emoji with Lucide icons

**Note on markdown output:** The evidence memo is markdown. Markdown cannot contain React components. For the memo, use text labels instead of emojis:
- `**[CONTRADICTION]**` instead of ⚠️
- `**[GAP]**` instead of 🔍
- `**[APPROVED]**` instead of ✅

The UI components that render the memo can then map these labels to Lucide icons.

---

### 5.6 Updated Workbench View Layout

**Target layout for `TipInput.tsx` / `Workbench.tsx`:**

```
+----------------------------------------------------------+
|  AI Investigative Workbench          [Run] [Pause] [Cancel] |
+----------------------------------------------------------+
|                                                          |
|  +------------------+  +-------------------------------+ |
|  | Pipeline         |  | Agent Dashboard               | |
|  | Visualizer       |  |                               | |
|  |                  |  | [GitBranch] Decomposer        | |
|  | [O]→[O]→[O]→[↻] |  |   Idle · 5 sub-claims         | |
|  |                  |  |                               | |
|  | (horizontal or   |  | [Globe] WebResearcher         | |
|  |  vertical flow)  |  |   Running · 2/5 complete      | |
|  |                  |  |   [=========>     ]           | |
|  +------------------+  +-------------------------------+ |
|                                                          |
|  +----------------------------------------------------+ |
|  | Reasoning Stream                                   | |
|  | -------------------------------------------------- | |
|  | [14:32:01] Decomposer: Analyzing tip...            | |
|  | [14:32:03] Decomposer: Identified 5 sub-claims     | |
|  | [14:32:04] WebResearcher: Querying Brave for...    | |
|  | ...                                                | |
|  +----------------------------------------------------+ |
|                                                          |
|  [View Prompts]  [View Intermediate Files]               |
|                                                          |
|  +----------------------------------------------------+ |
|  | Evidence Memo (appears after assembly)              | |
|  | ...                                                | |
|  +----------------------------------------------------+ |
|                                                          |
+----------------------------------------------------------+
```

**Key interactions:**
- Clicking a stage node in the Pipeline Visualizer opens the Prompt Inspector filtered to that stage.
- Clicking an agent card in the Agent Dashboard opens the Prompt Inspector filtered to that agent.
- Clicking "View Prompts" opens the full Prompt Inspector.
- Clicking "View Intermediate Files" opens `IntermediateFiles.tsx`.

---

### Files to Create

- `src/ui/components/PipelineVisualizer.tsx`
- `src/ui/components/PromptInspector.tsx`
- `src/ui/components/AgentDashboard.tsx`
- `src/workbench/lib/agentRegistry.ts`
- `src/workbench/types/promptLog.ts`

### Files to Modify

- `src/ui/components/TipInput.tsx` — automated execution, new layout
- `src/ui/components/Workbench.tsx` — layout shell
- `src/ui/components/ResearchMonitor.tsx` — Lucide icons, status integration
- `src/ui/components/EvidenceMemo.tsx` — Lucide icons for contradiction/gap markers
- `src/ui/components/WikiLint.tsx` — Lucide icons for severity
- `src/workbench/lib/pipeline.ts` — `execute()`, `pause()`, event emitters, prompt log collection
- `src/workbench/tiprouter/reportAssembler.ts` — text labels instead of emojis
- `src/workbench/predigestor/compounder.ts` — text labels instead of emojis
- `src/workbench/predigestor/linter.ts` — text labels instead of emojis

---

### Acceptance Criteria

- [ ] User clicks "Run Investigation" once. The pipeline executes all stages automatically without further clicks.
- [ ] User can pause and resume the pipeline.
- [ ] User can cancel the pipeline at any time.
- [ ] Pipeline Visualizer shows all stages with correct status icons (Lucide, no emojis).
- [ ] Audit loop is visualized with curved back arrows and iteration count.
- [ ] Parallel research sub-claims are visible as expandable sub-nodes.
- [ ] Prompt Inspector shows every prompt and response with timestamps.
- [ ] Agent Dashboard shows all agents with correct Lucide icons and live status.
- [ ] Evidence Memo uses `[CONTRADICTION]` and `[GAP]` text labels instead of emojis.
- [ ] All UI components use Lucide icons exclusively. No emojis remain in the codebase.
- [ ] All existing tests pass.

---

## Sprint 6: README Documentation

**Instruction File:** `sprints/sprint-6-readme/instructions.md`

**Objective:** Write a comprehensive README that serves three audiences: casual visitors, mid-level developers, and senior developers.

**Structure:**

### Section 1: Introduction (Elevator Pitch)

A 3–4 sentence description of what the app is and why it exists. Written for anyone who lands on the repository. Include:
- What problem it solves (investigative journalism research acceleration)
- Who it is for (journalists, researchers, newsrooms)
- What makes it different (browser-only, agentic pipeline, LLM wiki for large documents)
- One-line tech stack summary

### Section 2: Functional Architecture (End-User Friendly)

A plain-English description of how the app works from a user's perspective. No code, no technical jargon. Include:
- The two modules (Tip Router and Document Pre-Digestor) and what each does
- How a typical investigation flows: enter a tip, the system researches it, audits the evidence, produces a memo
- How the wiki works: upload documents, query them, compound new documents over time
- What the human does versus what the system does
- A simple diagram or flow description

### Section 3: Agent Flow and Orchestration (Mid-Level Developer)

A step-by-step technical walkthrough of the pipeline. Enough detail for a developer with 2–3 years of experience to understand the flow without reading every file. Include:
- The stage sequence: decompose → research → synthesize → audit → rewrite → assemble
- How the audit gate works: mechanical validation first, then qualitative LLM audit
- How the rejection loop works: what triggers a rewrite, what the writer does, how many iterations are allowed
- How parallel research works: WebResearcher and WikiQuerier running simultaneously per sub-claim
- How stall recovery works: what happens when a sub-claim hits a rate limit
- How the Document Pre-Digestor works: three-layer architecture (raw sources, wiki, schema), three operations (ingest, query, lint)
- Key data structures passed between stages (`research_plan.json`, `external_evidence.json`, `synthesis.json`, `AuditResult`)
- The role of the `PipelineRunner` state machine

### Section 4: Technical Architecture (Senior Developer)

A deep-dive into the codebase. Enough detail for a senior developer to understand the full system by reading this section alone. Include:
- **Directory structure** with explanation of every top-level folder
- **Orchestration layer:** `PipelineRunner`, `AgentFn` interface, `AgentContext`, metadata-driven routing, `getNextStage()`, `runFromStage()`
- **LLM Adapter:** cross-provider abstraction, self-healing parameter fixes, model family detection
- **File Manager:** IndexedDB wrapper, namespacing by session and wiki ID
- **Agent architecture:** how agents are registered, how they report status, how `onUpdate` and `onReasoningChunk` work
- **Session management:** how state is persisted, how resume works, how the abort controller propagates
- **The two-layer audit pattern:** why mechanical validation runs before LLM audit, performance implications
- **Wiki architecture:** chunking strategy, citation anchors, compounding updates, the schema document pattern
- **Stall recovery:** round-based retry, per-sub-claim attempt caps, failure handling
- **Prompt logging:** how prompts are captured, stored, and displayed
- **UI architecture:** React component hierarchy, event subscription pattern, real-time streaming

### Section 5: Project Structure

A tree view of the repository with a one-line description of every folder and key file. Include:
- `src/workbench/lib/` — orchestration infrastructure
- `src/workbench/tiprouter/` — Tip Router agents
- `src/workbench/predigestor/` — Document Pre-Digestor agents
- `src/ui/components/` — React UI components
- `src/test/` — test suite
- `planning/` — FRD and implementation plans
- Root-level config files (`vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, etc.)

---

### Files to Create/Modify

- `README.md` (root) — full rewrite following the 5-section structure above

---

### Acceptance Criteria

- [ ] Section 1 is a compelling elevator pitch understandable by non-technical readers.
- [ ] Section 2 explains the user-facing flow without code.
- [ ] Section 3 explains the agent pipeline, audit loop, and parallel research clearly enough for a mid-level developer to implement a similar pattern.
- [ ] Section 4 explains the full technical architecture deeply enough for a senior developer to onboard without reading every file.
- [ ] Section 5 lists every folder and key file with accurate descriptions.
- [ ] No emojis in the README. Lucide icon names are used where UI elements are referenced.
- [ ] All external references (Karpathy gist, AI Newsroom repo) are accurate and linked.

---

## Reference

All implementation must align with the Functional Requirements Document located at `planning/FRD_AI_Investigative_Workbench.md`.

Reusable orchestration patterns (pipeline runner, AgentFn interface, LLM adapter, file manager) must be sourced from the AI Newsroom Web_version branch at `https://github.com/RuneL89/Ai-newsroom/tree/Web_version`.

When in doubt, default to the FRD. When the FRD is silent, default to reusing patterns from the AI Newsroom codebase.

---

*End of Improvement Implementation Plan.*
