# Functional Requirements Document
## AI Investigative Workbench — Prototype

**Version:** 0.1  
**Date:** 26 May 2026  
**Status:** Draft for internal review

---

## 1. Purpose and Scope

This document defines the functional requirements for a standalone browser-based prototype that assists investigative journalists with two tasks: decomposing a research tip into verifiable tracks, and pre-digesting large document sets into a queryable knowledge structure.

**This is a research tool, not a publishing pipeline.** The system generates a first-draft evidence memo and a structured document wiki. It does not write finished articles, make editorial judgments, or publish content. Human journalists review, verify, and decide what to do with the output.

The prototype is designed for rapid demonstration. It runs entirely in the browser with no server-side infrastructure required.

---

## 2. System Overview

The workbench consists of two independent modules that can operate alone or together.

| Module | Input | Output | When Used |
|---|---|---|---|
| **Tip Router** | An investigative tip or question | `evidence_memo.md` | Always. Queries open sources and any available document wiki. |
| **Document Pre-Digestor** | One or more large documents (PDF, CSV, text archive) | A local `wiki/` folder with markdown pages and an `index.md` | When the journalist has source documents too large for standard RAG. |

The modules communicate through a shared browser storage layer (IndexedDB). The Tip Router checks whether a wiki exists for the current session. If yes, it queries it alongside web sources. If no, it proceeds with web sources only.

---

## 3. Functional Requirements

### 3.1 Tip Router

**FR-1.1 Tip Decomposition**  
The system shall accept a free-text investigative tip and decompose it into 3–5 structured research questions or verifiable sub-claims. The decomposition shall be stored as `research_plan.json`.

**FR-1.2 Parallel Research Execution**  
For each sub-claim in the research plan, the system shall launch parallel research agents:
- A **WebResearcher** agent that queries open web sources via Brave Search API and relevant public APIs.
- A **WikiQuerier** agent that queries the local document wiki if one exists for the session.

**FR-1.3 Evidence Collection**  
Each research agent shall write structured findings to separate evidence files:
- `external_evidence.json` for web-sourced findings.
- `internal_evidence.json` for document-sourced findings.

Each finding shall include: the sub-claim it addresses, the source URL or document reference, the relevant passage or summary, and a confidence flag.

**FR-1.4 Cross-Reference Synthesis**  
A **CrossReferenceSynthesizer** agent shall read both evidence files and produce `synthesis.json`, mapping each sub-claim to its supporting sources, flagging contradictions between sources, and marking gaps where no evidence was found.

**FR-1.5 Evidence Audit Gate**  
An **EvidenceAuditor** agent shall evaluate `synthesis.json` using a two-layer validation pattern:
- **Mechanical layer:** Fast code validation confirming every claim has at least one source, sources are diverse, and required fields are present.
- **Qualitative layer:** LLM evaluation of logical consistency, whether evidence supports conclusions, and whether counter-narratives are addressed.

The auditor shall return a structured JSON verdict: `APPROVED` or `REJECTED`, with `rewriter_instructions` if rejected.

**FR-1.6 Rewrite Loop**  
If the audit returns `REJECTED`, an **EvidenceWriter** agent shall apply the auditor's instructions to patch gaps or resolve contradictions in the synthesis. The revised synthesis shall return to the EvidenceAuditor. This loop shall repeat until the audit clears or a maximum of 5 iterations is reached.

**FR-1.7 Report Assembly**  
Once approved, a **ReportAssembler** shall generate a markdown evidence memo containing:
- The original tip and research questions.
- Findings per sub-claim with full source attribution.
- Contradictions and gaps explicitly noted.
- A confidence summary per claim.

No creative writing or editorial framing shall occur at this stage. The memo is a structured research summary.

---

### 3.2 Document Pre-Digestor

#### 3.2.0 Architecture

The Document Pre-Digestor follows the three-layer architecture described in Karpathy's LLM Wiki pattern:

**Raw Sources** — The immutable, curated collection of original documents uploaded by the journalist. The LLM reads from raw sources but never modifies them. Raw sources persist in browser storage and serve as the ground truth for all citation anchors.

**The Wiki** — A directory of LLM-generated markdown files stored in browser storage. The LLM owns this layer entirely: it creates pages, updates them when new sources arrive, maintains cross-references, and keeps everything consistent. The journalist reads the wiki; the LLM writes it.

**The Schema** — A configuration document (`schema.md`) that teaches the LLM how the wiki is structured, what conventions to follow, and what workflows to execute during ingest, query, and lint operations. The schema is persisted alongside the wiki and passed to the LLM as context on every operation.

#### 3.2.1 Operations

The LLM shall perform three operations on the wiki:

**Ingest.** When a new raw source is added, the LLM shall: read the source, write or update a summary page in `sources/`, update `index.md` to catalog the new source and any new pages, update or create relevant pages in `entities/`, `concepts/`, and `findings/` (merging new information with existing content), note contradictions between the new source and prior sources, and append an entry to `log.md`.

**Query.** The journalist shall ask questions against the wiki. The LLM shall read `index.md` first to find relevant pages, read those specific pages, and synthesize an answer with citations back to wiki pages and raw sources. Valuable answers may be filed back into the wiki as new pages.

**Lint.** The system shall provide a health-check operation where the LLM scans the wiki for: contradictions between pages, stale claims superseded by newer sources, orphan pages with no inbound links, important concepts lacking dedicated pages, and missing cross-references.

#### 3.2.2 Functional Requirements

**FR-2.1 Document Ingestion**  
The system shall accept file uploads of common document formats (PDF, CSV, plain text, markdown). Uploaded files shall be stored immutably as **raw sources** in browser storage. The journalist shall be able to upload multiple files in one session.

**FR-2.2 Chunking and Indexing**  
The system shall split large documents into context-window-sized chunks. Each chunk shall carry a citation anchor (document name, page or line range) so agents can reference exact locations without loading the full document into memory.

**FR-2.3 LLM Wiki Generation**  
The system shall compile uploaded documents into a persistent, LLM-maintained wiki structure stored in browser storage. This wiki shall follow the pattern described in Andrej Karpathy's LLM Wiki GitHub gist (gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

Specifically, the wiki shall be organized as a folder structure of markdown files:

```
wiki/
├── index.md              (content-oriented catalog of all pages)
├── log.md                (append-only chronological record)
├── sources/              (per-document summary pages)
├── entities/             (named people, organizations, locations)
├── concepts/             (themes, legal terms, financial instruments)
└── findings/             (extracted claims with citations)
```

**FR-2.3a Schema Document**  
The system shall maintain a `schema.md` file that defines the wiki structure, page formats, citation conventions, and the ingest/query/lint workflows. This schema shall be passed to the LLM as context on every wiki operation.

**FR-2.3b Query Operation**  
The system shall provide a query interface where the journalist asks questions against the wiki. The LLM shall read `index.md` first to find relevant pages, read those specific pages, and synthesize an answer with citations back to wiki pages and raw sources. Valuable answers may be filed back into the wiki as new pages.

**FR-2.3c Lint Operation**  
The system shall provide a health-check operation where the LLM scans the wiki for contradictions between pages, stale claims superseded by newer sources, orphan pages with no inbound links, important concepts lacking dedicated pages, and missing cross-references. The lint output shall be a structured report.

**FR-2.4 Compounding Updates**  
When additional documents are uploaded, the system shall perform an **ingest** operation that updates existing wiki pages rather than regenerating the entire wiki. The LLM shall read the existing wiki pages, read the new raw source, and merge new information into relevant pages. The wiki shall grow denser through compounding, not just bigger.

**FR-2.5 Query Interface**  
The Tip Router's WikiQuerier agent shall query the wiki using the **Query** operation: reading `index.md` first, then drilling into relevant wiki pages, and synthesizing an answer with citations back to the original raw sources.

**FR-2.6 Wiki Persistence**  
The wiki and raw sources shall persist in browser storage across sessions. A journalist shall be able to build a wiki on Monday and run multiple different tips against it later without re-uploading documents.

---

## 4. Non-Functional Requirements

**NFR-1 Standalone Operation**  
The prototype shall run entirely in a modern web browser. No server, database, or cloud infrastructure is required beyond external API calls for search and LLM inference.

**NFR-2 Reusability**  
The orchestration layer (pipeline runner, agent interface, LLM adapter, file manager, session config) shall be reused from the existing AI Newsroom codebase with minimal modification.

**NFR-3 Observability**  
Every agent shall write its reasoning, prompt, and output to structured files in browser storage. A human shall be able to inspect any intermediate file at any stage.

**NFR-4 Resume Capability**  
The pipeline shall support restarting from any stage without losing prior stage outputs.

---

## 5. Explicit Boundaries

**This system does not:**
- Write finished investigative articles.
- Make publish-or-kill editorial decisions.
- Automatically submit FOIA requests or send emails.
- Maintain persistent memory across unrelated investigations (unless the journalist explicitly reuses a wiki).
- Replace legal review or fact-checking by human editors.

**This system does:**
- Break a tip into answerable questions.
- Gather and structure evidence from web sources and uploaded documents.
- Flag contradictions and gaps.
- Produce a transparent, source-attributed research memo that a journalist can evaluate, expand, or discard.

---

## 6. References

- Karpathy, A. (2026). *LLM Wiki*. GitHub Gist. gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- AI Newsroom codebase (Web_version branch). Pipeline runner, agent interface, and LLM adapter patterns reused from github.com/RuneL89/Ai-newsroom

---

*End of document.*
