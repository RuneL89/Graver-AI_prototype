# Sprint 6: README Documentation

**Objective:** Write a comprehensive README that serves three audiences: casual visitors, mid-level developers, and senior developers.

**Structure:**

## Section 1: Introduction (Elevator Pitch)

A 3–4 sentence description of what the app is and why it exists. Written for anyone who lands on the repository. Include:
- What problem it solves (investigative journalism research acceleration)
- Who it is for (journalists, researchers, newsrooms)
- What makes it different (browser-only, agentic pipeline, LLM wiki for large documents)
- One-line tech stack summary

## Section 2: Functional Architecture (End-User Friendly)

A plain-English description of how the app works from a user's perspective. No code, no technical jargon. Include:
- The two modules (Tip Router and Document Pre-Digestor) and what each does
- How a typical investigation flows: enter a tip, the system researches it, audits the evidence, produces a memo
- How the wiki works: upload documents, query them, compound new documents over time
- What the human does versus what the system does
- A simple diagram or flow description

## Section 3: Agent Flow and Orchestration (Mid-Level Developer)

A step-by-step technical walkthrough of the pipeline. Enough detail for a developer with 2–3 years of experience to understand the flow without reading every file. Include:
- The stage sequence: decompose → research → synthesize → audit → rewrite → assemble
- How the audit gate works: mechanical validation first, then qualitative LLM audit
- How the rejection loop works: what triggers a rewrite, what the writer does, how many iterations are allowed
- How parallel research works: WebResearcher and WikiQuerier running simultaneously per sub-claim
- How stall recovery works: what happens when a sub-claim hits a rate limit
- How the Document Pre-Digestor works: three-layer architecture (raw sources, wiki, schema), three operations (ingest, query, lint)
- Key data structures passed between stages (`research_plan.json`, `external_evidence.json`, `synthesis.json`, `AuditResult`)
- The role of the `PipelineRunner` state machine

## Section 4: Technical Architecture (Senior Developer)

A deep-dive into the codebase. Enough detail for a senior developer to understand the full system by reading this section alone. Include:
- **Directory structure** with explanation of every top-level folder
- **Orchestration layer:** `PipelineRunner`, `AgentFn` interface, `AgentContext`, metadata-driven routing, `getNextStage()`, `runFromStage()`
- **LLM Adapter:** cross-provider abstraction, self-healing parameter fixes, model family detection
- **File Manager:** IndexedDB wrapper, namespacing by session and wiki ID
- **Agent architecture:** how agents are registered, how they report status, how `onUpdate` and `onReasoningChunk` work
- **Session management:** how state is persisted, how resume works, how the abort controller propagates
- **The two-layer audit pattern:** why mechanical validation runs before LLM audit, performance implications
- **Wiki architecture:** chunking strategy, citation anchors, compounding updates, the schema document pattern
- **Stall recovery:** round-based retry, per-sub-claim attempt caps, failure handling
- **Prompt logging:** how prompts are captured, stored, and displayed
- **UI architecture:** React component hierarchy, event subscription pattern, real-time streaming

## Section 5: Project Structure

A tree view of the repository with a one-line description of every folder and key file. Include:
- `src/workbench/lib/` — orchestration infrastructure
- `src/workbench/tiprouter/` — Tip Router agents
- `src/workbench/predigestor/` — Document Pre-Digestor agents
- `src/ui/components/` — React UI components
- `src/test/` — test suite
- `planning/` — FRD and implementation plans
- Root-level config files (`vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, etc.)

---

## Files to Create/Modify

- `README.md` (root) — full rewrite following the 5-section structure above

---

## Acceptance Criteria

- [ ] Section 1 is a compelling elevator pitch understandable by non-technical readers.
- [ ] Section 2 explains the user-facing flow without code.
- [ ] Section 3 explains the agent pipeline, audit loop, and parallel research clearly enough for a mid-level developer to implement a similar pattern.
- [ ] Section 4 explains the full technical architecture deeply enough for a senior developer to onboard without reading every file.
- [ ] Section 5 lists every folder and key file with accurate descriptions.
- [ ] No emojis in the README. Lucide icon names are used where UI elements are referenced.
- [ ] All external references (Karpathy gist, AI Newsroom repo) are accurate and linked.
