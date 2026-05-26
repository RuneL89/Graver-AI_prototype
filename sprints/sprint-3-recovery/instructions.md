# Sprint 3: Resume, Abort, and Recovery

**Objective:** Enable pause/resume, user abort, and network stall recovery across the workbench pipeline.

**Scope:**
- **Resume:** Ensure `runFromStage()` works end-to-end for workbench. Test resuming from `research`, `synthesize`, and `audit` stages. Preserve prior stage outputs in IndexedDB and reset only downstream stages.
- **Abort:** Wire the `AbortController` from `PipelineRunner` through every workbench agent. Agents must check `signal.aborted` before and during LLM calls. LLM adapters must accept and respect the abort signal.
- **Stall Recovery:** Implement round-based stall recovery in `researchLoop.ts` (or its runner equivalent). Sub-claims that hit 429 or timeout mark themselves `stalled`. After the initial wave settles, all stalled sub-claims retry together. Maximum 3 retry waves per sub-claim.
- **Notifications:** Wire `PipelineNotifications` into the workbench flow. Show browser notifications when long-running stages complete or when the pipeline needs user attention (e.g., audit rejected, waiting for rewrite).
- **Pipeline Service Status:** Integrate `PipelineService` status checks into the workbench UI.

**Files to Create:**
- `src/workbench/lib/researchStallRecovery.ts` — round-based stall recovery coordinator

**Files to Modify:**
- `src/workbench/lib/pipeline.ts` — ensure abort signal propagates to agent context
- `src/workbench/lib/llmAdapter.ts` — accept abort signal in `streamLLM` and `callLLM`
- `src/workbench/lib/apiConfig.ts` — pass abort signal to fetch calls
- `src/workbench/tiprouter/researchLoop.ts` — add stall detection and round-based retry
- `src/ui/components/TipInput.tsx` — add cancel button that triggers abort
- `src/ui/components/ResearchMonitor.tsx` — show stall/retry status per sub-claim

**Key Implementation Notes:**
- Abort signal must propagate: UI button → `PipelineRunner.abort()` → agent checks `ctx.abortSignal` → `streamLLM` passes signal to fetch.
- Stall recovery should not block non-stalled sub-claims. The initial `Promise.allSettled` wave completes, then a second wave retries only stalled items.
- Each sub-claim tracks its own stall wave count. After 3 waves, the sub-claim is marked `failed` and the pipeline continues with partial evidence.
- Notifications should only fire when the tab is not active, to avoid spam.

**Acceptance Criteria:**
- [ ] User can click "Cancel" during any stage and all active LLM calls terminate cleanly.
- [ ] Resuming from `research` stage preserves the completed `decompose` output and re-runs research only.
- [ ] Resuming from `audit` stage preserves synthesis and re-runs audit only.
- [ ] A simulated 429 error on one sub-claim triggers stall recovery; the sub-claim retries after the wave completes.
- [ ] After 3 failed retry waves, the sub-claim is marked failed and the pipeline continues.
- [ ] Browser notification fires when the pipeline completes while the tab is inactive.
- [ ] All existing tests pass; new tests cover abort, resume, and stall recovery.
