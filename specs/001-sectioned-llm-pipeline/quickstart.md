# Quickstart: Sectioned LLM Generation Pipeline

## Prerequisites

- A configured PostgreSQL database connection for the app
- AI provider credentials configured for the existing `getAIModel()` setup

## Run locally

1. Install dependencies:

```bash
pnpm install
```

2. Start the dev server:

```bash
pnpm dev
```

3. Open the app and sign in.

## Try the feature behavior (manual verification)

1. Open the builder chat UI.
2. Ask for a multipage marketing site, for example:
   - "Create a SaaS landing page with hero, features, pricing, FAQ and also add a separate /pricing page."
3. Observe multiple visible “Writing …” steps (entities, sections, pages).
4. After the assistant finishes its response, verify:
   - the generated artifacts are committed
   - the preview iframe refreshes to the committed site preview URL
5. Send another “regenerate” request in the same chat session and verify:
   - it updates the same site (pages/sections overwritten)
   - run history remains available for debugging/audit purposes
