# AI Investigative Workbench

A browser-based research acceleration tool for investigative journalists and researchers. Enter a free-text tip and the system decomposes it into verifiable claims, researches each claim in parallel across web and local document sources, cross-references the evidence, audits its own work through a two-layer validation gate, and emits a source-attributed markdown memo. All processing happens in the browser using IndexedDB for storage and external LLM APIs for reasoning. Human review is required at every stage -- the system does not write finished articles or make editorial decisions.

Built with Vite, React, TypeScript, and Tailwind CSS. Orchestration patterns are adapted from the [AI Newsroom](https://github.com/RuneL89/Ai-newsroom/tree/Web_version) pipeline runner. Coding conventions follow the [Karpathy-inspired guidelines](AGENTS.md) in this repository.

---

## Functional Architecture

The workbench is organized around two independent modules that share a single browser storage layer.

### Tip Router

The Tip Router turns an unstructured lead into a structured evidence memo. A typical flow looks like this:

1. The journalist enters a tip -- a sentence or paragraph describing a potential story.
2. The system breaks the tip into 3--5 independently verifiable sub-claims, each phrased as a research question.
3. For every sub-claim, the system launches two research tasks simultaneously:
   - A web researcher searches the open web using Brave Search, fetches the top result pages, and extracts relevant passages.
   - A wiki querier searches the journalist's local document wiki (if one is selected) for relevant passages with citation anchors.
4. The system synthesizes all findings into a cross-referenced summary, flagging contradictions between sources and identifying evidence gaps.
5. A two-layer audit gate validates the synthesis. First, a mechanical validator checks source coverage and diversity using pure code. Then a qualitative LLM auditor evaluates logical consistency, evidentiary strength, counter-narrative coverage, and gap severity.
6. If either audit layer rejects the synthesis, an evidence writer patches the gaps and the synthesis re-enters audit. This loop repeats up to 5 times.
7. Once approved (or after the cap is reached), a report assembler formats everything into a markdown evidence memo with full source attribution.

The journalist reviews the memo, downloads it, and decides what to investigate next. The system never makes editorial decisions.

### Document Pre-Digestor

The Pre-Digestor turns large document stacks into a queryable LLM wiki. A typical flow looks like this:

1. The journalist uploads PDF, TXT, CSV, or MD files through a drag-and-drop interface.
2. The system chunks each document with citation anchors and stores the raw sources immutably.
3. An LLM generates a structured wiki from the chunks: an index page, entity pages, concept pages, findings pages, and a change log.
4. Uploading additional documents triggers compound mode: the system updates existing wiki pages rather than duplicating them, so the wiki grows denser over time.
5. The journalist queries the wiki in natural language. The system reads the index first, drills into the most relevant pages, and synthesizes a cited answer.
6. A lint agent periodically scans the wiki for contradictions, orphaned pages, stale claims, and missing cross-references.

### What the Human Does vs. What the System Does

| Human | System |
|---|---|
| Enters the initial tip | Decomposes the tip into sub-claims |
| Uploads documents | Chunks, indexes, and wikifies documents |
| Selects a wiki for cross-reference | Runs parallel web and wiki research |
| Reviews the evidence memo | Synthesizes, audits, and assembles the memo |
| Decides what to publish | Flags gaps and contradictions for human review |
| Configures API keys | Manages storage, retries, and stall recovery |

---

## Agent Flow and Orchestration

The Tip Router pipeline is a sequential stage machine with a massively parallel research phase.

### Stage Sequence

```
decompose -> research -> synthesize -> audit -> rewrite -> assemble
```

1. **Decomposer** (`decomposer.ts`) -- One LLM call. Takes raw tip text and returns a `ResearchPlan` with 3--5 `SubClaim` objects (each with `id`, `question`, `claim`). If JSON parsing fails, the system attempts markdown-code-block recovery. Fewer than 3 sub-claims is a hard error.

2. **Research** (`researchLoop.ts`) -- One `Promise.all` over all sub-claims. For each sub-claim, two tasks run concurrently via `Promise.allSettled`:
   - **WebResearcher** (`webResearcher.ts`) -- Calls Brave Search API via a CORS proxy, fetches the top 3 result pages, strips HTML, and feeds extracted text into an LLM prompt. Each passage becomes an `EvidenceFinding` with `sourceType: 'web'`.
   - **WikiQuerier** (`wikiQuerier.ts`) -- Reads the wiki index, drills into relevant pages, and synthesizes a cited answer. Packaged as an `EvidenceFinding` with `sourceType: 'document'` and a `citationAnchor`.

   A sub-claim is only marked `failed` if **both** sides return zero findings. Per-task errors are caught by `isRetryableError` and fed into a round-based stall recovery system (`researchStallRecovery.ts`). Up to 3 retry waves per sub-claim. After max waves, the sub-claim is marked `failed` and the pipeline continues.

3. **Synthesizer** (`synthesizer.ts`) -- One LLM call. Reads the research plan and all evidence, produces a `Synthesis` object with one `SynthesisEntry` per sub-claim. Each entry contains `supportingSources` (with verbatim passages), `contradictions` (flagged with `[CONTRADICTION]` markers), and `gaps` (flagged with `[GAP]` markers).

4. **Audit Gate** -- Two layers, run sequentially:
   - **Mechanical Validator** (`mechanicalValidator.ts`) -- Pure code, zero LLM calls. Checks: (a) every sub-claim has at least one supporting source, (b) every sub-claim draws from at least two distinct source refs, (c) every entry has required fields. Returns `passed: false` with concrete `issues[]` if any check fails.
   - **Qualitative Auditor** (`auditor.ts`) -- LLM call. Evaluates logical consistency, evidentiary strength, counter-narrative coverage, and gap severity. Returns an `EvidenceAudit` with `approval_status: APPROVED` or `REJECTED` and specific `rewriter_instructions`.

   If the mechanical validator fails, the qualitative auditor is **not** run. The issues are packaged as an `EvidenceAudit` and passed directly to the Evidence Writer.

5. **Evidence Writer** (`evidenceWriter.ts`) -- One LLM call. Receives the current synthesis and audit feedback. Instruction: *"Make minimal, targeted changes to address the feedback. Preserve all existing content that does not need changing."* Overwrites `synthesis/{tipId}.json` in IndexedDB.

6. **Rewrite Loop** -- After the Evidence Writer completes, the revised synthesis goes back to the Mechanical Validator. If mechanical passes, it proceeds to the Qualitative Auditor. If either gate rejects, the loop repeats. Max 5 iterations. After the cap, the pipeline returns the best-effort synthesis with warnings.

7. **Report Assembler** (`reportAssembler.ts`) -- Pure code, no LLM call. Loads the research plan, approved synthesis, and raw evidence from IndexedDB. Formats a markdown memo with: original tip, research questions, findings by sub-claim (supporting sources, contradictions, gaps), source attribution, and a confidence summary (`HIGH`, `MEDIUM`, `LOW`).

### Document Pre-Digestor Architecture

The Pre-Digestor uses a three-layer storage model:
- **Raw sources** -- Immutable original documents, chunked with citation anchors.
- **Wiki** -- LLM-maintained structured pages (index, entities, concepts, findings, log).
- **Schema** -- A markdown conventions document that all wiki agents follow.

Three operations are exposed:
- **Ingest** (`ingestor.ts`) -- First-document 6-step LLM sequence: source summary, index, entities, concepts, findings, log.
- **Compound** (`compounder.ts`) -- Merges subsequent documents into existing wiki pages. Uses `[CONTRADICTION]` markers to flag conflicts between new and existing sources.
- **Query** (`querier.ts`) -- Reads the index, drills into relevant pages, synthesizes cited answers.
- **Lint** (`linter.ts`) -- Scans for contradictions, orphans, stale claims, and missing cross-references.

### Key Data Structures

| File | Structure | Purpose |
|---|---|---|
| `research-plan/{tipId}.json` | `ResearchPlan` | Sub-claims generated by the Decomposer |
| `external-evidence/{tipId}.json` | `EvidenceFinding[]` | Web research results |
| `internal-evidence/{tipId}.json` | `EvidenceFinding[]` | Wiki research results |
| `synthesis/{tipId}.json` | `Synthesis` | Cross-referenced synthesis entries |
| `audit/{tipId}.json` | `EvidenceAudit` | Mechanical + qualitative audit results |
| `evidence_memo.md` | Markdown string | Final downloadable memo |

### PipelineRunner State Machine

The `PipelineRunner` (`pipeline.ts`) manages the entire stage sequence. It maintains a `PipelineState` object with:
- `status`: `idle`, `running`, `complete`, or `error`
- `stages`: an array of `StageRecord` objects with `status`, `iteration`, `reasoning`, `output`, `metadata`
- `currentDraft`: the accumulated output from the most recent stage
- `editorLoops`: count of audit rejection loops

Stage transitions are driven by a `getNextStage()` function. For the workbench, this is `getWorkbenchNextStage()` in `workbenchStages.ts`. The runner supports:
- `run()` -- Start from the initial stage and auto-advance.
- `pause()` -- Stop between stages, preserving state.
- `resume()` -- Continue from the paused stage via `runFromStage()`.
- `stop()` -- Abort the current stage via `AbortController`.
- `getPromptLog()` -- Retrieve all LLM prompts and responses for inspection.

---

## Technical Architecture

### Directory Structure

```
src/
├── ui/components/              # React UI components
│   ├── Workbench.tsx           # Main layout + tab navigation
│   ├── TipInput.tsx            # Tip entry, Run Investigation, pause/resume/cancel
│   ├── ResearchMonitor.tsx     # Live parallel task status with stall indicators
│   ├── PipelineVisualizer.tsx  # Visual stage flow diagram (Lucide icons)
│   ├── AgentDashboard.tsx      # Live agent status cards (Lucide icons)
│   ├── PromptInspector.tsx     # Slide-out drawer for prompt/response logs
│   ├── WikiSelector.tsx        # Wiki CRUD (create, select, delete)
│   ├── DocumentUploader.tsx    # Drag-and-drop file ingest + compound
│   ├── WikiQuery.tsx           # Natural-language wiki queries
│   ├── WikiLint.tsx            # Wiki health-check
│   ├── EvidenceMemo.tsx        # Memo viewer + download
│   ├── IntermediateFiles.tsx   # Pipeline output inspector
│   └── SettingsPanel.tsx       # LLM provider + Brave Search config
├── workbench/
│   ├── lib/                    # Orchestration infrastructure (reused from AI Newsroom)
│   │   ├── pipeline.ts         # PipelineRunner: stage machine, retry, topic loops, pause/resume
│   │   ├── pipelineTypes.ts    # AgentFn, AgentContext, AgentOutput, PipelineState, StageRecord
│   │   ├── pipelineService.ts  # Active pipeline tracking
│   │   ├── pipelineNotifications.ts # Browser notifications (inactive-tab only)
│   │   ├── llmAdapter.ts       # Cross-provider LLM abstraction with adaptive retry
│   │   ├── apiConfig.ts        # LLM callers, Brave Search, localStorage I/O
│   │   ├── fileManager.ts      # Generic IndexedDB wrappers (dbGet, dbSet, dbDelete, dbKeys)
│   │   ├── sessionConfig.ts    # Minimal SessionConfig base interface
│   │   ├── workbenchAgentContext.ts # WorkbenchAgentContext, checkAborted, buildAgentOutput
│   │   ├── workbenchStages.ts  # Stage definitions + getWorkbenchNextStage routing
│   │   ├── workbenchAgentMap.ts # Stage ID to AgentFn mapping
│   │   ├── researchStallRecovery.ts # Round-based stall retry logic
│   │   └── agentRegistry.ts    # Agent metadata for dashboard and visualizer
│   ├── tiprouter/              # Tip Router agents
│   │   ├── decomposer.ts       # Tip -> ResearchPlan
│   │   ├── webResearcher.ts    # Brave Search + page extraction
│   │   ├── wikiQuerier.ts      # Local wiki evidence queries
│   │   ├── researchLoop.ts     # Parallel loop coordinator
│   │   ├── synthesizer.ts      # Cross-reference synthesis
│   │   ├── mechanicalValidator.ts # Fast code validation gate
│   │   ├── auditor.ts          # Qualitative LLM audit
│   │   ├── evidenceWriter.ts   # Synthesis patching
│   │   └── reportAssembler.ts  # Pure-code markdown memo generation
│   ├── predigestor/            # Document Pre-Digestor agents
│   │   ├── chunker.ts          # Document chunking with citation anchors
│   │   ├── schema.ts           # Wiki storage layer (namespaced by wikiId)
│   │   ├── rawSources.ts       # Immutable raw source storage
│   │   ├── ingestor.ts         # First-document 6-step ingest
│   │   ├── compounder.ts       # Multi-document compound ingest
│   │   ├── querier.ts          # Wiki query agent
│   │   ├── linter.ts           # Wiki lint agent
│   │   ├── wikiStore.ts        # Manifest-based wiki CRUD
│   │   └── schema.md           # Wiki structure conventions (loaded via ?raw)
│   ├── session.ts              # Unified session manager
│   ├── config.ts               # Default config (merges localStorage + env)
│   ├── types.ts                # Workbench-specific types
│   └── types-shared.ts         # Shared types: ApiProvider, ApiConfig, AppApiConfig
├── test/                       # Sprint verification tests
│   ├── sprint1-verification.ts
│   ├── sprint2-verification.ts
│   ├── sprint3-verification.ts
│   ├── sprint4-verification.ts
│   ├── sprint5-verification.ts
│   ├── sprint6-verification.ts
│   ├── sprint1-agentfn-verification.ts
│   ├── sprint2-runner-verification.ts
│   ├── sprint3-recovery-verification.ts
│   ├── sprint4-cleanup-verification.ts
│   └── sprint5-visibility-verification.ts
├── App.tsx                     # Root component (config loader + settings)
├── main.tsx                    # React entry point
└── index.css                   # Tailwind base styles
```

### Orchestration Layer

**AgentFn Interface.** Every agent implements `AgentFn` from `pipelineTypes.ts`:

```typescript
type AgentFn = (
  ctx: AgentContext,
  onReasoningChunk: (chunk: string) => void,
  onUpdate?: (partial: Partial<AgentOutput>) => void
) => Promise<AgentOutput>;
```

`AgentContext` carries `sessionConfig`, `currentDraft`, `iteration`, `segmentLoopIndex`, and `feedback`. `onReasoningChunk` streams reasoning tokens to the UI in real time. `onUpdate` pushes partial outputs (useful for long-running agents like the web researcher).

**PipelineRunner.** The runner is generic over config type (`PipelineRunner<T>`) so it can serve both the newsroom and the workbench without modification. It accepts:
- `stageDefinitions` -- array of stage metadata (id, name, icon)
- `getNextStage` -- routing function returning the next `StageId` or `'COMPLETE'`
- `initialStageId` -- where `run()` starts
- `stageOrder` -- defines reset boundaries for `runFromStage()`
- `enableTopicLoop` -- whether to run the parallel topic loop (newsroom only)
- `contextBuilder` -- custom `AgentContext` factory for workbench fields

**Metadata-driven routing.** The `getNextStage` function receives the current stage's `metadata` and `draft`. For the workbench, `getWorkbenchNextStage` uses a `switch` on `current` plus `metadata.audit.approval_status` to decide whether to loop back to `rewrite` or proceed to `assemble`.

**Resume.** `runFromStage()` takes an existing `PipelineState`, resets stages at or after the start position (preserving prior outputs), and continues execution. This is how `handleResume()` in `TipInput.tsx` works after a pause.

### LLM Adapter

`llmAdapter.ts` provides a cross-provider abstraction over OpenAI, Anthropic, Gemini, OpenRouter, and custom endpoints. Key features:
- **Body normalization** -- Converts provider-specific request shapes into a common format and back.
- **Self-healing parameter fixes** -- Catches `400` errors for unsupported parameters (e.g., `top_p` on Ollama), removes the offending parameter, and retries.
- **Model family detection** -- Detects provider from model name prefixes (`gpt-`, `claude-`, `gemini-`, etc.) to apply correct normalization rules.
- **Adaptive retry** -- `fetchWithAdaptiveRetry` backs off exponentially on `429` / rate-limit errors, with per-attempt delays. Abort signals are respected: `AbortError` is re-thrown as `'Pipeline aborted by user'`.

### File Manager

`fileManager.ts` is a minimal wrapper around IndexedDB. It exposes four generic operations:
- `dbSet(namespace, key, value)` -- write JSON-serializable value
- `dbGet(namespace, key)` -- read value
- `dbDelete(namespace, key)` -- delete value
- `dbKeys(namespace)` -- list all keys in a namespace

Namespaces are dot-separated strings like `research-plan.{tipId}` or `wiki.{wikiId}.pages`. This design replaces the newsroom's segment-specific functions with a fully generic key-value store.

### Agent Architecture

All 12 workbench agents are registered in `workbenchAgentMap.ts`:
- Tip Router: `decompose`, `research`, `synthesize`, `audit`, `rewrite`, `assemble`
- Pre-Digestor: `ingest`, `query`, `lint`

Each agent receives a `WorkbenchAgentContext` (extends `AgentContext` with `tipText`, `tipId`, `wikiId`, `subClaims`, etc.). Agents report status through:
- `emitReasoning(chunk)` -- streams reasoning to the UI
- `checkAborted(ctx)` -- throws if the abort signal is set
- `buildAgentOutput(draft, reasoning, metadata, prompt)` -- builds a standard `AgentOutput`

The `PromptInspector` component reads from `runner.getPromptLog()`, which is populated in `PipelineRunner.executeStage()` after each successful agent call. The log contains the full prompt text and the agent's draft response.

### Session Management

`session.ts` manages the active session. `SessionConfig` (from `sessionConfig.ts`) is a minimal interface: `{ apiConfig: ApiConfig; [key: string]: unknown }`. The workbench extends this with `WorkbenchSessionConfig` in `types.ts`.

State persistence:
- API keys and provider settings are stored in `localStorage`.
- Pipeline outputs (research plans, evidence, synthesis, audit) are stored in IndexedDB via `fileManager.ts`.
- Wiki pages are stored in IndexedDB under the `wiki.{wikiId}` namespace.

Resume works by:
1. The UI calls `runner.pause()` between stages.
2. The runner sets `status: 'idle'` and preserves all stage outputs.
3. The UI calls `runner.resume()` followed by `runner.runFromStage(currentStageId, sessionConfig, state)`.
4. The runner resets only the current and subsequent stages, keeping prior outputs intact.

Abort propagates via `AbortController`:
1. `TipInput.tsx` calls `runner.stop()`.
2. The runner aborts its `AbortController`.
3. `fetchWithAdaptiveRetry` catches the abort and throws `'Pipeline aborted by user'`.
4. `streamLLM` checks the signal in its read loop and cancels the reader.
5. All agents call `checkAborted(ctx)` before and during LLM calls.

### Two-Layer Audit Pattern

The audit gate is split into mechanical and qualitative layers for two reasons:
1. **Cost.** Mechanical validation is pure code and runs in milliseconds. Running an LLM audit on every synthesis is expensive; the mechanical gate filters out obvious failures first.
2. **Precision.** The mechanical validator catches deterministic issues (missing sources, single-source reliance) that an LLM might overlook. The qualitative auditor catches judgment issues (logical consistency, overstatement) that code cannot evaluate.

Performance implication: the average synthesis passes mechanical validation on the first try, so the LLM audit is only invoked for syntheses that are structurally sound.

### Wiki Architecture

**Chunking.** Documents are split into chunks of ~2000 characters with 200-character overlap. Each chunk gets a citation anchor (`[docName:chunkIndex]`).

**Citation anchors.** Every finding in the wiki references the original chunk via its anchor. When the Report Assembler builds the memo, it can trace any quote back to its source document and chunk.

**Compounding.** When a new document is uploaded, the compounder reads the existing wiki pages, merges new entities and concepts, and flags contradictions with `[CONTRADICTION]` markers. The schema document (`schema.md`) defines page formats so all wiki agents produce consistent output.

**Schema document pattern.** The wiki follows a strict markdown schema: index pages list all entities/concepts/findings; entity pages have a standard header format; findings pages link back to source documents. The schema is loaded as a raw markdown string and included in every wiki agent's system prompt.

### Stall Recovery

`researchStallRecovery.ts` implements round-based retry for the parallel research loop:
1. All sub-claims launch eagerly in parallel.
2. If a task hits a retryable error (`429`, `timeout`, `network`), it is marked `stalled`.
3. After all initial tasks settle, a wave-based retry re-launches all stalled tasks simultaneously.
4. This repeats up to `MAX_STALL_WAVES` (3) per sub-claim.
5. After max waves, the sub-claim is marked `failed` and the pipeline continues with partial results.

The `ResearchMonitor` component displays `stalled` tasks with a `Loader2` (Lucide) spinner and retry count.

### Prompt Logging

`PipelineRunner.executeStage()` appends to `promptLog` after each successful agent execution:

```typescript
this.promptLog.push({
  id: `${stageId}-${Date.now()}`,
  timestamp: new Date().toISOString(),
  stageId,
  agentName: stageDef?.name || stageId,
  prompt: result.prompt,
  response: result.draft,
});
```

The `PromptInspector` component reads this log from `runner.getPromptLog()` and renders it as an expandable list with search and stage filtering. Agents that do not set `prompt` in their `AgentOutput` will have empty prompt entries.

### UI Architecture

The React component hierarchy is flat: `App.tsx` renders `Workbench.tsx`, which renders tab panels (`TipInput`, `WikiQuery`, `WikiLint`, etc.).

Event subscription pattern:
1. `TipInput.tsx` creates a `PipelineRunner` and passes an `onStateChange` callback.
2. The runner calls `onStateChange` after every stage transition.
3. `TipInput.tsx` updates local React state (`runnerState`), which triggers re-renders of `PipelineVisualizer`, `AgentDashboard`, and `ResearchMonitor`.

Real-time streaming:
1. Agents call `onReasoningChunk(chunk)` as LLM tokens arrive.
2. The runner updates the stage's `reasoning` field in `PipelineState`.
3. `onStateChange` fires, and `AgentDashboard` displays the latest reasoning snippet for running agents.

---

## Project Structure

```
Graver-AI_prototype/
├── demo/                          # Pre-written demo data
│   ├── sample-document.md         # Sample FOIA document for wiki ingest
│   └── sample-tip.txt             # Sample investigative tip
├── dist/                          # Vite production build output
├── planning/                      # Requirements and implementation plans
│   ├── FRD_AI_Investigative_Workbench.md
│   ├── IMPLEMENTATION_PLAN_AI_Investigative_Workbench.md
│   ├── SPRINT_INSTRUCTIONS.md
│   └── sprints/                   # Per-sprint instruction files
│       ├── sprint-1-agentfn/
│       ├── sprint-2-runner/
│       ├── sprint-3-recovery/
│       ├── sprint-4-cleanup/
│       ├── sprint-5-visibility/
│       └── sprint-6-readme/
├── public/                        # Static assets (PDF worker for document parsing)
├── scripts/                       # Standalone utility scripts
│   └── run-hello-world-node.ts
├── src/
│   ├── ui/components/             # React components (see tree above)
│   ├── workbench/                 # Agent logic and orchestration
│   │   ├── lib/                   # Reused infrastructure + workbench-specific helpers
│   │   ├── predigestor/           # Document Pre-Digestor agents
│   │   └── tiprouter/             # Tip Router agents
│   ├── test/                      # Sprint verification tests
│   ├── App.tsx                    # Root component
│   ├── main.tsx                   # React entry point
│   └── index.css                  # Tailwind base styles
├── .env                           # Environment variable template
├── .gitignore
├── AGENTS.md                      # Karpathy-inspired coding guidelines
├── IMPROVEMENT_IMPLEMENTATION_PLAN.md
├── index.html                     # Vite HTML entry
├── package.json
├── postcss.config.js
├── PROJECT.md                     # File reuse mapping (newsroom -> workbench)
├── README.md                      # This file
├── tailwind.config.js
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

---

## Setup

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Build

```bash
npm run build
```

### Dev Server

```bash
npm run dev
```

### Configure API Keys

Click the **SettingsPanel** (gear icon, `Settings` Lucide icon) in the app header to configure:

- **LLM Provider** -- OpenAI, Anthropic, Gemini, OpenRouter, or Custom
- **LLM API Key** -- your provider key
- **Brave Search API Key** -- get one free at [api.search.brave.com](https://api.search.brave.com)

Settings are persisted to `localStorage`. Environment variables (`VITE_OPENAI_API_KEY`, `VITE_OPENAI_MODEL`) pre-populate defaults.

---

## Demo

Pre-written demo data lives in `demo/`:

1. Start the dev server: `npm run dev`
2. Click **Load Demo Tip** in the Tip Router panel (uses `BookOpen` Lucide icon)
3. Click **Run Investigation** (uses `Play` Lucide icon) to execute the full pipeline
4. The **PipelineVisualizer** shows stage progress with `CheckCircle`, `Loader2`, and `RotateCcw` icons
5. The **AgentDashboard** displays live agent cards with reasoning snippets
6. The **PromptInspector** (slide-out drawer) lists every LLM prompt and response
7. Once complete, review the evidence memo and download it

For a richer demo, first create a wiki and upload `demo/sample-document.md`, then run the Tip Router.

---

## Verification

Run the sprint verification tests:

```bash
npx tsx src/test/sprint1-verification.ts
npx tsx src/test/sprint2-verification.ts
npx tsx src/test/sprint3-verification.ts
npx tsx src/test/sprint4-verification.ts
npx tsx src/test/sprint5-verification.ts
npx tsx src/test/sprint6-verification.ts
npx tsx src/test/sprint1-agentfn-verification.ts
npx tsx src/test/sprint2-runner-verification.ts
npx tsx src/test/sprint3-recovery-verification.ts
npx tsx src/test/sprint4-cleanup-verification.ts
npx tsx src/test/sprint5-visibility-verification.ts
```

Build check:

```bash
npx tsc --noEmit
```

---

## License

*(To be determined.)*
