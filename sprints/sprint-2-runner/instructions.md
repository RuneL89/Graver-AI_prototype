# Sprint 2: PipelineRunner Integration

**Objective:** Wire the Tip Router and Pre-Digestor flows through the reused `PipelineRunner` state machine, replacing direct async calls with stage-based execution.

**Scope:**
- Create workbench stage definitions in `STAGE_DEFINITIONS` format for both modules.
- For Tip Router: `decompose` → `research` → `synthesize` → `audit` → `rewrite` (conditional) → `assemble`.
- For Pre-Digestor: `ingest` → `query` / `lint` (user-triggered, not sequential).
- Create an `AgentMap` that maps stage IDs to the AgentFn implementations from Sprint 1.
- Modify `PipelineRunner` to accept workbench stage definitions alongside or instead of newsroom stages. The runner should be configurable with a stage set at instantiation.
- Replace direct agent calls in `TipInput.tsx` with `PipelineRunner.executeStage()` calls.
- Replace direct agent calls in `WikiQuery.tsx` and `WikiLint.tsx` with runner calls.
- Implement `getNextStage()` logic for workbench stages using metadata-driven routing:
  - After `audit`, if `metadata.auditResult.approval_status === 'REJECTED'`, route to `rewrite`.
  - After `rewrite`, route back to `audit`.
  - After `audit` with `APPROVED`, route to `assemble`.
  - After `assemble`, pipeline ends.
- Ensure `PipelineRunner` can handle workbench `SessionConfig` shape by creating a compatibility layer or updating the runner to accept a generic config type.

**Files to Create:**
- `src/workbench/lib/workbenchStages.ts` — stage definitions and routing logic for workbench
- `src/workbench/lib/workbenchAgentMap.ts` — maps stage IDs to AgentFn implementations

**Files to Modify:**
- `src/workbench/lib/pipeline.ts` — make stage definitions configurable, add workbench compatibility
- `src/ui/components/TipInput.tsx` — replace direct calls with runner execution
- `src/ui/components/WikiQuery.tsx` — replace direct calls with runner execution
- `src/ui/components/WikiLint.tsx` — replace direct calls with runner execution

**Key Implementation Notes:**
- The `PipelineRunner` constructor should accept a `stageDefinitions` parameter. If not provided, it falls back to newsroom stages for backward compatibility.
- `runFromStage()` must understand workbench stage IDs.
- The synthesis loop currently lives in `synthesisLoop.ts`. This logic should move into `getNextStage()` routing. `synthesisLoop.ts` can be deleted once its logic is absorbed by the runner.
- `TipInput.tsx` should instantiate a `PipelineRunner` with workbench stages at the start of a tip flow and call `executeStage()` for each phase.
- The UI should display the current stage name, icon, and status from the runner's stage records.

**Acceptance Criteria:**
- [ ] `PipelineRunner` accepts configurable stage definitions.
- [ ] Workbench stage definitions exist for all Tip Router and Pre-Digestor stages.
- [ ] `getNextStage()` correctly routes `audit → rewrite → audit` loops based on metadata.
- [ ] `TipInput.tsx` executes the full tip flow through `PipelineRunner`.
- [ ] `WikiQuery.tsx` executes queries through `PipelineRunner`.
- [ ] `WikiLint.tsx` executes lint through `PipelineRunner`.
- [ ] `runFromStage()` works for workbench stages (test: resume from `research` after `decompose` completes).
- [ ] All existing tests pass.
