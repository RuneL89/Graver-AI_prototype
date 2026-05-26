# Sprint 2: Document Pre-Digestor — Compounding and Persistence

## Objective
Implement multi-document compounding updates and cross-session persistence per FRD sections 3.2.2 (FR-2.4 and FR-2.6).

## FRD Requirements Covered
- **FR-2.4 Compounding Updates:** When additional documents are uploaded to an existing wiki, the system shall perform an ingest operation that updates existing pages rather than regenerating the entire wiki. The LLM reads existing wiki pages, reads the new raw source, and merges new information into relevant pages.
- **FR-2.6 Wiki Persistence:** The wiki and raw sources shall persist in browser storage across sessions.

## Scope
- Second-document (and beyond) ingestion that updates existing wiki pages rather than duplicating them.
- IndexedDB persistence so wikis and raw sources survive page refreshes.
- Wiki selection UI: journalist can choose which existing wiki to query against.

## Files to Create

| File | Purpose |
|---|---|
| `src/workbench/predigestor/compounder.ts` | Agent that handles multi-source incremental ingestion and page updates |
| `src/workbench/predigestor/wikiStore.ts` | IndexedDB persistence layer for wiki metadata, manifest, and file listings |
| `src/ui/components/WikiSelector.tsx` | UI for selecting existing wikis |

## Key Implementation Notes
- **Compounder agent:** Must read the existing `index.md` and relevant pages before writing updates. It should add new information, create cross-links, flag contradictions with prior sources, and note where new data strengthens or challenges existing claims. The wiki grows denser, not just bigger.
- **Ingest reuse:** The compounder reuses the incremental ingest sequence from Sprint 1 (`sources/` → `index.md` → `entities/` → `concepts/` → `findings/` → append `log.md`), but now existing pages are non-empty and must be read before updating.
- **Persistence:** Must store the full wiki file tree, all raw sources, and a manifest so the selector can list available wikis by name and creation date.
- **Agent pattern:** The compounder is an `AgentFn` that reads existing wiki state and writes updated pages via the file manager.

## Acceptance Criteria
- [ ] User uploads a second document to an existing wiki.
- [ ] Existing pages are updated (not duplicated) and new cross-links are added.
- [ ] Contradictions between the new source and prior sources are flagged where found.
- [ ] The `log.md` records the update event with a parseable prefix.
- [ ] Wiki persists after browser refresh and is selectable from a list.

## Post-Approval Step
- [ ] Update `README.md` to document multi-document ingestion, compounding updates, and cross-session persistence.

## Review Gate
**Do not proceed to Sprint 3 without explicit user approval.**

User uploads a second document and confirms that existing pages are updated rather than duplicated. Confirm persistence works before Sprint 3 begins.

---

## Approval Rule

> **This sprint must only be marked as Done in `SPRINT_INSTRUCTIONS.md` after the user has explicitly approved it.**
>
> If all acceptance criteria have been developed and verified but the user has not yet given explicit approval, the sprint status must be set to **⏳ Waiting for user approval**. It must not be set to **✅ Done** without the user's explicit confirmation.
