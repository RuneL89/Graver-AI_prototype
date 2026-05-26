# AI Investigative Workbench

A standalone browser tool for investigative journalists. Drop in a tip and a document stack, and it decomposes the story into verifiable claims, researches each in parallel across web and document sources, cross-references the evidence, audits its own work, and emits a source-attributed markdown memo. Human review is required — it does not write finished articles or make editorial decisions.

---

## What It Does

**For the journalist with a tip and a pile of documents.**

The workbench turns an unstructured lead into a structured evidence memo through two independent modules that share a single browser storage layer:

| Module | Solves | Output |
|---|---|---|
| **Tip Router** | "I have a lead — what do I need to verify, and what evidence exists?" | `evidence_memo.md` with full attribution |
| **Document Pre-Digestor** | "I have 500 pages of source material — how do I query it without reading every page?" | A queryable LLM wiki with citation anchors |

**The Tip Router** decomposes a free-text tip into 3–5 verifiable sub-claims, launches parallel web and wiki research for each, synthesizes the findings, runs a two-layer audit (mechanical + qualitative), and assembles a markdown memo. If the audit rejects the synthesis, an automatic rewrite loop patches gaps and retries — up to 5 iterations.

**The Document Pre-Digestor** ingests PDF, TXT, CSV, and MD files into an immutable raw-source store, chunks them with citation anchors, and compiles an LLM-maintained wiki (entities, concepts, findings, sources). Uploading a second document updates existing wiki pages rather than duplicating them — the wiki grows denser, not just bigger. The journalist can query the wiki in natural language or run a health-check lint.

---

## Architecture

- **Runtime:** Browser-only SPA. No server, no backend, no deployment.
- **Build:** Vite + React + TypeScript + Tailwind CSS.
- **Storage:** IndexedDB for all files, session state, wiki persistence, and intermediate pipeline outputs.
- **External APIs:** LLM provider (OpenAI, Anthropic, Gemini, OpenRouter, or custom) for agent reasoning; Brave Search API for web research.
- **Orchestration:** Reuses the AI Newsroom pipeline runner and LLM adapter with minimal modification.

---

## Agent Orchestration

Two pipelines run through the same orchestration layer. Each agent is an `AgentFn` that reads state, calls an LLM, and writes structured output to IndexedDB.

### Tip Router Pipeline

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────────────────────────┐
│  Tip Input  │────▶│ Decomposer   │────▶│ research_plan.json                  │
└─────────────┘     │ (1 LLM call) │     │ 3–5 sub-claims with questions       │
                    └──────────────┘     └─────────────────────────────────────┘
                                                     │
                    ┌────────────────────────────────┘
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Parallel Research Loop                                │
│  ┌─────────────────┐    ┌─────────────────┐                                 │
│  │ WebResearcher   │    │ WikiQuerier     │                                 │
│  │ Brave Search +  │    │ Query local wiki│                                 │
│  │ page extraction │    │ (if selected)   │                                 │
│  └────────┬────────┘    └────────┬────────┘                                 │
│           │                      │                                          │
│           ▼                      ▼                                          │
│  external_evidence.json    internal_evidence.json                           │
└─────────────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Synthesis & Audit Gate                               │
│                                                                             │
│  ┌─────────────┐     ┌──────────────────┐     ┌────────────────────────┐   │
│  │ Synthesizer │────▶│ Mechanical       │────▶│ Qualitative Auditor    │   │
│  │ (LLM)       │     │ Validator (code) │     │ (LLM)                  │   │
│  └─────────────┘     └──────────────────┘     └──────────┬─────────────┘   │
│                                                          │                  │
│                              ┌───────────────────────────┘                  │
│                              │ REJECTED                                    │
│                              ▼                                              │
│                        ┌─────────────┐     ┌────────────────────────┐      │
│                        │ Evidence    │────▶│ Re-audit (max 5 loops) │      │
│                        │ Writer      │     └────────────────────────┘      │
│                        │ (LLM patch) │                                       │
│                        └─────────────┘                                       │
│                              │ APPROVED                                     │
│                              ▼                                               │
│                        ┌────────────────────────┐                           │
│                        │ Report Assembler       │                           │
│                        │ Pure-code markdown gen │                           │
│                        └──────────┬─────────────┘                           │
│                                   │                                         │
│                                   ▼                                         │
│                        evidence_memo.md (downloadable)                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

The pipeline is sequential at the macro level, but the research phase is massively parallel. Below is a step-by-step breakdown of what each agent does, what data it reads and writes, and — critically — what causes a rejection and triggers the rewrite loop.

---

#### Step 1: Decomposer

**What it does.** The Decomposer takes the journalist's free-text tip and breaks it into 3–5 independently verifiable sub-claims. It does this in a single LLM call with a strict JSON schema: each sub-claim must have a `question` (what needs to be verified) and a `claim` (what the tip alleges). The prompt instructs the model to cover different angles — people, organizations, events, financials — so the research is multidimensional.

**Input.** Raw tip text from the UI.

**Output.** `research-plan/{tipId}.json` — a `ResearchPlan` containing an array of `SubClaim` objects, each with a generated ID.

**Failure mode.** This step does not have a "rejection" gate. If the LLM returns malformed JSON, the parser attempts markdown-code-block recovery. If that fails, or if fewer than 3 sub-claims are produced, the step throws a hard error and the pipeline stops. There is no loop here — the journalist must re-submit or fix the tip.

---

#### Step 2: Parallel Research Loop

**What it does.** For every sub-claim in the research plan, the loop launches two research tasks simultaneously via `Promise.allSettled`:

- **WebResearcher** (`webResearcher.ts`) — Calls the Brave Search API (via a CORS proxy) with the sub-claim's question, retrieves up to 5 search results, fetches the top 3 pages, strips HTML tags and scripts, and feeds the extracted text into an LLM prompt that extracts relevant passages, summaries, and confidence scores. Each extracted passage becomes an `EvidenceFinding` tagged `sourceType: 'web'`.
- **WikiQuerier** (`wikiQuerier.ts`) — If the journalist has selected a wiki, this agent routes the sub-claim's question through the Document Pre-Digestor's query engine. The querier reads the wiki index, drills into the most relevant pages, and synthesizes a cited answer. The answer is packaged as a single `EvidenceFinding` tagged `sourceType: 'document'` with a `citationAnchor` pointing to the wiki pages read.

**Parallelism model.** Each sub-claim gets its own pair of concurrent tasks. All sub-claims run in parallel too — the outer loop is `Promise.all(tasks)`. A web failure does not block the wiki query, and vice versa.

**Per-task failure model.** A task is only marked `failed` if **both** the web and wiki research return zero findings. If one side succeeds and the other fails, the task is `completed` with a partial result. This is intentional — the journalist still gets whatever evidence was found.

**Output.** Two IndexedDB entries:
- `external-evidence/{tipId}.json` — all `EvidenceFinding[]` from the web
- `internal-evidence/{tipId}.json` — all `EvidenceFinding[]` from the wiki

**No rejection criteria at this stage.** The loop collects everything it can and moves on.

---

#### Step 3: Synthesizer

**What it does.** The Synthesizer reads the entire research plan and all evidence (external + internal) and performs a single LLM cross-reference. For each sub-claim, it produces a `SynthesisEntry` containing:
- `supportingSources` — an array of sources that corroborate the claim, with verbatim passages
- `contradictions` — an array of `{between: [sourceA, sourceB], description}` when sources conflict
- `gaps` — an array of actionable missing-evidence strings (e.g., "Need financial records for 2023")

**Input.** `research-plan/{tipId}.json`, `external-evidence/{tipId}.json`, `internal-evidence/{tipId}.json`

**Output.** `synthesis/{tipId}.json` — a `Synthesis` object with one `SynthesisEntry` per sub-claim.

**No rejection criteria at this stage.** The Synthesizer always produces an output, even if the evidence is thin. The quality gates come next.

---

#### Step 4: Mechanical Validator

**What it does.** This is a pure-code validation gate — zero LLM calls, zero cost. It runs a series of deterministic checks on every `SynthesisEntry`.

**Checks performed:**
1. **Source coverage** — Every sub-claim must have at least one `supportingSource`. A claim with zero sources is a dead end.
2. **Source diversity** — Every sub-claim must draw from at least two distinct source refs. This prevents the pipeline from over-relying on a single article or document.
3. **Field completeness** — Every entry must have a `subClaimId`. Every `supportingSource` must have a `ref` and a `passage`. Missing fields indicate a malformed synthesis.

**Rejection criteria.** If any check fails, the validator returns `passed: false` plus a concrete `issues[]` array (e.g., `"Sub-claim sc-123 relies on a single source (https://example.com)"`).

**What happens on rejection.** The issues are packaged into an `EvidenceAudit` with `approval_status: REJECTED` and `rewriter_instructions` that tell the Evidence Writer exactly what to fix. The pipeline enters the rewrite loop immediately — the Qualitative Auditor is **not** run until mechanical validation passes.

---

#### Step 5: Qualitative Auditor

**What it does.** Once the synthesis passes mechanical validation, an LLM performs a qualitative audit on four criteria:

1. **Logical consistency** — Do the supporting sources actually support the claims, or are they tangentially related?
2. **Evidentiary strength** — Are high-confidence sources used where possible? Is weak evidence being overstated?
3. **Counter-narrative coverage** — Are contradictions acknowledged and explained, or are they buried?
4. **Gap severity** — Are the identified gaps reasonable and actionable, or are they so broad as to be useless?

**Input.** `synthesis/{tipId}.json`

**Output.** An `EvidenceAudit` object with:
- `approval_status`: `"APPROVED"` or `"REJECTED"`
- `qualitative_pass`: `true` or `false`
- `rewriter_instructions`: specific, actionable feedback (e.g., "Add a source that confirms the 2022 acquisition date" or "Resolve the contradiction between the SEC filing and the interview transcript")

**Rejection criteria.** The auditor returns `REJECTED` if any of the four criteria is not met. Unlike the mechanical validator, this is a judgment call made by the LLM. The instructions must be concrete enough for the Evidence Writer to act on.

**What happens on rejection.** The audit object (with its `rewriter_instructions`) is passed to the Evidence Writer, and the pipeline enters the rewrite loop.

---

#### Step 6: Evidence Writer (Rewrite Loop)

**What it does.** The Evidence Writer receives the current synthesis and the audit feedback (from either the Mechanical Validator or the Qualitative Auditor). It performs a targeted rewrite via a single LLM call with the instruction: *"Make minimal, targeted changes to address the feedback. Preserve all existing content that does not need changing."*

**Loop mechanics.** After the rewrite:
1. The revised synthesis overwrites `synthesis/{tipId}.json` in IndexedDB.
2. The revised synthesis goes **back to Step 4** (Mechanical Validator).
3. If mechanical passes, it proceeds to Step 5 (Qualitative Auditor).
4. If either gate rejects, the loop repeats.

**Iteration cap.** The loop runs a maximum of **5 iterations**. After the 5th iteration:
- If the synthesis was never approved, the pipeline returns the best-effort synthesis with a warning.
- The journalist sees the memo anyway, but with flags indicating which claims failed validation.

**What triggers the loop.** Two events:
- Mechanical Validator rejection (source coverage, diversity, or field errors)
- Qualitative Auditor rejection (logical, evidentiary, coverage, or gap issues)

**What the loop does not do.** It does not re-run research. The Evidence Writer can only rearrange, reclassify, or re-explain the evidence already collected. If the research phase was genuinely thin, the loop will eventually hit the 5-iteration cap and surface the gaps to the journalist.

---

#### Step 7: Report Assembler

**What it does.** Once the synthesis is approved (or the cap is hit), the Report Assembler builds the final markdown memo. This is pure code — no LLM call. It loads the research plan, the approved synthesis, and all raw evidence from IndexedDB, then formats them into a structured markdown document.

**Sections in the memo:**
1. **Original Tip** — the starting text
2. **Research Questions** — each sub-claim with its question and claim statement
3. **Findings by Sub-Claim** — for each sub-claim:
   - Supporting sources with verbatim passages (truncated to 300 chars in the memo)
   - Contradictions (flagged with ⚠️)
   - Gaps (flagged with 🔍)
4. **Source Attribution** — a deduplicated list of all web URLs and document references
5. **Confidence Summary** — per-claim confidence scored by pure-code rules:
   - `HIGH` — has supporting sources AND zero contradictions
   - `MEDIUM` — has supporting sources BUT has contradictions
   - `LOW` — no supporting sources

**Input.** `research-plan/{tipId}.json`, `synthesis/{tipId}.json`, `external-evidence/{tipId}.json`, `internal-evidence/{tipId}.json`

**Output.** `evidence_memo.md` — a downloadable markdown string, plus an `EvidenceMemo` object stored in memory for the UI.

**No rejection criteria.** This step is deterministic formatting. It always succeeds if the inputs exist.

---

### Rewrite Loop Summary

| Trigger | What happens | Max iterations |
|---|---|---|
| Mechanical Validator fails | Issues → Evidence Writer → re-validate mechanically | 5 |
| Qualitative Auditor rejects | Feedback → Evidence Writer → re-validate mechanically → re-audit qualitatively | 5 |
| Cap reached without approval | Return best-effort synthesis; memo is generated with warnings | — |

The loop only operates on the synthesis — it never re-runs the research phase. If the underlying evidence is insufficient, the loop will exhaust its iterations and surface the gaps explicitly in the final memo.

### Document Pre-Digestor Pipeline

```
┌─────────────────┐     ┌─────────────┐     ┌─────────────────────────────┐
│ File Upload     │────▶│ Chunker     │────▶│ sources/{doc}.md            │
│ (PDF/TXT/CSV/MD)│     │ (citation   │     │ entities/{name}.md          │
└─────────────────┘     │  anchors)   │     │ concepts/{theme}.md         │
                        └─────────────┘     │ findings/{claim}.md         │
                                            │ index.md                    │
                                            │ log.md                      │
                                            └─────────────────────────────┘
                                                              │
                                            ┌─────────────────┘
                                            ▼
                                    ┌───────────────┐
                                    │ Query / Lint  │
                                    │ (LLM agents)  │
                                    └───────────────┘
```

**Ingest** stores raw sources immutably, chunks documents, and runs a 6-step LLM sequence (source summary → index → entities → concepts → findings → log). **Compound** mode merges subsequent documents into existing pages rather than regenerating the wiki. **Query** reads the index first, drills into relevant pages, and synthesizes cited answers. **Lint** scans for contradictions, orphans, stale claims, and missing cross-references.

---

## Project Structure

```
src/
├── ui/components/          # React components
│   ├── Workbench.tsx       # Main orchestration UI + pipeline status
│   ├── TipInput.tsx        # Tip entry, decomposition, research trigger
│   ├── ResearchMonitor.tsx # Live parallel task status
│   ├── WikiSelector.tsx    # Wiki CRUD (create, select, delete)
│   ├── DocumentUploader.tsx# Drag-and-drop file ingest + compound
│   ├── WikiQuery.tsx       # Natural-language wiki queries
│   ├── WikiLint.tsx        # Wiki health-check
│   ├── EvidenceMemo.tsx    # Memo viewer + download
│   ├── IntermediateFiles.tsx# Pipeline output inspector
│   └── SettingsPanel.tsx   # LLM provider + Brave Search config
├── workbench/
│   ├── lib/                # Reused infrastructure from AI Newsroom
│   │   ├── pipeline.ts     # Parallel topic loop + stall recovery
│   │   ├── llmAdapter.ts   # Adaptive retry + body normalization
│   │   ├── apiConfig.ts    # LLM callers, Brave Search, localStorage I/O
│   │   ├── fileManager.ts  # IndexedDB wrapper
│   │   └── sessionConfig.ts# Session serialization
│   ├── predigestor/        # Document Pre-Digestor agents
│   │   ├── chunker.ts      # Document chunking with citation anchors
│   │   ├── schema.ts       # Wiki storage layer (namespaced by wikiId)
│   │   ├── rawSources.ts   # Immutable raw source storage
│   │   ├── ingestor.ts     # First-document 6-step ingest
│   │   ├── compounder.ts   # Multi-document compound ingest
│   │   ├── querier.ts      # Wiki query agent
│   │   ├── linter.ts       # Wiki lint agent
│   │   ├── wikiStore.ts    # Manifest-based wiki CRUD
│   │   └── schema.md       # Wiki structure + conventions (loaded via ?raw)
│   ├── tiprouter/          # Tip Router agents
│   │   ├── decomposer.ts   # Tip → sub-claims
│   │   ├── webResearcher.ts# Brave Search + extraction
│   │   ├── wikiQuerier.ts  # Local wiki evidence queries
│   │   ├── researchLoop.ts # Parallel loop coordinator
│   │   ├── synthesizer.ts  # Cross-reference synthesis
│   │   ├── mechanicalValidator.ts # Fast code validation
│   │   ├── auditor.ts      # Qualitative LLM audit
│   │   ├── evidenceWriter.ts# Synthesis patching
│   │   ├── synthesisLoop.ts# Orchestrate synthesis → audit → rewrite
│   │   └── reportAssembler.ts # Pure-code markdown memo generation
│   ├── session.ts          # Unified session manager + resume
│   ├── config.ts           # Default config (merges localStorage + env)
│   ├── types.ts            # Workbench-specific types
│   └── types-shared.ts     # Shared types (reused from AI Newsroom)
├── test/                   # Sprint verification tests
│   ├── sprint1-verification.ts
│   ├── sprint2-verification.ts
│   ├── sprint3-verification.ts
│   ├── sprint4-verification.ts
│   ├── sprint5-verification.ts
│   └── sprint6-verification.ts
└── App.tsx                 # Root component (config loader + settings)
```

---

## Setup

### Prerequisites

- Node.js 18+
- npm

### Build

```bash
npm install
npm run build
```

### Dev Server

```bash
npm run dev
```

### Configure API Keys

Click the **settings gear** in the app header to configure:

- **LLM Provider** — OpenAI, Anthropic, Gemini, OpenRouter, or Custom
- **LLM API Key** — your provider key
- **Brave Search API Key** — get one free at [api.search.brave.com](https://api.search.brave.com)

Settings are persisted to `localStorage`. Environment variables (`VITE_OPENAI_API_KEY`, `VITE_OPENAI_MODEL`) pre-populate defaults.

---

## Demo

Pre-written demo data lives in `demo/`:

```bash
npm run dev
```

1. Click **Load Demo Tip** in the Tip Router panel
2. **Decompose** → generates 3–5 research questions
3. **Run Research** → parallel web + wiki research
4. **Synthesize & Audit** → cross-reference and validate
5. **Generate Memo** → produce markdown evidence memo
6. **Download** → save for human review

For a richer demo, first create a wiki and upload `demo/sample-document.md`, then run the Tip Router.

---

## Verification

```bash
npx tsx src/test/sprint1-verification.ts  # 27 tests — chunker, wiki storage, raw sources
npx tsx src/test/sprint2-verification.ts  # 18 tests — wikiStore, namespacing, compound log
npx tsx src/test/sprint3-verification.ts  # 13 tests — research plan, evidence storage
npx tsx src/test/sprint4-verification.ts  # 12 tests — mechanical validation, audit structure
npx tsx src/test/sprint5-verification.ts  # 18 tests — session manager, memo assembly
npx tsx src/test/sprint6-verification.ts  # 12 tests — demo data, README completeness
```

**Total: 100/100 automated tests pass.**

---

## License

*(To be determined.)*
