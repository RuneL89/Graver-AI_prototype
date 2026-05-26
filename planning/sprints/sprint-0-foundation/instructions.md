# Sprint 0: Foundation and Infrastructure Reuse

## Objective
Establish the project scaffold by cloning the reusable orchestration layer from the AI Newsroom `Web_version` branch and creating the new directory structure for the workbench.

## FRD Requirements Covered
- **NFR-1 Standalone Operation:** The prototype shall run entirely in a modern web browser. No server, database, or cloud infrastructure is required beyond external API calls.
- **NFR-2 Reusability:** The orchestration layer (pipeline runner, agent interface, LLM adapter, file manager, session config) shall be reused from the existing AI Newsroom codebase with minimal modification.
- **NFR-3 Observability:** Every agent shall write its reasoning, prompt, and output to structured files in browser storage.

## Scope
- Reuse without modification: `pipeline.ts`, `llmAdapter.ts`, `fileManager.ts`, `sessionConfig.ts`, `types.ts`, `apiConfig.ts`, and the `AgentFn` interface pattern.
- Create new top-level directories for the workbench modules.
- Update `package.json` and build configuration if needed.
- Create a `PROJECT.md` at root documenting which AI Newsroom files are reused and which are new.

## Files to Create

### New Files
| File | Purpose |
|---|---|
| `src/workbench/types.ts` | Workbench-specific types (Tip, WikiPage, EvidenceFinding, etc.) |
| `src/workbench/config.ts` | Workbench session configuration defaults |
| `PROJECT.md` | Reuse map and architecture notes |

### Files to Reuse
Copy from AI Newsroom `Web_version` branch at `https://github.com/RuneL89/Ai-newsroom/tree/Web_version`:

| Source Path | Destination Path |
|---|---|
| `src/lib/pipeline.ts` | `src/workbench/lib/pipeline.ts` |
| `src/lib/llmAdapter.ts` | `src/workbench/lib/llmAdapter.ts` |
| `src/lib/fileManager.ts` | `src/workbench/lib/fileManager.ts` |
| `src/lib/sessionConfig.ts` | `src/workbench/lib/sessionConfig.ts` |
| `src/lib/apiConfig.ts` | `src/workbench/lib/apiConfig.ts` |
| `src/types.ts` | `src/workbench/types-shared.ts` |

## Key Implementation Notes
- Only adjust import paths when copying reused files. Do not modify logic.
- The `AgentFn` interface pattern must remain intact — all future agents implement this interface.
- Build tooling (Vite, TypeScript, etc.) should be carried over from the AI Newsroom project.
- Ensure IndexedDB is accessible as the browser storage layer for the file manager.

## Acceptance Criteria
- [ ] Project builds without errors.
- [ ] All reused files are in place and unmodified except for import path adjustments.
- [ ] `PROJECT.md` lists every reused file with its original source path.
- [ ] A hello-world agent can execute through the pipeline runner and write a file to IndexedDB.

## Post-Approval Step
- [ ] Update `README.md` to reflect the completed foundation: project scaffold, reused files, build instructions, and hello-world verification.

## Review Gate
**Do not proceed to Sprint 1 without explicit user approval.**

User must inspect the directory structure and confirm the reuse plan is correct before Sprint 1 begins.

---

## Approval Rule

> **This sprint must only be marked as Done in `SPRINT_INSTRUCTIONS.md` after the user has explicitly approved it.**
>
> If all acceptance criteria have been developed and verified but the user has not yet given explicit approval, the sprint status must be set to **⏳ Waiting for user approval**. It must not be set to **✅ Done** without the user's explicit confirmation.
