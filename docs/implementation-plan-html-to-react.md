# Implementation Plan: HTML → React (Tailwind) Landing Page Builder

**Goal**: Change the AI website builder from outputting **HTML** to outputting **React with Tailwind CSS**, with preview and publish behaving as a **Next.js-aware** application.

**Multi-page support**: The builder must support **multi-page websites** (e.g. Home, About, Contact, Pricing), not only single landing pages. File structure, prompts, and composition should allow multiple page components and a layout/router that composes them. Preview and publish will need a way to serve or navigate between pages (e.g. entry point + client-side routing or multiple HTML entry URLs).

**Current state (summary)**:
- **Prompt**: LLM is instructed to produce raw HTML; `create_section` outputs one HTML file per call; composition via `<!-- include: landing/pages/home.html -->` comments.
- **Storage**: Files stored in DB with paths like `landing/index.html`, `landing/sections/hero.html`; content is raw HTML in `landing_site_file_versions.content`.
- **Preview**: API composes HTML by resolving include comments, returns full HTML; iframe loads `/api/preview/{chatId}/{revision}` (HTML response).
- **Publish**: Same composition; `/api/published/[siteId]` returns composed HTML.
- **Screenshots**: `getComposedHtml()` → HTML sent to ScreenshotOne API.

---

## Phase 1: Prompts (LLM output format)

**Objective**: LLM produces React/JSX with Tailwind instead of HTML. **Support multi-page sites**: layout + multiple page components + shared sections.

### 1.1 Chat system prompt (`prompts/chat-system-prompt.ts`)

- Replace all references to "HTML" with "React (JSX)" and "Tailwind CSS".
- Update tool model: `create_section` generates exactly one **React/TSX** file per call.
- Update file generation order and paths:
  - Entry: `landing/layout.tsx` or `landing/index.tsx` (root layout; wraps all pages and can include shared Navbar/Footer with links to each page).
  - **Pages** (multiple): `landing/pages/Home.tsx`, `landing/pages/About.tsx`, `landing/pages/Contact.tsx`, etc., as requested by the user.
  - Sections: `landing/sections/Navbar.tsx`, `landing/sections/Hero.tsx`, `landing/sections/Footer.tsx`, etc. (reusable across pages).
- Update composition convention:
  - From: `<!-- include: landing/sections/Hero.html -->`
  - To: React imports, e.g. `import Hero from '../sections/Hero';` and `<Hero />` in the page/layout. Layout imports shared components (Navbar, Footer) and page components; use simple routing (e.g. path/hash or a small router) so multiple pages are reachable.
- Keep the same flow: create layout first, then pages (one per tool call), then each section; one tool call per file.
- Keep `isModification` / plan vs direct-modification behavior.

### 1.2 Section/code-generation prompt (`prompts/tool-generate-code-prompt.ts`)

- **createSectionPrompt()**: 
  - Require **raw React/JSX/TSX only** (no markdown, no code fences).
  - Tailwind: use Tailwind utility classes only (no `<style>` or external CSS).
  - Entry file (`landing/index.tsx` or `landing/layout.tsx`): root layout component that imports the main page and wraps with any providers; include Tailwind (e.g. global import or assume Tailwind is available in the app). For **multi-page** sites, layout should import all page components and render them via simple routing (e.g. hash-based).
  - **Pages** (multiple): each file under `landing/pages/*.tsx` is a single default-export React component (e.g. Home, About, Contact); no document structure.
  - Sections: single default-export React component; no `<!DOCTYPE>`, no `<html>`, no document structure.
  - Rules: functional components, no classes; use `className` not `class`; valid JSX; semantic HTML where possible; accessibility and responsiveness (Tailwind breakpoints).
- **buildCodeGenerationPromptTemplate()** (if still used for full-doc generation): align with React + Tailwind, single React component or layout.
- **buildModificationContext** / **buildExistingSectionsContext**: keep; they pass previous and existing code for context (now React instead of HTML).

### 1.3 create_site tool instructions (in `lib/code-generation/generate-code.ts`)

- Change destination from `landing/index.html` to `landing/index.tsx` (or `landing/layout.tsx`).
- Update the hard-coded userRequest: create the **entry React component** that:
  - Imports and composes the **home page** (e.g. `import Home from './pages/Home'` and `<Home />`) and supports **multi-page** structure: either import other pages and use simple routing (e.g. hash-based or path-based) so users can navigate to About, Contact, etc., or at minimum set up the layout so additional pages can be added later.
  - Ensures Tailwind is available (e.g. global or wrapper).
  - For multi-page: layout should include a nav that links to each page (e.g. `#home`, `#about`, `#contact`) or the composer will resolve a "current page" for preview (see Phase 3).

---

## Phase 2: Storage and path conventions

**Objective**: Store React/TSX files instead of HTML; paths and validation accept `.tsx` (and optionally `.jsx`).

### 2.1 Path normalization and validation

**Files to change**:
- `lib/code-generation/generate-code.ts`: 
  - `normalizeDestinationPath`: allow `.tsx` (and optionally `.jsx`) in addition to or instead of `.html`.
  - `inferFileKind`: treat `landing/index.tsx` (or `landing/layout.tsx`) as layout; `landing/pages/*.tsx` as page; `landing/sections/*.tsx` as section.
  - `isIndexDestination` / `isFragmentDestination`: use new entry path (e.g. `landing/index.tsx`).
- `lib/preview/compose-html.ts`: will be replaced by a React composer (see Phase 3); path checks there (e.g. include regex) become import resolution.
- `app/api/published/[siteId]/route.ts`: same; composition logic moves to React pipeline.

**Decision**: Support **`.tsx` only** for new output (simpler). Existing `.html` data can stay in DB for backward compatibility; we only generate and compose `.tsx` for new revisions (or add a one-time migration later to convert or deprecate HTML).

### 2.2 Database schema

- **No schema change required** for Phase 1–2: `landing_site_files.path` is a string; we can store `landing/sections/Hero.tsx`. `landing_site_file_versions.content` stores text (React source).
- **Optional**: Document that `path` may end with `.tsx` (or add a check constraint for `.tsx`/`.jsx` if we drop `.html`). Prefer code-level validation first.

### 2.3 Code validation (replace HTML validation with React/JSX)

**Files**: `lib/code-generation/fix-code-errors.ts`, `lib/code-generation/generate-code.ts`.

- **Remove or replace** HTML-specific validation:
  - `parseAndValidateHTML`, `validateAndFixDocument`, `validateAndFixFragment`, `enforceIndexShell` (HTML) are not applicable.
- **Add** React/JSX validation:
  - Strip markdown code fences (keep `stripMarkdownCodeFences`).
  - Optional: parse with a JSX/TS parser (e.g. `@babel/parser` with appropriate plugins, or a simple regex/heuristic) to ensure valid JSX and a single default export for sections/pages.
  - For the entry file: ensure it’s a valid component that imports and renders the main page/sections.
- **generate-code.ts**: 
  - Replace `validateAndFixDocument` / `validateAndFixFragment` with the new React validation (or a minimal “non-empty, no code fences” check for MVP).
  - Remove `enforceIndexShell` for HTML; optionally add a small helper that ensures the entry file imports and renders the home page.

---

## Phase 3: Preview (from composed HTML to React → HTML)

**Objective**: Preview still shows the landing page in an iframe; the source of truth is React; we produce HTML for the iframe by compiling React.

### 3.1 Options for “React → HTML” for preview

| Option | Description | Pros | Cons |
|-------|-------------|------|------|
| **A) Server-side render (SSR)** | Load all TSX for the revision, resolve “imports” from DB, build one or more modules, transpile (e.g. Sucrase/Babel), run in Node with React and `renderToStaticMarkup()` (or `renderToReadableStream`), return HTML. | Single source of truth (React); no browser bundler. | Need import resolution and a small in-memory “bundler” or single-file composition. |
| **B) Composed single file** | LLM or a post-step produces one big TSX file per revision (e.g. all sections inlined). Transpile that one file to JS, run in Node, render to HTML. | Simple: one file, no import resolution. | Less modular; harder for LLM to “edit one section”. |
| **C) Dynamic route + iframe runner** | Next route (e.g. `/app/preview/[chatId]/[revision]/page.tsx`) that loads component sources from API and uses a runtime (e.g. React Live, or a small in-browser transpiler) to render inside the app. | True React runtime in browser. | Heavier; security and complexity (eval/code execution). |

**Recommendation**: **Option A** for preview (and publish): implement a **React composer** that:
1. Loads the entry file (e.g. `landing/index.tsx`) at the given revision.
2. Parses it for import statements that reference other landing files (e.g. `from '../sections/Hero'` or `from './sections/Hero'`).
3. Recursively loads those files from DB (same revision) and builds a **virtual module graph**.
4. Produces a **single concatenated module** (or a small set of modules) that replaces those imports with the inlined component source (e.g. IIFE or inline component definitions).
5. Transpiles TSX → JS (e.g. Sucrase or Babel in Node).
6. Runs the resulting code in Node with React and ReactDOMServer, then `renderToStaticMarkup(rootComponent)` (and optionally inject a Tailwind build or a link to a shared Tailwind build).
7. Wraps the result in a minimal `<!DOCTYPE html><html><head>...</head><body>...</body></html>` and injects Tailwind (e.g. CDN or a prebuilt CSS link).

**Multi-page**: For sites with multiple pages, the entry component should use **client-side routing** (e.g. hash-based: `#/`, `#/about`, `#/contact`) so that a single composed HTML document can switch content in the browser. The composer renders the full app (including the router); the iframe loads one HTML document and navigation works via hashes. Alternatively, the preview API could accept a query param (e.g. `?page=about`) and render only that page for a simpler first version; then add client-side routing in the generated app for publish.

Tailwind in preview: either (1) include Tailwind CDN in the wrapper, or (2) run Tailwind compile on the wrapper + content (e.g. single HTML file with inline Tailwind classes) via a small CLI or API. (1) is faster for MVP.

### 3.2 Implementation tasks

- **New module** `lib/preview/compose-react.ts` (or `lib/landing/react-render.ts`):
  - `getComposedReactHtml({ chatId, revisionNumber }): Promise<string | null>`.
  - Resolve entry file path (e.g. `landing/index.tsx`).
  - Implement import resolution for paths under `landing/` (relative imports only).
  - Inline resolved components into one or more modules; transpile TSX → JS; execute in Node with React + ReactDOMServer; return full HTML string (with doctype, head, body, Tailwind).
- **Preview API** `app/api/preview/[sessionId]/[versionNumber]/route.ts`:
  - Replace `getComposedHtml` with `getComposedReactHtml`.
  - Still return `text/html` with the composed HTML.
- **Preview panel** (`components/preview/preview-panel.tsx`): no change needed; it still loads the same URL and gets HTML.
- **Screenshot** (`lib/screenshots/capture.ts`): replace `getComposedHtml` with `getComposedReactHtml`.

### 3.3 Deprecate HTML composition

- After React composition works, remove or keep `lib/preview/compose-html.ts` for backward compatibility (e.g. if we still have chats with only HTML revisions). Preview API can try React first and fall back to HTML if no entry TSX exists.

---

## Phase 4: Publish

**Objective**: Published sites serve the same experience as preview (React compiled to HTML), and optionally are “Next app ready”.

### 4.1 Current behavior

- Publish records `(chatId, revisionNumber)` in `published_sites`.
- `GET /api/published/[siteId]`: loads revision, composes HTML via `resolveIncludes`, returns HTML.

### 4.2 Changes

- **Publish API** `app/api/published/[siteId]/route.ts`:
  - Use the same React composition pipeline as preview: `getComposedReactHtml({ chatId, revisionNumber })`.
  - Return the composed HTML (same as today) so existing “share link” behavior stays (one URL that returns full HTML).
- **Optional later**: Add a “Export as Next.js app” that writes all files for a revision to a ZIP or to a repo; then the user can deploy that as a real Next app. Out of scope for the initial React migration.

---

## Phase 5: Order of implementation and testing

Suggested order so each step is testable:

1. **Prompts only (Phase 1)**  
   - Update prompts and create_site destination/instructions to output React/TSX and **support multi-page sites** (layout + multiple `landing/pages/*.tsx` + sections).  
   - Keep storage and validation accepting both `.html` and `.tsx` temporarily (e.g. allow `.tsx` in path normalization).  
   - Validation: minimal (e.g. strip fences, non-empty); optional: basic JSX parse.  
   - **Risk**: LLM might still output HTML or malformed JSX; we can add stricter validation after pipeline works.

2. **Storage (Phase 2)**  
   - Path normalization and file kind inference for `.tsx`; entry path `landing/index.tsx`.  
   - Ensure create_site and create_section can write to `landing/index.tsx`, `landing/pages/Home.tsx`, `landing/sections/*.tsx`.  
   - No DB migration.

3. **React → HTML pipeline (Phase 3.1)**  
   - Implement `getComposedReactHtml`: import resolution from DB, single-module (or minimal) bundle, transpile, renderToStaticMarkup, wrap with HTML + Tailwind.  
   - Unit test with a few hard-coded TSX strings.

4. **Wire preview and screenshot (Phase 3.2)**  
   - Preview API and screenshot use `getComposedReactHtml`.  
   - Manually test: create a site (React), open preview, trigger screenshot.

5. **Publish (Phase 4)**  
   - Published route uses `getComposedReactHtml`.  
   - Test: publish a React site, open published URL.

6. **Cleanup and validation**  
   - Tighten React/JSX validation in code generation.  
   - Optionally deprecate HTML composition for new revisions (or keep fallback for old chats).  
   - Update specs/docs (e.g. `specs/002-landing-page-generator/`) to describe React output and composition.

---

## File checklist (summary)

| Area | File(s) | Change |
|------|--------|--------|
| Prompts | `prompts/chat-system-prompt.ts` | HTML → React; paths `.tsx`; composition = imports; **multi-page** (multiple pages + layout) |
| Prompts | `prompts/tool-generate-code-prompt.ts` | createSectionPrompt + template: React/JSX + Tailwind |
| Code gen | `lib/code-generation/generate-code.ts` | Paths `.tsx`; create_site to index.tsx; validation React |
| Validation | `lib/code-generation/fix-code-errors.ts` | Add React/JSX validation; keep fence stripping |
| Preview | `lib/preview/compose-react.ts` | **New**: resolve imports, transpile, render to HTML |
| Preview | `lib/preview/compose-html.ts` | Keep for fallback or remove after migration |
| API | `app/api/preview/[sessionId]/[versionNumber]/route.ts` | Use getComposedReactHtml |
| API | `app/api/preview/[sessionId]/latest/route.ts` | Same if it returns HTML |
| API | `app/api/published/[siteId]/route.ts` | Use getComposedReactHtml (and move resolveIncludes to React or remove) |
| Screenshot | `lib/screenshots/capture.ts` | Use getComposedReactHtml |
| Chat route | `app/api/chat/route.ts` | Any tool/default path references (e.g. landing/index.html → index.tsx) |

---

## Risks and mitigations

- **LLM outputs invalid JSX**: Add robust fence stripping and a JSX parse step; on parse error, retry with a “fix this React code” prompt or return a clear error in the UI.
- **Import resolution**: Limit to relative imports under `landing/` and known extensions (`.tsx`/`.jsx`); avoid dynamic imports for MVP.
- **Tailwind in rendered HTML**: Use Tailwind CDN in the wrapper so all class names work without a build. For production publish, we can later add a Tailwind compile step if we want smaller CSS.
- **Security**: Transpiling and running user-generated React in Node is a risk; run in a sandbox or restrict to simple components (no `require`, no `process`, no `eval` in user code). Consider running the render in a worker or isolated process.

---

## Next step

Start with **Phase 1 (Prompts)** and **Phase 2 (path/storage)** so that new generations produce and store React/TSX. Then implement **Phase 3 (compose-react + preview)** so we can see React output in the iframe. After that, **Phase 4 (publish)** and cleanup.

If you want, next we can break Phase 1 into concrete edits (exact prompt text and code changes) and then implement them step by step.
