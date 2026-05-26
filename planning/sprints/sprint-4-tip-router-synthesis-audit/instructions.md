# Sprint 4: Tip Router — Synthesis and Audit Gate

## Objective
Implement the cross-reference synthesis, two-layer evidence audit, and rewrite loop per FRD sections 3.1.4 through 3.1.6.

## FRD Requirements Covered
- **FR-1.4 Cross-Reference Synthesis:** A CrossReferenceSynthesizer agent reads both evidence files and produces `synthesis.json`, mapping each sub-claim to supporting sources, flagging contradictions, and marking gaps.
- **FR-1.5 Evidence Audit Gate:** An EvidenceAuditor evaluates `synthesis.json` with a two-layer validation pattern:
  - **Mechanical layer:** Fast code validation confirming every claim has ≥1 source, sources are diverse, required fields present.
  - **Qualitative layer:** LLM evaluation of logical consistency, evidentiary strength, counter-narrative coverage.
  - Returns structured JSON verdict: `APPROVED` or `REJECTED`, with `rewriter_instructions` if rejected.
- **FR-1.6 Rewrite Loop:** If audit returns `REJECTED`, an EvidenceWriter applies auditor instructions to patch gaps or resolve contradictions. Revised synthesis returns to EvidenceAuditor. Loop repeats until approval or max 5 iterations.

## Scope
- CrossReferenceSynthesizer agent that reads evidence files and produces `synthesis.json`.
- EvidenceAuditor with mechanical validation (code) and qualitative validation (LLM).
- EvidenceWriter agent that patches synthesis based on audit feedback.
- Rewrite loop with maximum 5 iterations.

## Files to Create

| File | Purpose |
|---|---|
| `src/workbench/tiprouter/synthesizer.ts` | CrossReferenceSynthesizer agent |
| `src/workbench/tiprouter/auditor.ts` | EvidenceAuditor agent (qualitative layer) |
| `src/workbench/tiprouter/evidenceWriter.ts` | EvidenceWriter agent |
| `src/workbench/tiprouter/mechanicalValidator.ts` | Fast code validation for citation completeness and source diversity |

## Key Implementation Notes
- **Synthesizer output:** Must map each sub-claim to its supporting sources, flag contradictions, and mark gaps. Output is structured JSON.
- **Mechanical validator:** Checks in pure code (zero LLM cost):
  - Every claim has ≥1 source.
  - Sources are from ≥2 distinct domains or documents.
  - All required fields are present.
- **Qualitative auditor:** An `AgentFn` that evaluates logical consistency, whether evidence supports conclusions, and whether counter-narratives are addressed. Returns standard `AuditResult` JSON with `APPROVED` or `REJECTED`.
- **EvidenceWriter:** Receives `rewriter_instructions` and makes minimal targeted patches to the synthesis, then loops back to the auditor.
- **Loop pattern:** Reuse the rejection loop pattern from the AI Newsroom's Full Script Editor → Full Script Writer flow.
- **Observability:** User must be able to inspect audit reasoning at each iteration (NFR-3).
- **Resume capability:** Pipeline supports restarting from any stage without losing prior outputs (NFR-4).

## Acceptance Criteria
- [ ] `synthesis.json` correctly maps sub-claims to sources and flags contradictions/gaps.
- [ ] Mechanical validator catches missing citations or single-source claims.
- [ ] Qualitative auditor returns structured `APPROVED` or `REJECTED` with specific instructions.
- [ ] Rejected synthesis is rewritten and re-audited. Loop terminates on approval or after 5 iterations.
- [ ] User can inspect the audit reasoning at each iteration.

## Post-Approval Step
- [ ] Update `README.md` to document the synthesis engine, two-layer audit gate (mechanical + qualitative), and the rewrite loop with iteration limits.

## Review Gate
**Do not proceed to Sprint 5 without explicit user approval.**

User reviews `synthesis.json` and confirms the audit gate correctly identifies weak or unsupported claims. Confirm rewrite loop functions before Sprint 5 begins.

---

## Approval Rule

> **This sprint must only be marked as Done in `SPRINT_INSTRUCTIONS.md` after the user has explicitly approved it.**
>
> If all acceptance criteria have been developed and verified but the user has not yet given explicit approval, the sprint status must be set to **⏳ Waiting for user approval**. It must not be set to **✅ Done** without the user's explicit confirmation.
