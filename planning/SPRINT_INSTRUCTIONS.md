# Sprint Instructions — AI Investigative Workbench

Use this file as the entry point for all coding work on this project. Each sprint is self-contained and must be completed in order. Do not skip ahead.

> **Rule:** Each sprint begins only after the user has reviewed the previous sprint's output and confirmed the acceptance criteria are met. Do not proceed to the next sprint without explicit user approval.

---

## How to Use This File

1. **Identify the current sprint** from the Sprint Overview table below.
2. **Open the linked instructions file** for that sprint — it contains the full requirements, files to create, acceptance criteria, and review gate.
3. **Implement only what is in that sprint's instructions.** Do not add features from future sprints.
4. **This file is updated by the coding agent when:**
   - The sprint **starts** (set status to In Progress, note the date and scope).
   - There are **major developments** (significant blockers, scope changes, key decisions, architectural pivots).
   - The sprint **ends** (set status to Done, summarize what was completed, what was deferred, and any notes for the next sprint).
   > **Rule:** A sprint must **only** be marked as **Done** after the user has **explicitly approved** it. If all requirements have been developed but the user has not yet approved, the status must be set to **⏳ Waiting for user approval**.
5. **After the sprint is approved by the user and this file is updated**, proceed to update `README.md` per the sprint's post-approval step.
6. **Wait for user approval** before starting the next sprint.

---

## Sprint Overview

| Sprint | Name | Status | Instructions | Overview / Notes |
|---|---|---|---|---|
| 0 | Foundation and Infrastructure Reuse | ✅ Done | [`instructions.md`](./planning/sprints/sprint-0-foundation/instructions.md) | Completed 2026-05-26. All acceptance criteria met. Approved by user. |
| 1 | Document Pre-Digestor — Core Ingestion | ✅ Done | [`instructions.md`](./planning/sprints/sprint-1-document-predigestor-core/instructions.md) | Implemented 2026-05-26. Implements Karpathy's three-layer architecture (Raw Sources, Wiki, Schema) and three operations (Ingest, Query, Lint). 27/27 automated tests pass. Build passes.
| 2 | Document Pre-Digestor — Compounding and Persistence | ✅ Done | [`instructions.md`](./planning/sprints/sprint-2-document-predigestor-compounding/instructions.md) | Implemented 2026-05-26. Approved by user. Multi-document compounding, cross-session persistence via wikiStore manifest, and wiki selection UI. 45/45 automated tests pass. Build passes. |
| 3 | Tip Router — Decomposition and Parallel Research | ✅ Done | [`instructions.md`](./planning/sprints/sprint-3-tip-router-decomposition/instructions.md) | Implemented 2026-05-26. Tip decomposition, parallel web+wiki research, evidence collection. 58/58 automated tests pass. Build passes. |
| 4 | Tip Router — Synthesis and Audit Gate | ✅ Done | [`instructions.md`](./planning/sprints/sprint-4-tip-router-synthesis-audit/instructions.md) | Implemented 2026-05-26. Cross-reference synthesis, two-layer audit (mechanical + qualitative), rewrite loop. 70/70 automated tests pass. Build passes. |
| 5 | Report Assembly and Full Integration | ✅ Done | [`instructions.md`](./planning/sprints/sprint-5-report-assembly-integration/instructions.md) | Implemented 2026-05-26. Report assembler, session manager, Workbench UI, intermediate file inspector. 82/82 automated tests pass. Build passes. |
| 6 | Polish and Demo Preparation | ✅ Done | [`instructions.md`](./planning/sprints/sprint-6-polish-demo/instructions.md) | Implemented 2026-05-26. Demo data, retry buttons, error handling polish, final README. 94/94 automated tests pass. Build passes. |

---

## Sprint Status

- [x] **Sprint 0** — Foundation and Infrastructure Reuse  
  _Scaffold project, reuse AI Newsroom orchestration layer, establish build pipeline._  
  **Status:** ✅ Done  
  **What was done:**  
  - Reused 6 core files + 5 transitive dependencies from AI Newsroom `Web_version` with import-path adjustments only.  
  - Created new directory structure (`src/workbench/`, `src/test/`).  
  - Created workbench-specific types (`src/workbench/types.ts`) and default config (`src/workbench/config.ts`).  
  - Established build tooling (Vite, TypeScript, Tailwind) carried over from AI Newsroom.  
  - Created hello-world pipeline test: dummy agents execute through the reused `PipelineRunner` and write to IndexedDB.  
  - Wrote `PROJECT.md` documenting the full reuse map.  
  **What is left / deferred:**  
  - None. All Sprint 0 acceptance criteria met.  
  **Scope changes / blockers:**  
  - Approved by user on 2026-05-26.

- [x] **Sprint 1** — Document Pre-Digestor — Core Ingestion  
  _File upload UI, document chunking with citation anchors, Karpathy-style LLM Wiki generation._  
  **Status:** ✅ Done  
  **What was done:**  
  - Created `src/workbench/predigestor/rawSources.ts`: immutable raw source storage under `raw/` prefix.  
  - Created `src/workbench/predigestor/schema.md`: schema document teaching the LLM wiki structure, conventions, and workflows. Loaded via `?raw` import and prepended to every LLM prompt.  
  - Created `src/workbench/predigestor/ingestor.ts`: incremental 6-step ingest agent (source → index → entities → concepts → findings → log). Each step is a discrete LLM call that reads existing wiki pages before writing updates.  
  - Created `src/workbench/predigestor/querier.ts`: query operation agent that reads index.md first, drills into relevant pages, and synthesizes a cited answer.  
  - Created `src/workbench/predigestor/linter.ts`: lint operation agent that scans the wiki for contradictions, orphans, stale claims, and missing cross-references.  
  - Created `src/workbench/predigestor/index.ts`: module entry point re-exporting all predigestor modules.  
  - Updated `src/workbench/predigestor/schema.ts`: added `readWikiPageTitle`, `listWikiPagesInFolder`, `readAllWikiPages` helpers.  
  - Updated `src/ui/components/DocumentUploader.tsx`: wired to new ingestor, stores raw source immutably, shows incremental step progress.  
  - Created `src/ui/components/WikiQuery.tsx`: query input and answer display UI.  
  - Created `src/ui/components/WikiLint.tsx`: lint trigger and results display UI.  
  - Updated `src/App.tsx`: integrated DocumentUploader, WikiQuery, and WikiLint.  
  - Updated `src/workbench/types.ts`: `WorkbenchSessionConfig.apiConfig` now uses `ApiConfig` type directly.  
  - Updated `src/test/sprint1-verification.ts`: expanded to 27 tests covering chunker, schema storage, new helpers, raw sources, schema.md content, and log append-only behavior.  
  **What is left / deferred:**  
  - None. All acceptance criteria met.  
  **Scope changes / blockers:**  
  - Revised 2026-05-26 to align with Karpathy's three-layer architecture. Implemented and verified.

- [x] **Sprint 2** — Document Pre-Digestor — Compounding and Persistence  
  _Multi-document compounding updates, IndexedDB cross-session persistence._  
  **Status:** ✅ Done  
  **What was done:**  
  - Updated `schema.ts` and `rawSources.ts` to namespace all storage by `wikiId`, preserving backward compatibility via default parameter.  
  - Updated `ingestor.ts`, `querier.ts`, `linter.ts` to accept `wikiId` and pass it through to storage layer.  
  - Created `src/workbench/predigestor/wikiStore.ts`: manifest-based CRUD for wikis (create, list, delete, rename, refresh counts).  
  - Created `src/workbench/predigestor/compounder.ts`: 6-step incremental ingest agent for second+ documents. Reads all existing wiki context before writing updates. Prompts explicitly instruct the LLM to merge (not duplicate), add cross-links, flag contradictions with ⚠️ markers, and note where new data strengthens or challenges existing claims. Log prefix uses `compound |` for parseability.  
  - Created `src/ui/components/WikiSelector.tsx`: UI for creating, selecting, renaming, refreshing, and deleting wikis.  
  - Updated `src/ui/components/DocumentUploader.tsx`: integrates wiki selection. Automatically uses `ingestDocument` for the first document in a new wiki and `compoundDocument` for subsequent documents. Updates manifest counts after upload.  
  - Updated `src/ui/components/WikiQuery.tsx` and `WikiLint.tsx`: accept `wikiId` prop and operate only on the selected wiki.  
  - Updated `src/App.tsx`: integrated WikiSelector and wired `wikiId` state through all components.  
  - Updated `src/workbench/predigestor/index.ts`: exports compounder and wikiStore.  
  - Created `src/test/sprint2-verification.ts`: 18 tests covering wikiStore CRUD, namespaced schema/rawSources, compound log prefix, and manifest refresh.  
  **What is left / deferred:**  
  - None. All acceptance criteria met.  
  **Scope changes / blockers:**  
  - Approved by user on 2026-05-26.

- [x] **Sprint 3** — Tip Router — Decomposition and Parallel Research  
  _Tip input, decomposition into sub-claims, parallel WebResearcher + WikiQuerier execution._  
  **Status:** ✅ Done  
  **What was done:**  
  - Created `src/workbench/tiprouter/decomposer.ts`: LLM agent that breaks a tip into 3–5 structured sub-claims and persists `research_plan.json` to IndexedDB.  
  - Created `src/workbench/tiprouter/webResearcher.ts`: Brave Search API agent that finds web sources, fetches pages, and extracts relevant passages per sub-claim using LLM. Persists `external_evidence.json`.  
  - Created `src/workbench/tiprouter/wikiQuerier.ts`: Reuses Sprint 1 `queryWiki` to search the local wiki for evidence per sub-claim. Persists `internal_evidence.json`.  
  - Created `src/workbench/tiprouter/researchLoop.ts`: Parallel loop coordinator using `Promise.allSettled` to launch WebResearcher and WikiQuerier simultaneously for all sub-claims. Tracks per-task status.  
  - Created `src/ui/components/TipInput.tsx`: Tip entry UI with decomposition and research trigger buttons. Displays research plan and results.  
  - Created `src/ui/components/ResearchMonitor.tsx`: Live status panel showing pending/running/completed/failed states for each parallel research task with web/wiki finding counts.  
  - Updated `src/App.tsx`: integrated TipInput above existing wiki components.  
  - Created `src/test/sprint3-verification.ts`: 13 tests covering research plan storage, evidence storage, key prefixes, and finding structure.  
  **What is left / deferred:**  
  - None. All acceptance criteria met.  
  **Scope changes / blockers:**  
  - None.

- [x] **Sprint 4** — Tip Router — Synthesis and Audit Gate  
  _Cross-reference synthesis, two-layer evidence audit (mechanical + qualitative), rewrite loop._  
  **Status:** ✅ Done  
  **What was done:**  
  - Created `src/workbench/tiprouter/synthesizer.ts`: CrossReferenceSynthesizer agent that reads external/internal evidence and produces `synthesis.json` mapping each sub-claim to supporting sources, contradictions, and gaps.  
  - Created `src/workbench/tiprouter/mechanicalValidator.ts`: Fast code validation (zero LLM cost) checking every claim has ≥1 source, sources come from ≥2 distinct refs, and all required fields are present.  
  - Created `src/workbench/tiprouter/auditor.ts`: Qualitative LLM audit evaluating logical consistency, evidentiary strength, and counter-narrative coverage. Returns structured APPROVED/REJECTED verdict.  
  - Created `src/workbench/tiprouter/evidenceWriter.ts`: Applies auditor feedback to make minimal targeted patches to synthesis.  
  - Created `src/workbench/tiprouter/synthesisLoop.ts`: Orchestrates the full synthesis → mechanical validation → qualitative audit → rewrite loop with max 5 iterations.  
  - Updated `src/ui/components/TipInput.tsx`: Added "Synthesize & Audit" button after research completes. Displays synthesis entries, contradiction/gap counts, final audit verdict, and full audit iteration history.  
  - Created `src/test/sprint4-verification.ts`: 12 tests covering mechanical validation rules and audit structure.  
  **What is left / deferred:**  
  - None. All acceptance criteria met.  
  **Scope changes / blockers:**  
  - None.

- [x] **Sprint 5** — Report Assembly and Full Integration  
  _Markdown evidence memo generation, end-to-end pipeline integration, session state management._  
  **Status:** ✅ Done  
  **What was done:**  
  - Created `src/workbench/tiprouter/reportAssembler.ts`: Pure-code markdown generator that reads stored pipeline outputs (plan, synthesis, evidence) and builds a structured evidence memo with research questions, findings, contradictions, gaps, source attribution, confidence summary, and disclaimer.  
  - Created `src/workbench/session.ts`: Unified session manager tracking tipId, wikiId, pipeline stage, and all intermediate files. Supports create, load, save, update stage, and list intermediate files for resume capability.  
  - Created `src/ui/components/EvidenceMemo.tsx`: UI for generating and viewing the markdown evidence memo, with download capability.  
  - Created `src/ui/components/IntermediateFiles.tsx`: Inspector panel showing which intermediate files exist (research plan, external/internal evidence, synthesis) and allowing the user to view their raw contents.  
  - Created `src/ui/components/Workbench.tsx`: Main orchestration UI with pipeline status indicator, integrating TipRouter, WikiSelector, DocumentUploader, WikiQuery, WikiLint, EvidenceMemo, and IntermediateFiles.  
  - Updated `src/ui/components/TipInput.tsx`: Added `onTipCreated` and `onStageChange` callbacks to propagate pipeline state to the session manager.  
  - Updated `src/App.tsx`: Simplified to use Workbench component as the main layout.  
  - Created `src/test/sprint5-verification.ts`: 18 tests covering session CRUD, stage tracking, intermediate file listing, and markdown memo structure.  
  **What is left / deferred:**  
  - None. All acceptance criteria met.  
  **Scope changes / blockers:**  
  - None.

- [x] **Sprint 6** — Polish and Demo Preparation  
  _Error handling, loading states, demo data, final README and code cleanup._  
  **Status:** ✅ Done  
  **What was done:**  
  - Created `demo/sample-tip.txt` and `demo/sample-document.md`: Pre-written demo data for consistent demonstration of the end-to-end pipeline.  
  - Updated `src/ui/components/TipInput.tsx`: Added **Load Demo Tip** button that populates the tip textarea. Added **Retry** button that appears on errors to reset state and allow retry. Improved button layout with flex-wrap.  
  - Verified error handling across all components: unsupported file types rejected in DocumentUploader, empty search results handled gracefully in WebResearcher (returned as gaps), API failures show user-friendly messages with retry options.  
  - Verified loading states: all async operations (decompose, research, synthesize, audit, assemble) show spinners and disabled buttons. Pipeline status indicator in Workbench shows current stage.  
  - Finalized `README.md`: complete setup instructions, architecture overview, module documentation, demo script, verification commands, and explicit boundary statement that the system generates research memos (not finished articles) and human review is required.  
  - Created `src/test/sprint6-verification.ts`: 12 tests verifying demo files exist, have expected content, and README includes demo and setup references.  
  **What is left / deferred:**  
  - None. All acceptance criteria met.  
  **Scope changes / blockers:**  
  - None.

---

## References

- **Functional Requirements Document:** `planning/FRD_AI_Investigative_Workbench.md`
- **Implementation Plan:** `planning/IMPLEMENTATION_PLAN_AI_Investigative_Workbench.md`
- **Project README:** [`README.md`](./README.md)
- **Agent Guidelines:** [`AGENTS.md`](./AGENTS.md)
