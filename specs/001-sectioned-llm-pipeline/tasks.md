# Tasks: Sectioned LLM Generation Pipeline

**Input**: Design documents from `specs/001-sectioned-llm-pipeline/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/openapi.yaml`, `quickstart.md`  
**Tests**: Not requested in spec (manual verification only)

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the minimal file scaffolding so work can proceed cleanly within the existing repo structure.

- [ ] T001 Create new API route folders for generation in `app/api/generation/` (commit, site, preview)
- [ ] T002 Create new generation domain folder in `lib/generation/` for shared types and validation

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared primitives required by all user stories (persistence model + shared types + request validation).

**⚠️ CRITICAL**: No user story work should merge until this phase is complete.

- [ ] T003 Update database schema with site/run/step tables in `lib/db/schema.ts`
- [ ] T004 Add DB query helpers for new tables in `lib/db/queries.ts` (create/get site by session, overwrite pages/sections, create run/steps)
- [ ] T005 [P] Add shared generation types (run, step, page, section) in `lib/generation/types.ts`
- [ ] T006 [P] Add request validation schemas for commit payload in `lib/generation/schemas.ts`
- [ ] T007 Add preview update payload support for site/page preview in `lib/preview/update-preview.ts` (keep existing version-based preview support)

**Checkpoint**: Foundation ready (schema + queries + shared types + validation).

---

## Phase 3: User Story 1 - Step-by-step “Writing …” generation with post-response commit (Priority: P1) 🎯 MVP

**Goal**: The assistant produces multiple explicit tool calls (layout plan → entities → sections → pages), each visible in the UI as “Writing …”, then after the assistant finishes the message the client commits the artifacts and refreshes preview.

**Independent Test**: Ask for a landing page; observe multiple “Writing …” steps; after message completion the preview updates from committed artifacts and the assistant ends with a short summary.

- [ ] T008 [US1] Add minimal prompt building blocks (layout plan/entities/section/page) in `prompts/tool-generate-code-prompt.ts`
- [ ] T009 [US1] Implement AI helpers for layout plan + entities/section/page generation in `lib/code-generation/sectioned-generation.ts`
- [ ] T010 [US1] Define new AI tools (layout_plan, entities, write_section, write_page) in `lib/code-generation/sectioned-tools.ts`
- [ ] T011 [US1] Register new tools in chat route in `app/api/chat/route.ts` (keep existing `generate_landing_page_code` tool working)
- [ ] T012 [US1] Update tool call UI labeling to show “Writing <filePath>” per tool call in `components/chat/message-item.tsx`
- [ ] T013 [US1] Update tool call indicator mapping to display file paths from tool call payload in `components/chat/tool-call-indicator.tsx`
- [ ] T014 [US1] Collect tool outputs into an in-memory “pending run” in `components/chat/chat.tsx` during streaming (include layout plan JSON)
- [ ] T015 [US1] Add commit endpoint that persists a completed run and overwrites pages/sections for the session site in `app/api/generation/commit/route.ts`
- [ ] T016 [US1] Call commit endpoint only after assistant message completes, then update preview to returned previewUrl in `components/chat/chat.tsx`
- [ ] T017 [US1] Ensure preview loading state shows during generation and clears on commit in `components/preview/preview-panel.tsx`
- [ ] T018 [US1] Manual verify US1 flow per `specs/001-sectioned-llm-pipeline/quickstart.md`

---

## Phase 4: User Story 2 - Multipage sites (Priority: P2)

**Goal**: The pipeline supports multiple pages and users can view each generated page as part of the same site.

**Independent Test**: Request a site with at least 2 pages; after commit, user can switch between pages and preview updates accordingly.

- [ ] T019 [US2] Implement site metadata endpoint (pages list) in `app/api/generation/site/[siteId]/route.ts`
- [ ] T020 [US2] Implement multipage preview endpoint in `app/api/generation/preview/[siteId]/[pageSlug]/route.ts` (renders a full HTML document for the selected page)
- [ ] T021 [US2] Extend commit response handling to store siteId/defaultPageSlug in `components/chat/chat.tsx`
- [ ] T022 [US2] Add page selector UI and wire iframe URL switching in `components/preview/preview-panel.tsx`
- [ ] T023 [US2] Manual verify multipage navigation per `specs/001-sectioned-llm-pipeline/quickstart.md`

---

## Phase 5: User Story 3 - Graceful partial failures (Priority: P3)

**Goal**: If one step fails, the UI marks it as failed and successful steps are retained; the system stores failure information without corrupting prior outputs.

**Independent Test**: Simulate a failed tool call; UI marks that step as failed; successful steps remain visible; commit endpoint safely handles missing/failed steps.

- [ ] T024 [US3] Capture tool call failures into pending run state in `components/chat/chat.tsx` (store status + error message)
- [ ] T025 [US3] Render failed tool steps distinctly in `components/chat/tool-call-indicator.tsx` (non-success state without adding code comments)
- [ ] T026 [US3] Persist run steps with status and errors in `app/api/generation/commit/route.ts` using helpers from `lib/db/queries.ts`
- [ ] T027 [US3] Ensure commit rejects rendering update when required artifacts are missing, with actionable error response in `app/api/generation/commit/route.ts`
- [ ] T028 [US3] Manual verify failure handling and recovery UX per `specs/001-sectioned-llm-pipeline/spec.md` edge cases

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Harden security/robustness and keep the implementation aligned with repo conventions.

- [ ] T029 [P] Audit for sensitive logging and remove/replace logs in `app/api/generation/commit/route.ts`
- [ ] T030 [P] Audit auth checks are present for new routes in `app/api/generation/site/[siteId]/route.ts` and `app/api/generation/preview/[siteId]/[pageSlug]/route.ts`
- [ ] T031 Ensure “one site per chat session” overwrite behavior is enforced at the DB/query layer in `lib/db/queries.ts`
- [ ] T032 Run the manual quickstart end-to-end and confirm acceptance scenarios in `specs/001-sectioned-llm-pipeline/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)** → blocks Phase 2 work organization
- **Phase 2 (Foundational)** → BLOCKS all user stories
- **Phase 3 (US1)** → MVP; should be completed before US2/US3 for stable integration points
- **Phase 4 (US2)** → depends on US1 commit flow + preview update shape
- **Phase 5 (US3)** → depends on US1 tool aggregation + commit endpoint
- **Phase 6 (Polish)** → after desired stories are done

### User Story Dependencies

- **US1 (P1)**: depends on Phase 2
- **US2 (P2)**: depends on US1 (commit + preview integration)
- **US3 (P3)**: depends on US1 (step aggregation) and Phase 2 persistence primitives

### Parallel Opportunities

- **Phase 2**: T005 and T006 can run in parallel.
- **Phase 6**: T029 and T030 can run in parallel.

---

## Parallel Example: Phase 2

```bash
Task: "Add shared generation types in lib/generation/types.ts"
Task: "Add request validation schemas in lib/generation/schemas.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 + Phase 2
2. Complete Phase 3 (US1) end-to-end
3. Validate via `specs/001-sectioned-llm-pipeline/quickstart.md`

### Incremental Delivery

1. Add US2 multipage navigation
2. Add US3 failure states + persistence of failures
3. Finish with polish tasks
