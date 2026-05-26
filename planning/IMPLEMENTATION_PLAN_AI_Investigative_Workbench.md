# Implementation Plan
## AI Investigative Workbench — Prototype

**Reference Document:** `planning/FRD_AI_Investigative_Workbench.md`
**Source Repository for Reuse:** `https://github.com/RuneL89/Ai-newsroom/tree/Web_version`

**Process Rule:** Each sprint begins only after the user has reviewed the previous sprint's output and confirmed the acceptance criteria are met. Do not proceed to the next sprint without explicit user approval.

---

## Sprint 0: Foundation and Infrastructure Reuse

**Objective:** Establish the project scaffold by cloning the reusable orchestration layer from the AI Newsroom Web_version branch and creating the new directory structure for the workbench.

**Scope:**
- Reuse without modification: `pipeline.ts`, `llmAdapter.ts`, `fileManager.ts`, `sessionConfig.ts`, `types.ts`, `apiConfig.ts`, and the `AgentFn` interface pattern.
- Create new top-level directories for the workbench modules.
- Update `package.json` and build configuration if needed.
- Create a `PROJECT.md` at root documenting which AI Newsroom files are reused and which are new.

**Files to Create:**
- `src/workbench/types.ts` — workbench-specific types (Tip, WikiPage, EvidenceFinding, etc.)
- `src/workbench/config.ts` — workbench session configuration defaults
- `PROJECT.md` — reuse map and architecture notes

**Files to Reuse (copy from AI Newsroom Web_version at `https://github.com/RuneL89/Ai-newsroom/tree/Web_version`):**
- `src/lib/pipeline.ts` → `src/workbench/lib/pipeline.ts`
- `src/lib/llmAdapter.ts` → `src/workbench/lib/llmAdapter.ts`
- `src/lib/fileManager.ts` → `src/workbench/lib/fileManager.ts`
- `src/lib/sessionConfig.ts` → `src/workbench/lib/sessionConfig.ts`
- `src/lib/apiConfig.ts` → `src/workbench/lib/apiConfig.ts`
- `src/types.ts` → `src/workbench/types-shared.ts`

**Acceptance Criteria:**
- [ ] Project builds without errors.
- [ ] All reused files are in place and unmodified except for import path adjustments.
- [ ] `PROJECT.md` lists every reused file with its original source path.
- [ ] A hello-world agent can execute through the pipeline runner and write a file to IndexedDB.

**Review Gate:** User inspects the directory structure and confirms the reuse plan is correct before Sprint 1 begins.

---

## Sprint 1: Document Pre-Digestor — Core Ingestion

**Objective:** Implement the three-layer Karpathy LLM Wiki architecture (Raw Sources, The Wiki, The Schema) and its three core operations (Ingest, Query, Lint) per FRD sections 3.2.0 through 3.2.2.

**Scope:**
- File upload UI accepting PDF, CSV, TXT, MD.
- Immutable raw source storage in IndexedDB.
- Schema document (`schema.md`) defining wiki conventions and workflows.
- Document chunking with citation anchors (document name, page/line range).
- **Ingest operation** — sequence of discrete LLM calls that reads raw source and updates the wiki incrementally: `sources/{doc}.md` → `index.md` → `entities/` → `concepts/` → `findings/` → append `log.md`.
- **Query operation** — user asks a question; LLM reads `index.md`, then relevant pages, synthesizes answer with citations.
- **Lint operation** — user triggers health-check; LLM scans wiki for contradictions, orphans, stale claims, missing cross-references.
- First-ingest flow: single document → complete wiki (architecture must support compounding for future sprints).

**Files to Create:**
- `src/workbench/predigestor/rawSources.ts` — immutable raw source storage (IndexedDB `raw/` prefix)
- `src/workbench/predigestor/schema.md` — schema document: wiki structure, conventions, workflows
- `src/workbench/predigestor/chunker.ts` — splits documents into chunks with anchors
- `src/workbench/predigestor/ingestor.ts` — incremental ingest agent: reads raw source + existing wiki, updates pages
- `src/workbench/predigestor/querier.ts` — query operation agent: reads index → pages → synthesizes answer
- `src/workbench/predigestor/linter.ts` — lint operation agent: scans wiki for contradictions, orphans, gaps
- `src/workbench/predigestor/schema.ts` — wiki storage helpers (read/write/list pages in IndexedDB)
- `src/workbench/predigestor/index.ts` — module entry point
- `src/ui/components/DocumentUploader.tsx` — drag-and-drop upload + ingest trigger
- `src/ui/components/WikiQuery.tsx` — query input and answer display
- `src/ui/components/WikiLint.tsx` — lint trigger and results display

**Key Implementation Notes:**
- Raw sources are stored immutably under `raw/` prefix in IndexedDB. The LLM reads them but never modifies them.
- The schema document is stored as `schema.md` and loaded via `?raw` import. It is prepended to every LLM prompt for ingest, query, and lint.
- Ingest is incremental, not one-shot. Each step is a separate LLM call. The agent reads existing pages before writing updates. For first ingest, existing pages are empty.
- Chunk size must respect the LLM's context window. Use the `llmAdapter.ts` model detection to set chunk limits dynamically.
- Citation anchors must be stored as metadata on each chunk so the wiki generator can reference exact locations.
- `index.md` is a content-oriented catalog — lists every page with a one-line summary, organized by category. Updated on every ingest.
- `log.md` is append-only. Each entry starts with `## [ISO-date] ingest | Document Name` for parseability.
- Query flow: LLM reads `index.md` first, then drills into relevant pages, then synthesizes an answer with citations.
- Lint flow: LLM receives the full wiki (or reads index then relevant pages) and outputs a structured report.

**Acceptance Criteria:**
- [ ] User can upload a single PDF or text file. The raw source is stored immutably.
- [ ] A `schema.md` exists and is passed to the LLM on every operation.
- [ ] The LLM performs ingest as a sequence: writes `sources/{doc}.md`, updates `index.md`, creates/updates `entities/`, `concepts/`, `findings/`, appends to `log.md`.
- [ ] `index.md` lists all pages with one-line summaries, organized by category.
- [ ] `log.md` is append-only with parseable entry prefixes.
- [ ] User can ask a question via query UI. The LLM reads `index.md` first, then relevant pages, and returns a synthesized answer with citations.
- [ ] User can run lint. The LLM scans the wiki and reports contradictions, orphans, and missing cross-references.
- [ ] All wiki files and raw sources are inspectable in browser storage.

**Review Gate:** User uploads a test document, inspects the generated wiki folder structure, runs a query against the wiki, and runs a lint pass. Confirm the structure and operations match the Karpathy pattern before Sprint 2 begins.

---

## Sprint 2: Document Pre-Digestor — Compounding and Persistence

**Objective:** Implement multi-document compounding updates and cross-session persistence per FRD sections 3.2.2 (FR-2.4 and FR-2.6).

**Scope:**
- Second-document ingestion that updates existing wiki pages rather than duplicating them.
- IndexedDB persistence improvements so wikis survive page refreshes.
- Wiki selection UI: journalist can choose which existing wiki to query against.

**Files to Create:**
- `src/workbench/predigestor/compounder.ts` — agent that handles multi-source incremental ingestion and page updates
- `src/workbench/predigestor/wikiStore.ts` — IndexedDB persistence layer for wiki metadata and file listings
- `src/ui/components/WikiSelector.tsx` — UI for selecting existing wikis

**Key Implementation Notes:**
- The compounder agent must read the existing `index.md` and relevant pages before writing updates. It should add new information, create cross-links, and flag contradictions.
- Wiki persistence must store the full wiki file tree and a manifest so the selector can list available wikis by name and creation date.

**Acceptance Criteria:**
- [ ] User uploads a second document to an existing wiki.
- [ ] Existing pages are updated (not duplicated) and new cross-links are added.
- [ ] The `log.md` records the update event.
- [ ] Wiki persists after browser refresh and is selectable from a list.

**Review Gate:** User uploads a second document and confirms that existing pages are updated rather than duplicated. Confirm persistence works before Sprint 3 begins.

---

## Sprint 3: Tip Router — Decomposition and Parallel Research

**Objective:** Implement the tip input, decomposition into sub-claims, and parallel research execution per FRD sections 3.1.1 through 3.1.3.

**Scope:**
- Tip input UI.
- TipDecomposer agent that breaks a tip into 3–5 research questions and writes `research_plan.json`.
- Parallel research loop launching WebResearcher and WikiQuerier agents per sub-claim.
- Evidence collection into `external_evidence.json` and `internal_evidence.json`.

**Files to Create:**
- `src/workbench/tiprouter/decomposer.ts` — TipDecomposer agent
- `src/workbench/tiprouter/webResearcher.ts` — WebResearcher agent (Brave Search + LLM extraction)
- `src/workbench/tiprouter/wikiQuerier.ts` — WikiQuerier agent (uses querier.ts from Sprint 1)
- `src/workbench/tiprouter/researchLoop.ts` — parallel loop coordinator
- `src/ui/components/TipInput.tsx` — tip entry UI
- `src/ui/components/ResearchMonitor.tsx` — live status of parallel research tasks

**Key Implementation Notes:**
- Reuse the parallel topic loop pattern from `pipeline.ts` in the AI Newsroom. Each sub-claim is a "topic." Launch all sub-claims simultaneously. Implement round-based stall recovery for rate limits or timeouts.
- WebResearcher uses Brave Search API (already configured in `apiConfig.ts`) to find sources, then fetches and extracts relevant passages.
- WikiQuerier checks if a wiki is selected for the session. If yes, it queries the wiki. If no, it writes an empty evidence set and signals "no internal sources."
- Each finding must include: sub-claim ID, source reference, passage/summary, confidence flag.

**Acceptance Criteria:**
- [ ] User enters a test tip and the system generates `research_plan.json` with 3–5 sub-claims.
- [ ] Parallel research launches for all sub-claims.
- [ ] `external_evidence.json` contains findings from web sources.
- [ ] If a wiki is selected, `internal_evidence.json` contains findings from the wiki.
- [ ] ResearchMonitor shows real-time status of each parallel task.

**Review Gate:** User enters a test tip and reviews `research_plan.json` and both evidence files. Confirm decomposition quality and evidence coverage before Sprint 4 begins.

---

## Sprint 4: Tip Router — Synthesis and Audit Gate

**Objective:** Implement the cross-reference synthesis, two-layer evidence audit, and rewrite loop per FRD sections 3.1.4 through 3.1.6.

**Scope:**
- CrossReferenceSynthesizer agent that reads evidence files and produces `synthesis.json`.
- EvidenceAuditor with mechanical validation (code) and qualitative validation (LLM).
- EvidenceWriter agent that patches synthesis based on audit feedback.
- Rewrite loop with maximum 5 iterations.

**Files to Create:**
- `src/workbench/tiprouter/synthesizer.ts` — CrossReferenceSynthesizer agent
- `src/workbench/tiprouter/auditor.ts` — EvidenceAuditor agent
- `src/workbench/tiprouter/evidenceWriter.ts` — EvidenceWriter agent
- `src/workbench/tiprouter/mechanicalValidator.ts` — fast code validation for citation completeness and source diversity

**Key Implementation Notes:**
- The synthesizer must map each sub-claim to its supporting sources, flag contradictions, and mark gaps. Output is structured JSON.
- The mechanical validator checks: every claim has ≥1 source, sources are from ≥2 distinct domains or documents, all required fields are present. This runs in pure code, zero LLM cost.
- The qualitative auditor is an AgentFn that evaluates logical consistency, evidentiary strength, and counter-narrative coverage. It returns the standard `AuditResult` JSON with `APPROVED` or `REJECTED`.
- The evidence writer receives `rewriter_instructions` and makes minimal targeted patches to the synthesis, then loops back to the auditor.
- Reuse the rejection loop pattern from the AI Newsroom's Full Script Editor → Full Script Writer flow.

**Acceptance Criteria:**
- [ ] `synthesis.json` correctly maps sub-claims to sources and flags contradictions/gaps.
- [ ] Mechanical validator catches missing citations or single-source claims.
- [ ] Qualitative auditor returns structured `APPROVED` or `REJECTED` with specific instructions.
- [ ] Rejected synthesis is rewritten and re-audited. Loop terminates on approval or after 5 iterations.
- [ ] User can inspect the audit reasoning at each iteration.

**Review Gate:** User reviews `synthesis.json` and confirms the audit gate correctly identifies weak or unsupported claims. Confirm rewrite loop functions before Sprint 5 begins.

---

## Sprint 5: Report Assembly and Full Integration

**Objective:** Implement the report assembler and wire the complete end-to-end flow from tip entry through wiki query to evidence memo per FRD section 3.1.7.

**Scope:**
- ReportAssembler pure-code markdown generator.
- Full pipeline integration: Tip Router + Document Pre-Digestor working together.
- Session state management across both modules.
- Final evidence memo output with full attribution.

**Files to Create:**
- `src/workbench/tiprouter/reportAssembler.ts` — concatenates approved synthesis into markdown
- `src/workbench/session.ts` — unified session manager linking tip, wiki selection, and pipeline state
- `src/ui/components/EvidenceMemo.tsx` — renders the final markdown memo
- `src/ui/components/Workbench.tsx` — main orchestration UI combining all modules

**Key Implementation Notes:**
- ReportAssembler is pure code, no LLM call. It reads `synthesis.json` and formats it into a markdown document with sections for each sub-claim, findings, contradictions, gaps, and confidence summary.
- The Workbench UI must allow the journalist to: enter a tip, optionally select or upload a wiki, run the pipeline, and view the evidence memo with access to all intermediate files.
- Session state must track: current tip, selected wiki, pipeline stage, and all generated files.

**Acceptance Criteria:**
- [ ] End-to-end flow completes: tip → research plan → parallel research → synthesis → audit → approved memo.
- [ ] Evidence memo is generated as markdown with full source attribution.
- [ ] User can view and download the memo.
- [ ] User can inspect any intermediate file (research plan, evidence files, synthesis, audit results) from the UI.
- [ ] Pipeline supports resume from any stage.

**Review Gate:** User runs a complete end-to-end test with a real tip and optional document. Confirm the evidence memo is accurate and well-structured before Sprint 6 begins.

---

## Sprint 6: Polish and Demo Preparation

**Objective:** Refine the UI, handle edge cases, and prepare a repeatable demo scenario.

**Scope:**
- Error handling for failed API calls, empty search results, and unsupported file types.
- Loading states and progress indicators.
- Demo data set: a sample tip and sample document for consistent demonstration.
- Code cleanup and final `README.md` for the repository.

**Files to Create/Modify:**
- `src/ui/components/` — add loading states, error banners, retry buttons
- `demo/` — sample tip and sample document for testing
- `README.md` — project overview, setup instructions, and demo guide

**Acceptance Criteria:**
- [ ] All API failures show user-friendly errors with retry options.
- [ ] Empty search results are handled gracefully (marked as gaps in the memo).
- [ ] Demo data produces a consistent, compelling output in under 3 minutes.
- [ ] README includes setup steps and a demo script.
- [ ] No console errors during normal operation.

**Review Gate:** User runs the demo scenario independently and confirms it is ready to show to Projekt Y. This is the final approval before the implementation is considered complete.

---

## Reference

All implementation must align with the Functional Requirements Document located at `planning/FRD_AI_Investigative_Workbench.md`.

Reusable orchestration patterns (pipeline runner, AgentFn interface, LLM adapter, file manager) must be sourced from the AI Newsroom Web_version branch at `https://github.com/RuneL89/Ai-newsroom/tree/Web_version`. When in doubt, default to the FRD. When the FRD is silent, default to reusing patterns from the AI Newsroom codebase.

---

*End of Implementation Plan.*
