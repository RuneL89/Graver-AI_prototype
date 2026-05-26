# Sprint 3: Tip Router — Decomposition and Parallel Research

## Objective
Implement the tip input, decomposition into sub-claims, and parallel research execution per FRD sections 3.1.1 through 3.1.3.

## FRD Requirements Covered
- **FR-1.1 Tip Decomposition:** Accept a free-text investigative tip and decompose it into 3–5 structured research questions or verifiable sub-claims. Store as `research_plan.json`.
- **FR-1.2 Parallel Research Execution:** For each sub-claim, launch parallel research agents: WebResearcher (web sources) and WikiQuerier (local wiki if exists).
- **FR-1.3 Evidence Collection:** Each agent writes structured findings to `external_evidence.json` (web) and `internal_evidence.json` (documents). Each finding includes: sub-claim addressed, source URL/document reference, relevant passage/summary, confidence flag.

## Scope
- Tip input UI.
- TipDecomposer agent that breaks a tip into 3–5 research questions and writes `research_plan.json`.
- Parallel research loop launching WebResearcher and WikiQuerier agents per sub-claim.
- Evidence collection into `external_evidence.json` and `internal_evidence.json`.

## Files to Create

| File | Purpose |
|---|---|
| `src/workbench/tiprouter/decomposer.ts` | TipDecomposer agent |
| `src/workbench/tiprouter/webResearcher.ts` | WebResearcher agent (Brave Search + LLM extraction) |
| `src/workbench/tiprouter/wikiQuerier.ts` | WikiQuerier agent (uses `querier.ts` from Sprint 1) |
| `src/workbench/tiprouter/researchLoop.ts` | Parallel loop coordinator |
| `src/ui/components/TipInput.tsx` | Tip entry UI |
| `src/ui/components/ResearchMonitor.tsx` | Live status of parallel research tasks |

## Key Implementation Notes
- **Parallel execution:** Reuse the parallel topic loop pattern from `pipeline.ts` in the AI Newsroom. Each sub-claim is a "topic." Launch all sub-claims simultaneously. Implement round-based stall recovery for rate limits or timeouts.
- **WebResearcher:** Uses Brave Search API (already configured in `apiConfig.ts`) to find sources, then fetches and extracts relevant passages.
- **WikiQuerier:** Checks if a wiki is selected for the session. If yes, queries the wiki via `querier.ts` from Sprint 1. If no, writes an empty evidence set and signals "no internal sources."
- **Finding structure:** Each finding must include: sub-claim ID, source reference, passage/summary, confidence flag.
- **Observability:** Every agent writes reasoning, prompt, and output to structured files in browser storage per NFR-3.

## Acceptance Criteria
- [ ] User enters a test tip and the system generates `research_plan.json` with 3–5 sub-claims.
- [ ] Parallel research launches for all sub-claims.
- [ ] `external_evidence.json` contains findings from web sources.
- [ ] If a wiki is selected, `internal_evidence.json` contains findings from the wiki.
- [ ] ResearchMonitor shows real-time status of each parallel task.

## Post-Approval Step
- [ ] Update `README.md` to document Tip Router capabilities: tip decomposition, parallel research execution, evidence collection from web and wiki sources, and real-time monitoring.

## Review Gate
**Do not proceed to Sprint 4 without explicit user approval.**

User enters a test tip and reviews `research_plan.json` and both evidence files. Confirm decomposition quality and evidence coverage before Sprint 4 begins.

---

## Approval Rule

> **This sprint must only be marked as Done in `SPRINT_INSTRUCTIONS.md` after the user has explicitly approved it.**
>
> If all acceptance criteria have been developed and verified but the user has not yet given explicit approval, the sprint status must be set to **⏳ Waiting for user approval**. It must not be set to **✅ Done** without the user's explicit confirmation.
