# Sprint 5: Automated Pipeline Execution and Agent Visibility

**Objective:** Convert the Tip Router from a manual button-per-stage flow into a fully automated pipeline with rich real-time visibility into every agent action, prompt, and routing decision. Remove all emojis. Use Lucide icons exclusively.

---

## 5.1 Automated Pipeline Execution

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

## 5.2 Pipeline Visualizer

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

## 5.3 Prompt Inspector

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

## 5.4 Agent Registry and Status Dashboard

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

## 5.5 Emoji-to-Lucide Migration

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

## 5.6 Updated Workbench View Layout

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

## Files to Create

- `src/ui/components/PipelineVisualizer.tsx`
- `src/ui/components/PromptInspector.tsx`
- `src/ui/components/AgentDashboard.tsx`
- `src/workbench/lib/agentRegistry.ts`
- `src/workbench/types/promptLog.ts`

## Files to Modify

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

## Acceptance Criteria

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
