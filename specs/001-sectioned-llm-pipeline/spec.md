# Feature Specification: Sectioned LLM Generation Pipeline

**Feature Branch**: `001-sectioned-llm-pipeline`  
**Created**: 2026-01-02  
**Status**: Draft  
**Input**: User description: "I am building sunset, an ai website builder which focuses on building landing pages by instructing the llm through chat. I already have features in place such as generating a website tool, chat, rendering the generated website and the basics. Right now i want to expand the llm pipeline. Currently the pipeline is just the base prompt + the tool for generatingLandingPageCode. I want to split it into the following way. First I want the main promt stay similar to what it is currently. Once it finishes writing the overview i want it to call a tool for writing a file required for the application. For example it starts with the entities, then it does one by one the sections of the page and then the pages itself so that it supports multipage design. Each \"section\" is a tool call which generates the code of that section. At the end of each tool call the llm decides to either perform another tool call (i.e. make another section) or finish. Once all the sections are finished then the llm generates a short smmary saying it built the website"

## Clarifications

### Session 2026-01-02

- Q: Should generation create a new site per run or update the same site for a chat session? → A: One site per chat session; each new generation run updates/overwrites that site while preserving run history.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Generate a website via step-by-step “writing” actions (Priority: P1)

As a user chatting with the AI website builder, I want the generation to happen in visible, incremental “writing” steps (overview → layout plan → entities → sections → pages) so I can trust progress and understand what is being created before the final preview updates.

**Why this priority**: This is the core UX and value of the feature: a transparent, controllable, multi-step pipeline instead of a single monolithic generation.

**Independent Test**: Can be fully tested by requesting a new landing page and verifying that the UI shows a sequence of “Writing …” steps and finishes with a rendered preview and a short summary.

**Acceptance Scenarios**:

1. **Given** a new chat session and a user request to create a landing page, **When** the assistant starts generation, **Then** the UI shows an initial overview step followed by explicit “Writing …” steps for generated artifacts.
2. **Given** the assistant finished the overview, **When** it proceeds to generation, **Then** it performs a first “layout plan” tool step that outputs a short JSON outline of entities and the page structure (sections and subsections).
3. **Given** the assistant is generating a site, **When** each step completes, **Then** the UI records that step with a human-readable label (e.g., “Writing landing/Hero Section”).
4. **Given** generation finishes, **When** the assistant sends its final response, **Then** the system persists the generated artifacts and the preview updates to reflect the saved result.
5. **Given** generation finishes, **When** the assistant sends its final response, **Then** the assistant includes a short user-facing summary indicating the website has been built.

---

### User Story 2 - Generate a multipage site (Priority: P2)

As a user, I want the builder to support sites with multiple pages, not just a single landing page, so the generated design can include a home page plus supporting pages (e.g., pricing, about) while still using the same step-by-step pipeline.

**Why this priority**: Multipage generation meaningfully expands the product scope and enables real marketing sites, while fitting naturally into the new “pages after sections” flow.

**Independent Test**: Can be fully tested by requesting a website with at least two pages and verifying that the pipeline produces per-page writing steps and that the preview can navigate between pages.

**Acceptance Scenarios**:

1. **Given** a user request that implies multiple pages, **When** the assistant generates the site, **Then** the UI shows “Writing …” steps for at least two distinct pages.
2. **Given** the pipeline completes, **When** the preview renders, **Then** users can view each generated page as part of the same site.

---

### User Story 3 - Recover gracefully from partial generation (Priority: P3)

As a user, I want the system to handle failures in a single “writing” step gracefully so I don’t lose the whole run if one section/page fails to generate.

**Why this priority**: Step-by-step pipelines increase surface area for partial failures; handling them protects user trust and reduces frustration.

**Independent Test**: Can be fully tested by simulating a failing “writing” step and verifying the UI reflects the failure without corrupting already-created artifacts.

**Acceptance Scenarios**:

1. **Given** generation is in progress and one step fails, **When** the failure occurs, **Then** the UI marks that step as failed and retains the successful steps already completed.

---

### Edge Cases

- The assistant generates a large number of sections/pages; the UI should still clearly show progress and ordering.
- The assistant proposes duplicate or ambiguous section names; the system should still store them in a way that preserves order and identity.
- A step completes but produces invalid/unrenderable output; the system should surface that the preview cannot be updated for that step/run.
- A step times out or is interrupted; the run should be recoverable (at minimum by showing failure state and preserving prior outputs).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST support a generation run that is composed of ordered steps: overview, layout plan, entities, zero or more sections, and one or more pages.
- **FR-001a**: System MUST generate a layout plan as the first tool step after the overview, expressed as a short JSON structure describing: required entities and an ordered outline of sections and subsections.
- **FR-001b**: The layout plan JSON MUST be minimal and brief, suitable for being displayed and stored as a compact planning artifact (no long prose).
- **FR-002**: System MUST represent each generated section as its own explicit “writing” step so it can be displayed in the UI as a discrete action.
- **FR-003**: System MUST allow the assistant to decide after each section-writing step whether to generate another section or to proceed to page-writing steps / finish the run.
- **FR-004**: System MUST represent each generated page as its own explicit “writing” step so multipage sites are supported.
- **FR-005**: System MUST expose each step to the UI with a stable, human-readable label that can match patterns like “Writing landing/Hero Section”.
- **FR-005a**: System MUST map each chat session to a single persisted site project so repeat runs in the same session update the same site result.
- **FR-006**: System MUST persist the generated site artifacts (including sections and pages) such that they can be rendered after the assistant completes its final response.
- **FR-006a**: When committing a new run for an existing session site, the system MUST overwrite the site’s pages/sections to match the latest run, while retaining prior run records.
- **FR-007**: System MUST update the preview to reflect the persisted artifacts after the assistant completes its final response.
- **FR-008**: The assistant MUST end the run with a short user-facing summary indicating what was built.
- **FR-009**: If a step fails, the system MUST record the failure for that step and MUST NOT discard previously completed steps from the same run.
- **FR-010**: All tool prompts used in this pipeline MUST be minimal (terse instructions and compact output requirements) to reduce token usage and keep steps fast.

### Key Entities _(include if feature involves data)_

- **Generation Run**: A single attempt to produce a website from a chat request, with ordered steps and an overall status.
- **Generation Step**: A single pipeline step (overview/layout plan/entities/section/page) with a display label, status (e.g., pending/succeeded/failed), and output payload.
- **Site Project**: A user-visible website container that owns pages and their sections, and is stable per chat session (one site per session).
- **Page**: A navigable unit of the site with a name/route and an ordered list of sections.
- **Section**: A reusable block of a page (e.g., navbar, hero, features) with a display name and generated content.

### Assumptions

- A “section” is the smallest unit the pipeline writes in a single step, and sections have a display name suitable for showing in the UI.
- The pipeline must support “zero or more sections” for flexibility (e.g., simple pages or non-section-based pages), but typical landing pages will have multiple sections.

### Out of Scope (for this feature)

- Selective editing where a change request updates only the relevant section(s) (noted as a future implementation).
- Real-time preview updates after every step (this feature only requires the final post-response save + preview refresh).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: For a standard landing-page request, users can observe at least 8 distinct “Writing …” steps (sections and pages) during generation.
- **SC-002**: In at least 95% of generation runs, the system completes with a persisted result that successfully renders in the preview.
- **SC-003**: Users see the first visible progress update (a recorded step) within 5 seconds of starting generation, for at least 90% of runs.
- **SC-004**: At least 80% of users testing the feature report that the step-by-step UI improved their understanding of what the AI built (measured via a simple in-product survey after generation).
