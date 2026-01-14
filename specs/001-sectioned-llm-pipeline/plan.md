# Implementation Plan: Sectioned LLM Generation Pipeline

**Branch**: `001-sectioned-llm-pipeline` | **Date**: 2026-01-02 | **Spec**: `specs/001-sectioned-llm-pipeline/spec.md`  
**Input**: Feature specification from `specs/001-sectioned-llm-pipeline/spec.md`

## Summary

Evolve the current single-tool landing page generation into a **step-by-step pipeline** that produces explicit, UI-visible “Writing …” steps for layout planning, entities, sections, and pages, then **commits** the result to storage and refreshes the preview after the assistant finishes.

Key product decision from clarification: **one site per chat session**, and each new generation run **overwrites** the site’s pages/sections while preserving run history.

## Technical Context

**Language/Version**: TypeScript 5.8.x, React 19.1.0, Next.js 15.6.0-canary.59  
**Primary Dependencies**: Vercel AI SDK (`ai`, `@ai-sdk/react`, `@ai-sdk/openai`), Zod, Drizzle ORM  
**Storage**: PostgreSQL (via Drizzle ORM)  
**Testing**: No automated test harness currently configured (manual verification for this feature)  
**Target Platform**: Web (Next.js server + browser client)  
**Project Type**: Web application (single repo, App Router)  
**Performance Goals**: Maintain responsive streaming UI; first visible progress update within a few seconds for typical runs  
**Constraints**: No code comments in source; avoid logging sensitive data; preserve existing file structure conventions; authenticated access required for generation/preview APIs  
**Scale/Scope**: Per-user interactive generation sessions; persistence is already in place for single-page HTML versions via `landing_page_versions`

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **File Structure Preservation**: PASS (planned changes stay within `app/api/*`, `components/*`, `lib/*`, and `lib/db/*` for schema/migrations).
- **No Code Comments**: PASS (implementation must not introduce inline code comments; documentation stays under `specs/`).
- **No sensitive data in logs**: PASS (ensure generation payloads/code are not logged; only safe errors/codes).
- **Least privilege + explicit auth**: PASS (reuse existing `getUser()` checks in new APIs).
- **No unrelated refactors**: PASS (feature is additive; keep current `generate_landing_page_code` path working until migration is complete).

## Project Structure

### Documentation (this feature)

```text
specs/001-sectioned-llm-pipeline/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── openapi.yaml
└── tasks.md
```

### Source Code (repository root)

```text
app/
├── api/
│   ├── chat/route.ts
│   ├── preview/[sessionId]/[versionNumber]/route.ts
│   └── generation/
│       ├── commit/route.ts
│       ├── site/[siteId]/route.ts
│       └── preview/[siteId]/[pageSlug]/route.ts
components/
├── chat/
│   ├── chat.tsx
│   ├── message-item.tsx
│   └── tool-call-indicator.tsx
├── preview/
│   └── preview-panel.tsx
lib/
├── code-generation/
│   ├── generate-code.ts
│   └── types.ts
├── preview/
│   └── update-preview.ts
└── db/
    ├── schema.ts
    └── queries.ts
```

**Structure Decision**: Use the existing Next.js App Router layout. Add generation persistence APIs under `app/api/generation/*` and add DB tables in `lib/db/schema.ts` with corresponding query helpers in `lib/db/queries.ts`.

## Complexity Tracking

No constitution violations expected for this feature.
