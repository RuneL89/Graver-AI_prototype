# Sprint 1: Document Pre-Digestor — Core Ingestion

## Objective
Implement the three-layer Karpathy LLM Wiki architecture (Raw Sources, The Wiki, The Schema) and its three core operations (Ingest, Query, Lint) per FRD sections 3.2.0 through 3.2.2.

## FRD Requirements Covered
- **FR-2.1 Document Ingestion:** Accept file uploads of PDF, CSV, plain text, markdown. Store raw sources immutably.
- **FR-2.2 Chunking and Indexing:** Split large documents into context-window-sized chunks with citation anchors.
- **FR-2.3 LLM Wiki Generation:** Compile chunked documents into a persistent, LLM-maintained wiki structure following the Karpathy LLM Wiki pattern.
- **FR-2.3a Schema Document:** Maintain a `schema.md` that teaches the LLM wiki structure, conventions, and workflows.
- **FR-2.3b Query Operation:** Query the wiki by reading `index.md` first, then relevant pages, synthesizing answers with citations.
- **FR-2.3c Lint Operation:** Health-check the wiki for contradictions, orphans, stale claims, and missing cross-references.

## Scope
- File upload UI accepting PDF, CSV, TXT, MD.
- Immutable raw source storage in IndexedDB.
- Schema document (`schema.md`) defining wiki conventions and workflows.
- Document chunking with citation anchors (document name, page/line range).
- **Ingest operation** — a sequence of discrete LLM calls that reads the raw source and updates the wiki incrementally:
  1. Write/update `sources/{doc}.md`
  2. Update `index.md` (catalog of all pages)
  3. Update/create `entities/` pages
  4. Update/create `concepts/` pages
  5. Update/create `findings/` pages
  6. Append to `log.md`
- **Query operation** — user asks a question; LLM reads `index.md`, then relevant pages, synthesizes answer.
- **Lint operation** — user triggers health-check; LLM scans wiki and reports issues.
- First-ingest flow: single document → complete wiki (architecture must support compounding for future sprints).

## Files to Create

| File | Purpose |
|---|---|
| `src/workbench/predigestor/rawSources.ts` | Immutable raw source storage (IndexedDB `raw/` prefix) |
| `src/workbench/predigestor/schema.md` | Schema document: wiki structure, conventions, workflows |
| `src/workbench/predigestor/chunker.ts` | Splits documents into chunks with anchors |
| `src/workbench/predigestor/ingestor.ts` | Incremental ingest agent: reads raw source + existing wiki, updates pages |
| `src/workbench/predigestor/querier.ts` | Query operation agent: reads index → pages → synthesizes answer |
| `src/workbench/predigestor/linter.ts` | Lint operation agent: scans wiki for contradictions, orphans, gaps |
| `src/workbench/predigestor/schema.ts` | Wiki storage helpers (read/write/list pages in IndexedDB) |
| `src/workbench/predigestor/index.ts` | Module entry point |
| `src/ui/components/DocumentUploader.tsx` | Drag-and-drop upload + ingest trigger |
| `src/ui/components/WikiQuery.tsx` | Query input and answer display |
| `src/ui/components/WikiLint.tsx` | Lint trigger and results display |

## Key Implementation Notes
- **Raw sources:** Stored immutably under `raw/` prefix in IndexedDB. The LLM reads them but never modifies them.
- **Schema document:** Stored as `schema.md` and loaded via `?raw` import. Prepended to every LLM prompt for ingest, query, and lint.
- **Ingest is incremental, not one-shot:** Each step (source summary → index → entities → concepts → findings → log) is a separate LLM call. The agent reads existing pages before writing updates. For first ingest, existing pages are empty.
- **Chunk sizing:** Must respect the LLM's context window. Use model detection to set chunk limits dynamically.
- **Citation anchors:** Stored as metadata on each chunk so the wiki generator can reference exact locations.
- **index.md:** Content-oriented catalog — lists every page with a one-line summary, organized by category. Updated on every ingest.
- **log.md:** Append-only chronological record. Each entry starts with `## [ISO-date] ingest | Document Name` for parseability.
- **Query flow:** LLM reads `index.md` first, then drills into relevant pages, then synthesizes an answer with citations.
- **Lint flow:** LLM receives the full wiki (or reads index then relevant pages) and outputs a structured report.

## Karpathy Wiki Structure
```
wiki/
├── index.md              (content-oriented catalog of all pages)
├── log.md                (append-only chronological record)
├── schema.md             (configuration: structure, conventions, workflows)
├── sources/              (per-document summary pages)
├── entities/             (named people, organizations, locations)
├── concepts/             (themes, legal terms, financial instruments)
└── findings/             (extracted claims with citations)
```

## Acceptance Criteria
- [ ] User can upload a single PDF or text file. The raw source is stored immutably.
- [ ] A `schema.md` exists and is passed to the LLM on every operation.
- [ ] The LLM performs ingest as a sequence: writes `sources/{doc}.md`, updates `index.md`, creates/updates `entities/`, `concepts/`, `findings/`, appends to `log.md`.
- [ ] `index.md` lists all pages with one-line summaries, organized by category.
- [ ] `log.md` is append-only with parseable entry prefixes (`## [ISO-date] ingest | Document Name`).
- [ ] User can ask a question via query UI. The LLM reads `index.md` first, then relevant pages, and returns a synthesized answer with citations.
- [ ] User can run lint. The LLM scans the wiki and reports contradictions, orphans, and missing cross-references.
- [ ] All wiki files and raw sources are inspectable in browser storage.

## Post-Approval Step
- [ ] Update `README.md` to document the Document Pre-Digestor core capabilities: supported file types, chunking strategy, wiki structure, ingest/query/lint operations, and how to run a first ingestion.

## Review Gate
**Do not proceed to Sprint 2 without explicit user approval.**

User uploads a test document, inspects the generated wiki folder structure, runs a query against the wiki, and runs a lint pass. Confirm the structure and operations match the Karpathy pattern before Sprint 2 begins.

---

## Approval Rule

> **This sprint must only be marked as Done in `SPRINT_INSTRUCTIONS.md` after the user has explicitly approved it.**
>
> If all acceptance criteria have been developed and verified but the user has not yet given explicit approval, the sprint status must be set to **⏳ Waiting for user approval**. It must not be set to **✅ Done** without the user's explicit confirmation.
