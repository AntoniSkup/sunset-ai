# Tasks: Builder Chat Component

**Input**: Design documents from `/specs/001-builder-chat/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: Next.js App Router structure
- Components: `components/chat/`
- API routes: `app/api/chat/`
- Types/utilities: `lib/chat/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and dependency installation

- [x] T001 Install Vercel AI SDK package (ai) via package manager
- [x] T002 Install React virtualization library (@tanstack/react-virtual) via package manager
- [x] T003 Install markdown rendering library (react-markdown) via package manager
- [x] T004 Create directory structure: components/chat/ directory
- [x] T005 Create directory structure: lib/chat/ directory

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 [P] Create TypeScript types in lib/chat/types.ts with MessageRole type and ChatMessage interface per data-model.md
- [x] T007 Create API route structure in app/api/chat/route.ts with POST handler skeleton
- [x] T008 Implement authentication check in app/api/chat/route.ts using existing session middleware

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Send Message and Receive Streaming Response (Priority: P1) 🎯 MVP

**Goal**: Enable users to type messages and receive real-time streaming AI responses in the chat interface

**Independent Test**: Open the chat interface, type a message describing a website request, submit it, and verify that a streaming AI response appears in real-time. This delivers the primary value of natural language interaction with the AI builder.

### Implementation for User Story 1

- [x] T009 [US1] Implement POST handler in app/api/chat/route.ts with Vercel AI SDK streamText function for LLM streaming per contracts/chat-api.md
- [x] T010 [US1] Implement error handling in app/api/chat/route.ts for authentication, invalid messages, and AI service errors per contracts/chat-api.md
- [x] T011 [P] [US1] Create welcome-message.tsx component in components/chat/welcome-message.tsx displaying example prompts or instructions per FR-013
- [x] T012 [P] [US1] Create message-item.tsx component in components/chat/message-item.tsx to display individual messages with role-based styling per FR-005
- [x] T013 [P] [US1] Create chat-input.tsx component in components/chat/chat-input.tsx with text input field and submit button per FR-001 and FR-002
- [x] T014 [US1] Implement input field disable logic in components/chat/chat-input.tsx that disables input when isLoading is true per FR-012
- [x] T015 [US1] Create chat.tsx main component in components/chat/chat.tsx using useChat hook from Vercel AI SDK per research.md
- [x] T016 [US1] Integrate welcome-message.tsx in components/chat/chat.tsx to show when messages array is empty per FR-013
- [x] T017 [US1] Integrate chat-input.tsx in components/chat/chat.tsx connecting input, handleSubmit, and isLoading props from useChat hook
- [x] T018 [US1] Implement message display in components/chat/chat.tsx rendering messages array from useChat hook in chronological order per FR-005 and FR-006
- [x] T019 [US1] Add markdown rendering support in components/chat/message-item.tsx using react-markdown for message content per research.md
- [x] T020 [US1] Implement visual loading indicator in components/chat/chat.tsx showing when AI is processing request per FR-010

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently - users can send messages and see streaming responses

---

## Phase 4: User Story 2 - Access Message History with Performance (Priority: P2)

**Goal**: Enable users to scroll through conversation history efficiently even with 200+ messages, maintaining smooth performance

**Independent Test**: Generate a conversation with 100+ messages, then scroll through the entire message history. The interface should remain responsive with smooth scrolling, no visible lag, and all messages remain accessible. This ensures users can review their conversation history regardless of length.

### Implementation for User Story 2

- [x] T021 [US2] Create message-list.tsx component in components/chat/message-list.tsx with virtualization setup using @tanstack/react-virtual per research.md
- [x] T022 [US2] Implement virtualized message rendering in components/chat/message-list.tsx rendering only visible messages plus buffer per FR-008
- [x] T023 [US2] Implement scroll position preservation logic in components/chat/message-list.tsx maintaining position during streaming updates unless user at bottom per FR-009
- [x] T024 [US2] Integrate message-list.tsx in components/chat/chat.tsx replacing direct message rendering with virtualized list
- [x] T025 [US2] Optimize message-item.tsx component in components/chat/message-item.tsx with React.memo for performance with large message lists
- [x] T026 [US2] Verify scroll performance maintains 60 FPS with 200+ messages in components/chat/message-list.tsx per SC-004

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently - chat has streaming responses and efficient message history scrolling

---

## Phase 5: Error Handling & Retry

**Purpose**: Implement error handling with retry functionality per clarifications and FR-011, FR-011a, FR-011b

- [x] T027 Create error-message.tsx component in components/chat/error-message.tsx displaying error message with retry button per FR-011a and FR-011b
- [x] T028 Implement error message display in components/chat/chat.tsx showing errors from useChat hook as messages in chat history per FR-011a
- [x] T029 Implement retry functionality in components/chat/error-message.tsx allowing users to retry failed message submissions per FR-011b
- [x] T030 Integrate error-message.tsx in components/chat/message-item.tsx to render error role messages with retry button
- [x] T031 Ensure manual retry only (no auto-retry) in components/chat/error-message.tsx per clarification session 2025-12-25

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T032 [P] Add proper styling to components/chat/chat.tsx using Tailwind CSS and shadcn/ui components per constitution
- [x] T033 [P] Add proper styling to components/chat/message-item.tsx with clear distinction between user and assistant messages per FR-005
- [x] T034 [P] Add proper styling to components/chat/chat-input.tsx using shadcn/ui Input and Button components
- [x] T035 [P] Add proper styling to components/chat/welcome-message.tsx with example prompts styled appropriately
- [x] T036 [P] Add proper styling to components/chat/error-message.tsx with error state styling and retry button
- [x] T037 Verify all components follow file structure preservation per constitution (components/chat/, lib/chat/, app/api/chat/)
- [x] T038 Verify all code is self-documenting with no comments per constitution principle II
- [x] T039 Validate performance targets: <100ms message display (SC-001), <1s streaming start (SC-002), 60 FPS scrolling (SC-004)
- [x] T040 Test error handling scenarios: network interruptions, streaming failures, invalid messages per edge cases
- [x] T041 Test empty state: verify welcome message displays when no messages exist per FR-013
- [x] T042 Test input blocking: verify input disabled during streaming per FR-012
- [x] T043 Test message history: verify messages display in chronological order per FR-005 and FR-006
- [x] T044 Test streaming behavior: verify smooth updates without visible delays per SC-003

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User Story 1 (Phase 3) can start after Foundational
  - User Story 2 (Phase 4) depends on User Story 1 for message display foundation
- **Error Handling (Phase 5)**: Depends on User Story 1 completion
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Depends on User Story 1 - Requires message display infrastructure to virtualize

### Within Each User Story

- API route before client components
- Base components before main component integration
- Core functionality before styling and polish
- Story complete before moving to next priority

### Parallel Opportunities

- Phase 1: All setup tasks (T001-T005) can run in parallel
- Phase 2: T006 can run in parallel with T007-T008
- Phase 3: T011, T012, T013 can run in parallel (different component files)
- Phase 4: T025 can run independently
- Phase 6: All styling tasks (T032-T036) can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all component creation tasks together (different files, no dependencies):
Task: "Create welcome-message.tsx component in components/chat/welcome-message.tsx"
Task: "Create message-item.tsx component in components/chat/message-item.tsx"
Task: "Create chat-input.tsx component in components/chat/chat-input.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. Complete Phase 5: Error Handling (core functionality)
5. **STOP and VALIDATE**: Test User Story 1 independently
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 + Error Handling → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add Polish → Final polish and optimization

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 components (T011-T013 in parallel)
   - Developer B: API route and streaming (T009-T010)
3. Integrate User Story 1
4. Developer A: User Story 2 (virtualization)
5. Developer B: Error handling
6. Polish together

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- All file paths follow Next.js App Router structure per constitution
- No code comments - all code must be self-documenting per constitution
