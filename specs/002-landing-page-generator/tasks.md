# Tasks: Landing Page Code Generation Tool

**Input**: Design documents from `/specs/002-landing-page-generator/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: Next.js App Router structure
- Code generation logic: `lib/code-generation/`
- Database schema: `lib/db/schema.ts`
- Database queries: `lib/db/queries.ts`
- API routes: `app/api/chat/route.ts`
- Preview utilities: `lib/preview/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and dependency installation

- [x] T001 Install HTML parser library (node-html-parser) via package manager for code validation and error fixing per research.md
- [x] T002 Create directory structure: lib/code-generation/ directory per plan.md
- [x] T003 Create directory structure: lib/preview/ directory per plan.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 [P] Create TypeScript types in lib/code-generation/types.ts with CodeGenerationResult, CodeGenerationRequest, and related interfaces per contracts/code-generation-tool.md
- [x] T005 [P] Add landing_page_versions table schema to lib/db/schema.ts with id, userId, sessionId, versionNumber, codeContent, createdAt, updatedAt fields per data-model.md
- [x] T006 [P] Add indexes and unique constraint to landing_page_versions table in lib/db/schema.ts for (sessionId, versionNumber) per data-model.md
- [x] T007 [P] Add landingPageVersionsRelations to lib/db/schema.ts with user relationship per data-model.md
- [x] T008 [P] Export LandingPageVersion and NewLandingPageVersion types from lib/db/schema.ts per data-model.md
- [x] T009 Generate database migration for landing_page_versions table using drizzle-kit generate command
- [x] T010 Run database migration for landing_page_versions table using drizzle-kit migrate command
- [x] T011 [P] Create getNextVersionNumber function in lib/db/queries.ts that calculates MAX(version_number) + 1 for a session per data-model.md
- [x] T012 [P] Create getLatestVersion function in lib/db/queries.ts that retrieves most recent version for a session per data-model.md
- [x] T013 [P] Create createLandingPageVersion function in lib/db/queries.ts that inserts new version record per data-model.md
- [x] T014 [P] Create getAllVersionsForSession function in lib/db/queries.ts that retrieves all versions for a session per data-model.md

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Generate Landing Page from Natural Language Request (Priority: P1) 🎯 MVP

**Goal**: Enable users to describe their landing page requirements in natural language through the chat interface, and the system generates website code with styling that matches their description.

**Independent Test**: Can be fully tested by a user typing a request like "Create a landing page for a coffee shop" in the chat, verifying that the system generates website code with appropriate styling, and confirming the code is saved to persistent storage. This delivers the core value of converting natural language into working website code.

### Implementation for User Story 1

- [x] T015 [P] [US1] Create buildCodeGenerationPrompt function in lib/code-generation/generate-code.ts that constructs AI prompt with user request and Tailwind CSS guidelines per research.md
- [x] T016 [P] [US1] Create generateCodeWithAI function in lib/code-generation/generate-code.ts that calls AI service to generate HTML code with Tailwind CSS per FR-002
- [x] T017 [US1] Implement code generation function in lib/code-generation/generate-code.ts that orchestrates prompt building and AI service call per contracts/code-generation-tool.md
- [x] T018 [P] [US1] Create parseAndValidateHTML function in lib/code-generation/fix-code-errors.ts that parses HTML using node-html-parser per research.md
- [x] T019 [P] [US1] Create fixCommonErrors function in lib/code-generation/fix-code-errors.ts that automatically fixes unclosed tags, invalid nesting, and syntax errors per FR-003 and FR-020
- [x] T020 [US1] Implement validateAndFixCode function in lib/code-generation/fix-code-errors.ts that orchestrates parsing, validation, and error fixing per FR-003
- [x] T021 [P] [US1] Create saveCodeToDatabase function in lib/code-generation/save-code.ts that saves generated code to landing_page_versions table per FR-006
- [x] T022 [US1] Implement saveCodeWithRetry function in lib/code-generation/save-code.ts that handles database save with retry logic and in-memory storage on failure per FR-012
- [x] T023 [US1] Create generateLandingPageCodeTool function in lib/code-generation/generate-code.ts using tool() helper from ai package per contracts/code-generation-tool.md
- [x] T024 [US1] Implement tool execute function in lib/code-generation/generate-code.ts that validates input, generates code, fixes errors, determines version, and saves to database per contracts/code-generation-tool.md
- [x] T025 [US1] Add generate_landing_page_code tool to tools object in app/api/chat/route.ts streamText call per contracts/code-generation-tool.md
- [x] T026 [US1] Implement request queue management in app/api/chat/route.ts that queues concurrent requests per user session and processes sequentially per FR-019
- [x] T027 [US1] Implement error handling in lib/code-generation/generate-code.ts that returns structured error responses with retry information per FR-011
- [x] T028 [US1] Add visual feedback in chat when code generation is in progress per FR-016 (handled by existing chat system, verify integration)
- [x] T029 [US1] Verify confirmation messages appear in chat when code generation and saving completes successfully per FR-017

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently - users can request landing page creation and receive generated code saved to database

---

## Phase 4: User Story 2 - Preview Generated Landing Page in Iframe (Priority: P2)

**Goal**: Enable users to view their generated landing page in real-time within the preview panel (iframe) on the right side of the builder interface.

**Independent Test**: Can be tested by generating a landing page, verifying that the preview panel loads the generated code, and confirming that the page renders correctly with all styling applied. This ensures users can see and validate their generated content.

### Implementation for User Story 2

- [x] T030 [P] [US2] Create showPreviewLoader function in lib/preview/update-preview.ts that sends postMessage to preview iframe to display loading indicator per FR-009a
- [x] T031 [US2] Integrate showPreviewLoader call in lib/code-generation/generate-code.ts when code generation starts per FR-009a (client-side integration in components/chat/chat.tsx)
- [x] T032 [P] [US2] Create updatePreviewPanel function in lib/preview/update-preview.ts that sends postMessage to preview iframe per contracts/code-generation-tool.md
- [x] T033 [US2] Integrate updatePreviewPanel call in lib/code-generation/save-code.ts after successful database save per FR-015 (client-side integration in components/chat/chat.tsx)
- [x] T034 [US2] Implement postMessage payload structure in lib/preview/update-preview.ts with type, versionId, versionNumber, and previewUrl fields per contracts/code-generation-tool.md
- [x] T035 [US2] Implement postMessage payload structure for loading state in lib/preview/update-preview.ts with type 'loading' per FR-009a
- [x] T036 [US2] Add error handling in lib/preview/update-preview.ts for postMessage failures that logs errors without blocking save operation per contracts/code-generation-tool.md
- [ ] T037 [US2] Verify preview panel displays loading indicator when code generation starts and only shows preview content once generation completes per FR-009a
- [ ] T038 [US2] Verify preview panel automatically loads and displays most recent version when save completes per FR-009 and SC-004
- [ ] T039 [US2] Verify preview panel updates correctly when multiple landing pages are generated in a session per acceptance scenario 3

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently - code generation works and preview panel displays generated landing pages

---

## Phase 5: User Story 3 - Iteratively Refine Landing Page Through Chat (Priority: P3)

**Goal**: Enable users to request modifications to their landing page through follow-up messages in the chat, and the system generates updated code that incorporates the changes.

**Independent Test**: Can be tested by generating an initial landing page, then sending a follow-up message like "Make the header blue" or "Add a contact form", and verifying that the system generates updated website code that incorporates the requested changes while preserving existing content. This enables iterative design refinement.

### Implementation for User Story 3

- [ ] T040 [US3] Modify buildCodeGenerationPrompt function in lib/code-generation/generate-code.ts to include previous code version when isModification is true per FR-013 and FR-014
- [ ] T041 [US3] Update generateLandingPageCodeTool execute function in lib/code-generation/generate-code.ts to retrieve previous code version from database when isModification is true per FR-013
- [ ] T042 [US3] Implement logic in lib/code-generation/generate-code.ts that detects modification requests and includes previous code in prompt per FR-013
- [ ] T043 [US3] Verify code generation preserves existing structure and content when generating modifications per FR-014
- [ ] T044 [US3] Verify new version number is assigned correctly for modification requests (sequential increment) per FR-008
- [ ] T045 [US3] Verify preview panel updates automatically when modified code is saved per FR-015
- [ ] T046 [US3] Verify chat history shows all generation requests and confirmations in chronological order per acceptance scenario 4

**Checkpoint**: At this point, all three user stories should work independently - users can create landing pages, see previews, and iteratively refine them

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T047 [P] Add rate limiting to code generation requests (10 requests per user per minute) per contracts/code-generation-tool.md
- [ ] T048 [P] Implement code size validation (max 1MB) in lib/code-generation/fix-code-errors.ts per spec assumptions
- [ ] T049 [P] Add logging for code generation operations in lib/code-generation/generate-code.ts for observability
- [ ] T050 [P] Add logging for database save operations in lib/code-generation/save-code.ts for debugging
- [ ] T051 [P] Implement memory cleanup for temporary code storage with timeout (1 hour) per research.md
- [ ] T052 [P] Add input validation for userRequest parameter (non-empty, reasonable length) in lib/code-generation/generate-code.ts
- [ ] T053 [P] Add session ID validation in lib/code-generation/generate-code.ts per data-model.md
- [ ] T054 Verify all error messages are explicit and actionable per constitution
- [ ] T055 Run quickstart.md validation to ensure all user flows work correctly
- [ ] T056 Verify performance meets success criteria (SC-001: <30s generation, SC-004: <2s preview update)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Depends on User Story 1 completion (needs code generation to work before preview can display)
- **User Story 3 (P3)**: Depends on User Story 1 completion (needs code generation and version history)

### Within Each User Story

- Models/types before services
- Services before tool integration
- Core implementation before error handling
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, User Story 1 can start
- User Story 2 can start after User Story 1 completes
- User Story 3 can start after User Story 1 completes
- All Polish tasks marked [P] can run in parallel

---

## Parallel Example: Phase 2 Foundational

```bash
# Launch all foundational tasks together:
Task: "Create TypeScript types in lib/code-generation/types.ts"
Task: "Add landing_page_versions table schema to lib/db/schema.ts"
Task: "Add indexes and unique constraint to landing_page_versions table"
Task: "Add landingPageVersionsRelations to lib/db/schema.ts"
Task: "Export LandingPageVersion and NewLandingPageVersion types"
Task: "Create getNextVersionNumber function in lib/db/queries.ts"
Task: "Create getLatestVersion function in lib/db/queries.ts"
Task: "Create createLandingPageVersion function in lib/db/queries.ts"
Task: "Create getAllVersionsForSession function in lib/db/queries.ts"
```

---

## Parallel Example: User Story 1

```bash
# Launch all parallel tasks for User Story 1 together:
Task: "Create buildCodeGenerationPrompt function in lib/code-generation/generate-code.ts"
Task: "Create generateCodeWithAI function in lib/code-generation/generate-code.ts"
Task: "Create parseAndValidateHTML function in lib/code-generation/fix-code-errors.ts"
Task: "Create fixCommonErrors function in lib/code-generation/fix-code-errors.ts"
Task: "Create saveCodeToDatabase function in lib/code-generation/save-code.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (core code generation)
   - Developer B: Can prepare User Story 2 (preview integration) but needs US1 to test
   - Developer C: Can prepare User Story 3 (iterative refinement) but needs US1 to test
3. Stories complete and integrate sequentially (US1 → US2 → US3)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- User Story 2 and 3 depend on User Story 1 for testing, but can be prepared in parallel
