# Sprint 1: AgentFn Interface Standardization

**Objective:** Convert all workbench agents to implement the `AgentFn` interface so they can be executed through a unified orchestration layer.

**Scope:**
- Create `WorkbenchAgentContext` that wraps `AgentContext` with workbench-specific fields (`apiConfig`, `braveApiKey`, `braveProxyUrl`, `tipId`, `wikiId`, etc.) while preserving the standard `AgentContext` shape expected by `PipelineRunner`.
- Convert `decomposeTip` to implement `AgentFn`. It receives the tip text via `ctx.currentDraft` and returns `AgentOutput` with the `DecomposeResult` in metadata.
- Convert `researchSubClaimWeb` to implement `AgentFn`. It receives the sub-claim via `ctx.currentDraft` and `ctx.feedback` (for retry context).
- Convert `researchSubClaimWiki` to implement `AgentFn`.
- Convert `synthesizeEvidence` to implement `AgentFn`.
- Convert `validateMechanically` to implement `AgentFn` (fast mechanical validation as an agent step).
- Convert `auditSynthesis` to implement `AgentFn`.
- Convert `rewriteSynthesis` to implement `AgentFn`.
- Convert `assembleEvidenceMemo` to implement `AgentFn`.
- Convert `ingestDocument` and `compoundDocument` to implement `AgentFn`.
- Convert `queryWiki` and `lintWiki` to implement `AgentFn`.
- Ensure every agent uses `onReasoningChunk` for streaming reasoning.
- Ensure every agent uses `onUpdate` for partial stage record updates.
- Ensure the `feedback` channel is used for cross-agent communication (audit result passed to writer, mechanical result passed to synthesis).

**Files to Create:**
- `src/workbench/lib/workbenchAgentContext.ts` — WorkbenchAgentContext builder and type definitions

**Files to Modify:**
- `src/workbench/tiprouter/decomposer.ts`
- `src/workbench/tiprouter/webResearcher.ts`
- `src/workbench/tiprouter/wikiQuerier.ts`
- `src/workbench/tiprouter/synthesizer.ts`
- `src/workbench/tiprouter/mechanicalValidator.ts`
- `src/workbench/tiprouter/auditor.ts`
- `src/workbench/tiprouter/evidenceWriter.ts`
- `src/workbench/tiprouter/reportAssembler.ts`
- `src/workbench/predigestor/ingestor.ts`
- `src/workbench/predigestor/compounder.ts`
- `src/workbench/predigestor/querier.ts`
- `src/workbench/predigestor/linter.ts`

**Key Implementation Notes:**
- Do not change agent logic. Only change function signatures and return shapes.
- The `AgentOutput.metadata` field is where workbench-specific results live (e.g., `metadata.decomposeResult`, `metadata.auditResult`).
- The `AgentOutput.draft` field carries the working text or JSON string that the next agent receives as `ctx.currentDraft`.
- `onUpdate` should emit partial `StageRecord` updates with `reasoning` chunks so the UI can show real-time progress.
- Mechanical validation should still run fast (pure code) but wrapped in the AgentFn interface for consistency.

**Acceptance Criteria:**
- [ ] All 12 workbench agents implement `AgentFn`.
- [ ] Every agent returns `AgentOutput` with `draft`, `reasoning`, `metadata`, and `prompt`.
- [ ] Every agent accepts `WorkbenchAgentContext` via the standard `AgentContext` parameter.
- [ ] Every agent streams reasoning via `onReasoningChunk`.
- [ ] Cross-agent communication uses `ctx.feedback` (e.g., audit passes feedback to writer).
- [ ] Unit tests verify each agent can be called through the `AgentFn` interface with mock context.
- [ ] No agent logic is broken; all existing tests still pass.
