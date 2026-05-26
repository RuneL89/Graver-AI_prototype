# LLM Wiki Schema

This document teaches the LLM how to maintain the investigative wiki.

## Wiki Structure

```
wiki/
├── index.md          (content-oriented catalog of all pages)
├── log.md            (append-only chronological record)
├── schema.md         (this file: structure, conventions, workflows)
├── sources/          (per-document summary pages)
├── entities/         (named people, organizations, locations)
├── concepts/         (themes, legal terms, financial instruments)
└── findings/         (extracted claims with citations)
```

## Page Format

Every wiki page is a plain Markdown file.

- Use `[[Page Name]]` for internal wikilinks. The path is derived from the page name by lowercasing and replacing spaces with hyphens.
- Include a YAML frontmatter block when useful:
  ```yaml
  ---
  tags: [entity, person]
  updated: 2026-05-26
  ---
  ```
- Start each page with an H1 heading that matches the page title.
- Use H2 and H3 for subsections.

## Citation Anchors

All factual claims must include citation anchors pointing back to the raw source:

- Format: `(SourceDocumentName lines X-Y)` or `(SourceDocumentName page N)`
- Place the anchor immediately after the claim, before the period.
- Example: `Alice Smith received $50,000 in consulting fees (Contract_A lines 12-15).`

## Ingest Workflow

When a new document is ingested, perform these steps in order:

1. **Write `sources/{document}.md`** — Summarize the document: scope, key themes, notable people/orgs/locations, important claims. Use citation anchors.
2. **Update `index.md`** — Content-oriented catalog. List every page with a one-line summary, grouped by category (Sources, Entities, Concepts, Findings, Log).
3. **Create/update `entities/{name}.md`** — One page per named person, organization, or location. Include biographical or descriptive info and cite sources.
4. **Create/update `concepts/{name}.md`** — One page per theme, term, or concept. Define it and link to related concepts and findings.
5. **Create/update `findings/{name}.md`** — One page per significant claim or fact. State the claim, list supporting evidence with citations, note confidence level.
6. **Append to `log.md`** — Chronological entry: `## [ISO-date] ingest | Document Name`. Briefly list pages created or updated.

Each step reads the existing wiki (if any) and the raw source, then writes updates.

## Query Workflow

When a user asks a question:

1. Read `index.md` to understand what pages exist.
2. Identify the most relevant pages by title and summary.
3. Read those pages in full.
4. Synthesize a concise answer with inline citations.
5. If the answer spans multiple pages, mention them.

## Lint Workflow

When auditing the wiki, check for:

1. **Contradictions** — Claims in different pages that cannot both be true.
2. **Orphans** — Pages with no incoming `[[wikilink]]` references from other pages.
3. **Stale claims** — Claims whose citation anchors reference sources that no longer exist or have been superseded.
4. **Missing cross-references** — Pages that discuss the same entity or concept but do not link to each other.
5. **Empty pages** — Pages with only a heading and no substantive content.

Report each issue with severity (error / warning / info), affected pages, and a suggested fix.

## Conventions

- Page filenames use lowercase, hyphens for spaces, and `.md` extension.
- Entity names in filenames: `alice-smith.md`, `acme-corp.md`.
- Concept names in filenames: `money-laundering.md`, `shell-company.md`.
- Finding names in filenames: `consulting-fees-2024.md`, `offshore-account-link.md`.
- Keep pages focused. If a page grows beyond ~500 words, split it into sub-pages.
- The `index.md` is the single source of truth for what exists in the wiki.
- The `log.md` is append-only; never edit past entries.
