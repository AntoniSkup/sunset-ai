# Research: Sectioned LLM Generation Pipeline

## Goals

- Provide a step-by-step generation flow where each generated artifact is visible as a discrete “Writing …” step in the chat UI.
- Persist the final set of generated artifacts and refresh the preview **after** the assistant finishes its response.
- Support multipage sites (pages after sections).
- Honor the clarification: **one site per chat session**, and each new run overwrites pages/sections while preserving run history.

## Decisions

### Decision 1: Model generation as multiple AI tool calls (one artifact per call)

**Chosen**: Add new tools that generate a single artifact per tool call (layout plan JSON, entities, one section, one page).

**Rationale**:

- The Vercel AI SDK tool-calling mechanism already surfaces tool calls in the UI as message parts.
- “One artifact per call” matches the requirement to show many “Writing …” steps.

**Alternatives considered**:

- Generate everything in one tool call and split client-side: rejected because it defeats explicit progress and makes step attribution ambiguous.

### Decision 2: Commit after streaming completes (single post-response commit)

**Chosen**: Do not persist within each tool execution. Collect tool outputs during streaming and, once the assistant finishes its message, commit artifacts in one authenticated request.

**Rationale**:

- Matches the product requirement that persistence happens once the response finishes.
- Avoids partially persisted sites when a run is interrupted mid-stream.
- Allows a clean “overwrite pages/sections” commit to keep one site per session stable.

**Alternatives considered**:

- Persist inside each tool call: rejected because it creates partially updated sites and can update preview earlier than desired.

### Decision 3: Preview multipage output via a site+page preview endpoint

**Chosen**: Add a preview endpoint that renders HTML for a specific persisted site and page.

**Rationale**:

- Current preview endpoint returns a single HTML document for the latest code version.
- Multipage needs stable retrieval by site id and page slug.

**Alternatives considered**:

- Single HTML with internal routing: rejected because it complicates navigation and makes page-specific preview URLs less predictable.

### Decision 4: Persist both run steps and site structure

**Chosen**: Persist:

- a site project (stable per chat session)
- pages and sections (renderable structure)
- generation runs and steps (history + future selective edits)

**Rationale**:

- UI requires ordered steps and stable labels for “Writing …”.
- Future selective edits require addressable artifacts and run history.

## Non-Goals (explicit)

- Real-time preview refresh after every step.
- Selective edits of only the impacted section(s) (deferred).
