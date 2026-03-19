# Image Assets V2 Plan (Option B)

**Goal**: support image uploads for the landing-page builder in a way that lets the LLM both:
- analyze images as references
- place selected uploaded images on the generated website

**Chosen approach**: generated site code should use a shared `ImageAsset` component with stable asset aliases instead of raw blob URLs.

## Why Option B

Using `ImageAsset` keeps generated code stable:
- the LLM references `hero.jpg`, `logo.png`, `product-1.webp`
- preview and publish resolve those aliases to the current blob URLs
- replacing an image later does not require regenerating the page code

Example target usage in generated site files:

```tsx
import ImageAsset from "../_runtime/ImageAsset";

export default function Hero() {
  return (
    <section>
      <ImageAsset asset="hero.jpg" alt="Product hero image" />
    </section>
  );
}
```

## Asset model

Each uploaded image should eventually have:
- `chatId`
- `alias` like `logo.png` or `hero.jpg`
- `blobUrl`
- `intent`: `reference`, `site_asset`, or `both`
- `status`
- file metadata: mime type, size, width, height
- optional user metadata: alt hint, label, original filename

## Runtime model

The app owns the asset registry. The LLM does not emit raw blob URLs.

- Generated code uses `ImageAsset`
- Preview resolves `asset="hero.jpg"` to the current blob URL
- Publish resolves the same alias the same way
- Later image replacement updates the asset record, not the generated page files

## Reserved runtime files

These runtime file conventions should remain stable once introduced:
- `landing/_runtime/ImageAsset.tsx`
- `landing/_runtime/assets.ts`

`ImageAsset.tsx` should be the component the LLM imports and renders.

`assets.ts` should expose alias resolution helpers and the asset map for preview/publish.

## Phase 0: Foundations

**Objective**: lock the naming rules, runtime conventions, and phased rollout before wiring uploads or DB changes.

Tasks:
- define canonical asset intents and statuses
- define alias normalization and uniqueness rules
- reserve runtime import paths for `ImageAsset`
- define the prompt-facing asset manifest format
- document rollout phases and dependencies

Deliverables:
- shared TypeScript types for site assets
- alias helper utilities
- shared runtime/path conventions
- helper for future prompt manifest generation
- this execution plan

## Phase 1: Storage and upload pipeline

**Objective**: persist image assets independently from chat messages.

Tasks:
- add a `site_assets` table keyed by chat
- add upload API for authenticated image uploads
- validate mime types and file size
- upload to Vercel Blob
- create DB rows with alias + metadata + intent
- support short alias naming and duplicate suffixes

Acceptance criteria:
- a user can upload an image and get a stable alias
- the blob URL is stored in DB, but the alias becomes the main app-level identifier
- duplicate aliases become `hero-2.jpg`, `logo-2.png`, etc.

## Phase 2: Chat UX and message persistence

**Objective**: let users attach images in chat and mark their intent.

Tasks:
- update chat input to support image selection
- show thumbnails before send
- let the user choose `reference`, `site_asset`, or `both`
- persist structured chat message parts instead of flattening to text only
- reload attachment history correctly

Acceptance criteria:
- attachments survive refresh
- user messages render images in history
- image metadata remains available for later site edits

## Phase 3: LLM and prompt integration

**Objective**: teach the builder how to reason about references vs site assets.

Tasks:
- pass a compact asset manifest on each generation turn
- update prompts so the model:
  - uses `ImageAsset` for `site_asset` and `both`
  - does not render `reference` images directly
  - uses aliases instead of raw URLs
- route attachment turns to a vision-capable model

Acceptance criteria:
- the model can describe attached references
- the model can place uploaded site assets in generated code
- generated TSX imports `ImageAsset` instead of embedding blob URLs

## Phase 4: Runtime component and preview integration

**Objective**: make generated TSX render aliased assets inside preview.

Tasks:
- implement `landing/_runtime/ImageAsset.tsx`
- implement `landing/_runtime/assets.ts`
- inject or compose the asset map into the preview runtime
- ensure `compose-react` can resolve the runtime helper files
- provide safe fallback behavior when an alias is missing

Acceptance criteria:
- preview renders aliased images correctly
- missing assets fail gracefully
- generated files remain portable within the landing runtime

## Phase 5: Publish and asset replacement

**Objective**: published sites use the same alias-based asset system.

Tasks:
- include asset resolution in publish output
- ensure published revisions resolve aliases consistently
- support image replacement by updating asset records, not code
- preserve old published revisions if revision pinning is required

Acceptance criteria:
- published sites render aliased assets
- replacing `hero.jpg` updates the site without rewriting TSX
- revision behavior is explicit and documented

## Phase 6: Polish, migration, and guardrails

**Objective**: harden the feature for production.

Tasks:
- add upload limits and quotas
- add cleanup rules for orphaned assets
- decide revision pinning vs live alias resolution
- add SVG policy
- add analytics/billing hooks if image generation or vision usage changes cost
- backfill older chats only if needed

Acceptance criteria:
- large/invalid uploads fail cleanly
- asset lifecycle is defined
- prompt and runtime behavior is predictable for edits and republishes

## Key decisions to keep stable

These decisions should not change casually because they affect many later phases:
- aliases are the canonical identifier used by generated code
- generated code uses `ImageAsset`, not raw URLs
- runtime helpers live under `landing/_runtime/`
- prompt manifests expose aliases and intents, not storage internals
- chat attachments and site assets are related but not the same thing

## Open decisions for later

These should be decided before Phase 5:
- whether published sites resolve aliases live or pin aliases to a published revision
- whether users can rename aliases after code has already referenced them
- whether multiple assets can intentionally share a semantic slot like `hero.jpg`
- whether non-image files should remain supported in chat separately from site assets
