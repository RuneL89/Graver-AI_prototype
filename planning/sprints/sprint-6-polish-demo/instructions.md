# Sprint 6: Polish and Demo Preparation

## Objective
Refine the UI, handle edge cases, and prepare a repeatable demo scenario.

## FRD Requirements Covered
- **NFR-1 Standalone Operation:** Runs entirely in a modern web browser. No server required.
- **NFR-3 Observability:** Every agent writes reasoning, prompt, and output to structured files. Human can inspect any intermediate file.
- **Explicit Boundaries (Section 5):** System does not write finished articles, make editorial decisions, or replace human review.

## Scope
- Error handling for failed API calls, empty search results, and unsupported file types.
- Loading states and progress indicators.
- Demo data set: a sample tip and sample document for consistent demonstration.
- Code cleanup and final `README.md` for the repository.

## Files to Create / Modify

| File | Action | Purpose |
|---|---|---|
| `src/ui/components/` | Modify | Add loading states, error banners, retry buttons |
| `demo/` | Create | Sample tip and sample document for testing |
| `README.md` | Create | Project overview, setup instructions, and demo guide |

## Key Implementation Notes
- **Error handling:** All API failures must show user-friendly errors with retry options. Empty search results handled gracefully (marked as gaps in the memo). Unsupported file types rejected with clear messaging.
- **Loading states:** Progress indicators for each pipeline stage so the journalist knows what is happening.
- **Demo data:** Produce a consistent, compelling output in under 3 minutes.
- **README:** Must include setup steps and a demo script.
- **No console errors:** During normal operation.
- **Boundaries reminder:** The UI should make clear that the system generates research memos, not finished articles. Human review is always required.

## Acceptance Criteria
- [ ] All API failures show user-friendly errors with retry options.
- [ ] Empty search results are handled gracefully (marked as gaps in the memo).
- [ ] Demo data produces a consistent, compelling output in under 3 minutes.
- [ ] README includes setup steps and a demo script.
- [ ] No console errors during normal operation.

## Post-Approval Step
- [ ] Finalize `README.md` with complete setup instructions, demo guide, error handling notes, and final architecture overview.

## Review Gate
**This is the final approval before the implementation is considered complete.**

User runs the demo scenario independently and confirms it is ready to show to Projekt Y.

---

## Approval Rule

> **This sprint must only be marked as Done in `SPRINT_INSTRUCTIONS.md` after the user has explicitly approved it.**
>
> If all acceptance criteria have been developed and verified but the user has not yet given explicit approval, the sprint status must be set to **⏳ Waiting for user approval**. It must not be set to **✅ Done** without the user's explicit confirmation.
