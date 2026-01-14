# Data Model: Sectioned LLM Generation Pipeline

## Overview

The feature introduces a persisted “site” model (pages + sections) and a “generation run” model (ordered steps with status).

Important clarification applied: **one site per chat session**. Each new generation run overwrites the site’s pages/sections while retaining run history.

## Entities

### SiteProject

Represents a generated website owned by a user and tied to a chat session.

- **id**: unique identifier
- **userId**: owner
- **sessionId**: stable chat session identifier
- **name**: optional display name
- **createdAt / updatedAt**

Constraints:

- unique (userId, sessionId)

Relationships:

- 1 SiteProject → many Pages
- 1 SiteProject → many GenerationRuns

### Page

A single page in a site.

- **id**
- **siteId**
- **slug**: stable page identifier (e.g., `home`, `pricing`)
- **title**
- **orderIndex**
- **createdAt / updatedAt**

Constraints:

- unique (siteId, slug)

### Section

A block belonging to a page (navbar, hero, etc.).

- **id**
- **pageId**
- **name**: display name (e.g., `Hero Section`)
- **filePath**: UI label (e.g., `landing/Hero Section`)
- **orderIndex**
- **content**: generated payload (renderable by preview)
- **createdAt / updatedAt**

### GenerationRun

A single attempt to produce a site from a chat request.

- **id**
- **siteId**
- **userId**
- **sessionId**
- **status**: running | succeeded | failed
- **startedAt / finishedAt**

Relationships:

- 1 GenerationRun → many GenerationSteps

### GenerationStep

A single ordered step within a run.

- **id**
- **runId**
- **type**: overview | layout_plan | entities | section | page
- **label**: UI label (e.g., `Writing landing/Hero Section`)
- **orderIndex**
- **status**: pending | succeeded | failed
- **output**: tool output payload
- **errorCode / errorMessage**: if failed
- **startedAt / finishedAt**

## State Transitions

- GenerationRun: running → succeeded | failed
- GenerationStep: pending → succeeded | failed

## Validation Rules

- A committed site must have **at least 1 page**.
- Each page must have a **non-empty slug** and stable ordering.
- Each section must have a **non-empty name** and stable ordering within its page.
- On commit for an existing (userId, sessionId) site, the system overwrites pages/sections to match the latest run.
