# Sprint 5: Report Assembly and Full Integration

## Objective
Implement the report assembler and wire the complete end-to-end flow from tip entry through wiki query to evidence memo per FRD section 3.1.7.

## FRD Requirements Covered
- **FR-1.7 Report Assembly:** Once approved, a ReportAssembler generates a markdown evidence memo containing:
  - The original tip and research questions.
  - Findings per sub-claim with full source attribution.
  - Contradictions and gaps explicitly noted.
  - A confidence summary per claim.
  - No creative writing or editorial framing — structured research summary only.
- **NFR-4 Resume Capability:** Pipeline supports restarting from any stage without losing prior stage outputs.

## Scope
- ReportAssembler pure-code markdown generator.
- Full pipeline integration: Tip Router + Document Pre-Digestor working together.
- Session state management across both modules.
- Final evidence memo output with full attribution.

## Files to Create

| File | Purpose |
|---|---|
| `src/workbench/tiprouter/reportAssembler.ts` | Concatenates approved synthesis into markdown |
| `src/workbench/session.ts` | Unified session manager linking tip, wiki selection, and pipeline state |
| `src/ui/components/EvidenceMemo.tsx` | Renders the final markdown memo |
| `src/ui/components/Workbench.tsx` | Main orchestration UI combining all modules |

## Key Implementation Notes
- **ReportAssembler:** Pure code, no LLM call. Reads `synthesis.json` and formats it into a markdown document with sections for each sub-claim, findings, contradictions, gaps, and confidence summary.
- **Workbench UI:** Must allow the journalist to:
  - Enter a tip.
  - Optionally select or upload a wiki.
  - Run the pipeline.
  - View the evidence memo with access to all intermediate files.
- **Session state:** Must track current tip, selected wiki, pipeline stage, and all generated files.
- **Integration:** Tip Router checks whether a wiki exists for the current session. If yes, it queries it alongside web sources. If no, proceeds with web sources only (per System Overview).
- **Observability:** User can inspect any intermediate file (research plan, evidence files, synthesis, audit results) from the UI (NFR-3).

## Acceptance Criteria
- [ ] End-to-end flow completes: tip → research plan → parallel research → synthesis → audit → approved memo.
- [ ] Evidence memo is generated as markdown with full source attribution.
- [ ] User can view and download the memo.
- [ ] User can inspect any intermediate file (research plan, evidence files, synthesis, audit results) from the UI.
- [ ] Pipeline supports resume from any stage.

## Post-Approval Step
- [ ] Update `README.md` to document the full end-to-end flow, report assembly, session management, and how to inspect intermediate files.

## Review Gate
**Do not proceed to Sprint 6 without explicit user approval.**

User runs a complete end-to-end test with a real tip and optional document. Confirm the evidence memo is accurate and well-structured before Sprint 6 begins.

---

## Approval Rule

> **This sprint must only be marked as Done in `SPRINT_INSTRUCTIONS.md` after the user has explicitly approved it.**
>
> If all acceptance criteria have been developed and verified but the user has not yet given explicit approval, the sprint status must be set to **⏳ Waiting for user approval**. It must not be set to **✅ Done** without the user's explicit confirmation.
