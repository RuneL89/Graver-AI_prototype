# Sprint 4: SessionConfig Unification and Dead Code Removal

**Objective:** Reconcile the workbench and newsroom configuration systems, remove dead code, and clean up type definitions.

**Scope:**
- **SessionConfig:** Create a unified `SessionConfig` type that satisfies both newsroom and workbench needs, or split them cleanly with a base interface. The `PipelineRunner` should accept a generic config type.
- **Remove newsroom baggage from `types-shared.ts`:** Delete or deprecate unused fields (`MusicSuite`, `Voice`, `BiasPosition`, `ContinentCode`, `NewsTheme`, `NewsTopic`, `Geography`, `Content`, `PodcastConfig`, `AudioConfig`). Keep only the types used by the orchestration layer (`AgentFn`, `AgentContext`, `AgentOutput`, `StageRecord`, `StageDefinition`, `AuditResult`, etc.).
- **Remove dead code from `fileManager.ts`:** Delete `writeSegment`, `readSegment`, `writeAudioFile`, `appendAudioChunk`, `getPodcastPlaybackUrl`, and any other audio/podcast-specific functions. Keep only the generic IndexedDB wrapper (`dbGet`, `dbSet`, `dbDelete`, `dbKeys`, `listFiles`, `deleteAllFiles`).
- **Update `sessionConfig.ts`:** Remove newsroom-specific serialization logic. Keep only the generic session save/load pattern.
- **Update `PROJECT.md`:** Document which newsroom files were modified and why.

**Files to Modify:**
- `src/workbench/types-shared.ts` — remove newsroom types, keep orchestration types
- `src/workbench/lib/sessionConfig.ts` — remove newsroom serialization
- `src/workbench/lib/fileManager.ts` — remove audio functions
- `src/workbench/lib/pipeline.ts` — accept generic config type
- `PROJECT.md` — document cleanup

**Key Implementation Notes:**
- Be careful not to break the newsroom types if the same file is shared between projects. If the workbench is a separate repo (which it is), you can safely delete newsroom types.
- The `fileManager.ts` audio functions are unused but exported. Check for any imports before deleting.
- If `PipelineRunner` currently types `sessionConfig` as `SessionConfig`, change it to `sessionConfig: any` or a generic `<T>` parameter so both newsroom and workbench configs work.

**Acceptance Criteria:**
- [ ] `types-shared.ts` contains only orchestration-layer types. No newsroom-specific types remain.
- [ ] `fileManager.ts` contains only generic IndexedDB operations. No audio functions remain.
- [ ] `sessionConfig.ts` contains only generic save/load. No newsroom serialization remains.
- [ ] `PipelineRunner` accepts a generic config type.
- [ ] Build passes with zero TypeScript errors.
- [ ] All existing tests pass.
- [ ] `PROJECT.md` is updated with cleanup notes.
