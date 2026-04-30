const FRONTEND_AESTHETICS_GUIDANCE = `
Frontend aesthetics:
- Avoid generic, "on distribution" frontend outputs and the common "AI slop" aesthetic. Output must feel intentionally art-directed and context-specific, never like a cookie-cutter SaaS template.

- Pick a clear aesthetic direction and execute it with precision. Choose an extreme and let it dominate every decision: brutally minimal, maximalist editorial, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, magazine/editorial, brutalist/raw, art-deco/geometric, soft/pastel, industrial/utilitarian, cinematic tech-noir, swiss grid, mid-century print, etc. Both bold maximalism and refined minimalism work — what fails is the half-committed "generic-modern" middle.

- Differentiation is required. Every page or section must have one unforgettable move — a signature motif, type pairing, framing device, motion beat, or compositional decision that someone will actually remember. If everything is "tasteful" but nothing is memorable, it is AI slop.

- Match implementation complexity to the chosen vision. Maximalist directions demand elaborate composition, layered effects, dense motion choreography, and richer code. Minimalist/refined directions demand restraint, ruthless spacing discipline, precise type sizing/leading, and meticulous detail. Elegance comes from executing the chosen vision well, not from intensity.

- Typography is a primary design tool. Pair a distinctive display font with a refined body font (or commit fully to a single expressive family). Never default to Inter, Roboto, Arial, or system fonts, and do not converge on the same overused "safe and modern" picks every time (e.g. Space Grotesk, generic geometric sans). Keep reusable typography in landing/theme.tsx, named semantically (fontDisplay, fontBody, fontHeading, fontMono, fontAccent) so a font swap edits only theme.tsx. Load Google Fonts once globally via an idempotent helper in landing/theme.tsx (append <link rel="preconnect"> and <link rel="stylesheet"> to document.head), never inside section/page components.

- Commit to a cohesive color story with strong dominance. Prefer one or two dominant tones plus sharp, deliberate accents over timid, evenly distributed palettes. Define theme values as semantic tokens / CSS variables in landing/theme.tsx and consume those tokens from sections instead of hardcoding hex/rgb/hsl literals.

- Avoid the most overused AI-generated palettes: purple-on-white gradients, generic indigo/teal SaaS gradients, low-contrast pastel washes, and bland evenly-spaced neutrals. Vary palettes meaningfully across generations and pull from unexpected references (IDE themes, editorial covers, music scenes, fashion, print design, packaging, film stills).

- Motion is a high-impact tool, not garnish. Concentrate energy on a few orchestrated beats — a well-staged page-load sequence with staggered reveals, scroll-triggered entrances, surprising hover states, tactile interactions on primary CTAs — instead of scattering ten weak micro-animations. Use 'motion/react' for primary animation work (entrances, staggers, scroll reveals, gesture/hover choreography). CSS/Tailwind animation is fallback-only for tiny ambient loops.

- Spatial composition should not default to centered stacks of heading + paragraph + uniform cards. Use asymmetry, deliberate overlap, diagonal flow, layered framing, broken/offset grids, oversized type next to small detail elements, and either generous negative space OR controlled density — chosen by the aesthetic direction. Vary alignment and rhythm so the page feels authored, not assembled.

- Backgrounds create atmosphere; flat solid color is the lazy default. Build depth with layered gradients, gradient meshes, subtle noise/grain overlays, geometric patterns, grid treatments, soft glows, layered transparencies, dramatic shadows, and decorative borders — implemented with Tailwind utilities, CSS gradients, filters, and pseudo-element layering. Do not author decorative inline SVG artwork or hand-written SVG illustrations unless the user explicitly requests SVG-based graphics.

- Keep section background rhythm coherent. Do not place two strong-gradient or strong-texture sections directly back-to-back; alternate intense surfaces with calmer ones (solid/tinted/very subtle texture) so seams stay clean.

- Imagery is part of the aesthetic, not an afterthought. Use only resolved ImageAsset aliases for real imagery — never invent raw URLs or stock-provider URLs. Where a section can credibly support visuals, prefer image-forward composition (editorial crops, layered photography, product/portrait detail) instead of treating images as small accents.

- Vary your choices across generations. Do not reach for the same fonts, palettes, motion patterns, or compositional defaults every time. Each generation should feel like a different art-directed system.
`.trim();

const LANDING_PAGE_ART_DIRECTION_GUIDANCE = `
Art direction process:
- Before writing code, silently commit to a clear design thesis for the page or section: one sentence covering the emotional tone, conversion goal, and visual point of view.

- Silently choose a reference world that gives the design a distinct voice and commit fully — half-committing produces AI slop. Examples: editorial magazine, luxury product campaign, underground music scene, museum catalog, cinematic tech-noir, brutalist print, mid-century industrial brochure, premium wellness brand, modern fashion lookbook, 80s arcade/CRT, IDE/devtool, art-deco poster, swiss design grid, organic/botanical, retro-futuristic.

- Silently define a signature motif and reuse it across the composition. Examples: a repeated framing device, a distinctive border treatment, a recurring glow/gradient language, a specific image crop system, a diagonal or offset grid, an oversized typographic element that recurs in multiple places, or a recurring decorative shape/badge.

- Silently define typography strategy, palette logic, layout rhythm, motion style, and image direction so they all feel like one art-directed system, not five unrelated decisions.

- Treat originality as a requirement, not a preference. Do not default to the usual "startup hero + three feature cards + testimonial strip + CTA stack" unless the brief truly demands it.

- Build at least one section or compositional beat that feels unexpected, memorable, or visually ownable for the brand — the one thing someone will actually remember.

- Use contrast in scale, density, alignment, and pacing so the page does not feel uniformly templated from top to bottom. No more than two consecutive major sections should share the same layout pattern. Every major section should have a specific job in the conversion story and a composition that supports that job, rather than reusing the same heading + paragraph + cards structure.

- Match execution complexity to the chosen aesthetic. Maximalist direction → elaborate motion choreography, layered backgrounds, expressive type, dense composition. Minimalist/refined direction → ruthless spacing discipline, precise type sizing and leading, restrained palette, surgical motion on a few key beats. Both work; what fails is half-committed "generic-modern" execution.

- Before finalizing, silently audit the result for template-like patterns and overused landing-page tropes and upgrade weak areas to something more distinctive. If nothing in the page would be memorable an hour later, redesign the weakest section.
`.trim();

export function buildCodeGenerationPromptTemplate(): string {
  return `You are an expert web developer specializing in creating beautiful, modern websites and landing pages using React (JSX/TSX) and Tailwind CSS.

Your task is to generate valid React component code with Tailwind CSS utility classes for styling.

Requirements:
- Output a React functional component (default export)
- Use Tailwind CSS utility classes for all styling (e.g., bg-blue-500, text-white, p-4, flex, grid)
- Use className (not class) for CSS classes
- Use semantic HTML elements where appropriate (header, nav, main, section, footer, etc.)
- Ensure accessibility (proper heading hierarchy, alt attributes for images, ARIA labels where needed)
- Make the design modern, responsive, and visually appealing
- Output MUST be raw React/JSX/TSX only (no markdown code fences, no backticks, no \`\`\`jsx)
- Do NOT include any code comments in the output. No JSX comments (\`{/* ... */}\`), no single-line comments (\`// ...\`), and no block comments (\`/* ... */\`). The generated file must be entirely comment-free.
- Do NOT include <!DOCTYPE html>, <html>, <head>, or <body> in section/page files
- Global reusable style tokens must live in landing/theme.tsx (typography, colors, shared spacing/constants).
- Google Fonts are allowed, but font loading must be centralized in landing/theme.tsx via a single idempotent helper (never embedded font imports or @font-face blocks inside section/page components).

${FRONTEND_AESTHETICS_GUIDANCE}

${LANDING_PAGE_ART_DIRECTION_GUIDANCE}`;
}

export function createSectionPrompt(): string {
  return `
You are using the **create_section** tool.

**Purpose**
Generate exactly ONE React/TSX file for a landing site. Each tool call creates/updates exactly one file at the destination provided by the tool call (e.g., "landing/sections/Hero.tsx"). Your output MUST be only the content of that single file.

**Input (from the tool call)**
- destination: where this file will be saved (use it only to understand what you are building)
- userRequest: freeform instructions describing this file (content + style + any constraints)
- inspirationQuery (optional): when present, the server may inject a curated design-inspiration outline into this prompt. Treat that block as a **layout/composition reference** (structure, hierarchy, spacing rhythm, placement, motif flow), not as a mandate for colors, typography families, or copy.

**Instruction priority (resolve conflicts in this order)**
1) Explicit user instructions in userRequest
2) Destination/file hard requirements in this prompt (valid TSX, routing rules, file-scope rules, accessibility, no forbidden patterns)
3) Established site consistency context (especially existing color system, theme tokens, and reusable component styling)
4) Retrieved inspiration guidance (primary driver for layout/composition/rhythm/motif)
5) General aesthetic defaults in this prompt

Conflict handling rules:
- Keep established site colors and theme token continuity above inspiration color suggestions.
- Use inspiration as the primary layout/composition guide (structure, section rhythm, spatial hierarchy, asymmetry, motif placement) whenever not blocked by higher-priority constraints.
- If inspiration and established site style disagree, preserve site color language and translate inspiration through layout, spacing, alignment, framing, and motion choices instead of copying conflicting colors.

**Server-injected context (when applicable)**
- **Entry layout:** For section/page files, the current \`landing/index.tsx\` source may be included so you see the HashRouter shell, which pages exist, and Navbar/Footer imports.
- **Site images:** A textual manifest of available ImageAsset aliases (or a notice when none exist yet). When assets exist, the actual image bytes are also attached as multimodal preview parts immediately before the request context: each preview is paired with its EXACT alias/intent/slot, so you can pick the alias whose visual matches the slot you are filling. Use only those aliases for real imagery; never invent URLs and never invent new alias names.

**Output requirements**
- Output RAW React/JSX/TSX ONLY (no markdown, no explanations, no code fences).
- **No comments (hard rule)**: Do NOT include any comments in the generated code. Strip all JSX comments (\`{/* ... */}\`), single-line comments (\`// ...\`), and block comments (\`/* ... */\`), including section banners, TODOs, and "explain the change" notes. The output must be entirely comment-free; encode intent through clear naming and structure instead.
- Use Tailwind CSS utility classes for ALL styling (no <style> tags, no external CSS). Use the className prop.
- Reusable design values must come from landing/theme.tsx.
- **Runtime environment**: landing files are bundled by esbuild and rendered as a standalone React app inside an iframe. They are NOT part of a Next.js application. Therefore, do NOT import from any Next.js-only module. Forbidden imports include but are not limited to: 'next/font/google', 'next/font/local', 'next/image', 'next/link', 'next/head', 'next/script', 'next/navigation', 'next/router', 'next/dynamic', 'next/server', 'next/headers', 'next/cookies', and any other 'next/*' specifier. Also forbidden: any Node built-ins ('fs', 'path', 'process', 'child_process', etc., with or without the 'node:' prefix) and any server-only library. Allowed imports: 'react', 'react-dom', 'react/jsx-runtime', 'react-router-dom' (HashRouter only), 'motion/react', and relative imports inside 'landing/' (./theme, ../theme, ../sections/..., ../pages/..., ../_runtime/ImageAsset, etc.).
- **Fonts (hard rule)**: Never import font helpers from 'next/font/google' or 'next/font/local'. The ONLY allowed mechanism for loading Google Fonts is the idempotent ensureThemeFonts() helper in landing/theme.tsx, which appends \`<link rel="preconnect">\` + \`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?...">\` to document.head exactly once. Reference fonts in components via the semantic typography tokens exported by theme.tsx (e.g. style={{ fontFamily: fontDisplay }}), never via raw font-family strings or framework font helpers.
- **Imports must match exports (hard rule)**: For every relative import like \`import { x, y } from '../theme'\` (or \`./theme\`, \`../sections/Foo\`, \`./Bar\`, etc.), every name on the left side MUST already be a value export of the target file. Inventing names that "ought to exist" (e.g. \`colorBgNavbar\`, \`colorTextFooter\`, \`fontHero\`) breaks the bundle build with \`No matching export\` and the iframe will fail to render. When the prompt includes the target file's source, treat the listed exports as the only valid identifiers — pick the closest existing semantic token instead of inventing a new one. If you genuinely need a token that does not yet exist, do not silently add the import; either use an existing token, or accept that this file cannot add the new export (only the file that owns it can).
- In section/page files, do NOT define new colors or font families. Do not introduce hex/rgb/hsl color literals, ad-hoc font-family strings, or new one-off color/font decisions in those files.
- In section/page files, consume typography and color values from landing/theme.tsx exports (semantic tokens and helpers). Prefer semantic theme token names for typography (for example fontDisplay/fontBody/fontHeading) and semantic color tokens (for example colorBgBase/colorTextPrimary/colorAccent) instead of hardcoded utilities.
- Do not import Google Fonts or define @font-face rules inside section/page files. Keep font loading global through landing/theme.tsx by exposing an idempotent helper that appends preconnect + stylesheet links into document.head. Use inline style props only for truly dynamic values that cannot be expressed cleanly with Tailwind utilities.
- Prioritize responsiveness as a first-class requirement. Build mobile-first, then scale up cleanly for tablet and desktop without overflow, collisions, cramped copy, broken grids, or inaccessible tap targets.
- When the section uses meaningful animation, import from 'motion/react' and implement the main entrances, reveals, staggers, or hover choreography with motion components/variants. Do not rely on custom CSS animation or Tailwind 'animate-*' classes for the primary animated experience.
- For real imagery, render only resolved site assets with ImageAsset aliases. Never invent raw image URLs, placeholder CDN URLs, or direct stock-provider URLs in the generated TSX.
- When site assets are provided in context, copy the alias exactly as given in the manifest. Never rewrite "hero.jpg" into something like "hero-warm-and-cozy.jpg".
- Never create or modify files under landing/_runtime/. Those runtime helpers are reserved and provided by the system.
- Do not create custom inline SVG artwork, decorative SVG backgrounds, or hand-written SVG illustrations unless the user explicitly requests SVG-based graphics.
- The code must be valid JSX/TSX and self-contained for this file.
- **File structure (strict)**: Put ALL import statements at the very top of the file. Then output exactly ONE default-export component. Do NOT repeat the component, do NOT put imports after the component, and do NOT duplicate any part of the file. Correct order: first every import line, then the single export default function ... { ... }. Example for a page file: first line "import Hero from '../sections/Hero';", then blank line, then "export default function Home() { return (...); }" once only.
- If destination is exactly "landing/index.tsx", output a WIREFRAME ONLY: import { HashRouter, Routes, Route } from 'react-router-dom', plus Navbar, Footer, and only the page components that are actually part of the current site plan. Also import { ensureThemeFonts } from './theme' and call ensureThemeFonts() once near top-level so global Google Font links are applied from a single source. Wrap everything in <HashRouter>. Use <Routes> and include only the real planned routes, e.g. just <Route path=\"/\" element={<Home />} /> for a single-page site. Do NOT import or route to About/Contact/etc. unless those page files are meant to exist. Do NOT use window.location.hash or manual switch. Do NOT put navbar/footer markup inline. Do NOT output <!DOCTYPE html>, <html>, <head>, or <body>.
- If destination is exactly "landing/theme.tsx", output a single token module that is the REQUIRED source of truth for typography and color design values used across the site. Include exported semantic typography tokens (for example fontDisplay, fontBody, fontHeading, fontMono, fontAccent), exported semantic color tokens (for example colorBgBase, colorBgSurface, colorTextPrimary, colorTextMuted, colorBorder, colorAccent), and any shared class/value helpers needed by sections/pages. Export fontSans and fontSerif for section compatibility as aliases to semantic typography tokens rather than as the primary naming scheme.
  - **Font loading (theme.tsx ONLY mechanism)**: Export an idempotent helper named \`ensureThemeFonts\` that, when called in the browser, appends \`<link rel="preconnect" href="https://fonts.googleapis.com">\`, \`<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous">\`, and exactly one \`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=...&display=swap">\` to \`document.head\`. Use a module-level boolean flag (or \`document.getElementById\`) to make the function safe to call multiple times. The typography token exports (fontDisplay, fontBody, etc.) are then plain CSS font-family strings that name those fonts (e.g. \`export const fontDisplay = '"Merriweather", Georgia, serif';\`).
  - **Forbidden in theme.tsx**: do NOT import from 'next/font/google', 'next/font/local', or any 'next/*' module. Do NOT use \`@font-face\` declarations or \`<style>\` blocks. Do NOT call browser APIs at module top level — guard with \`if (typeof document === "undefined") return;\` inside ensureThemeFonts so the file is safe to evaluate before the document exists.
  - Concrete example shape:
\`\`\`tsx
let fontsInjected = false;
export function ensureThemeFonts() {
  if (fontsInjected) return;
  if (typeof document === "undefined") return;
  fontsInjected = true;
  const head = document.head;
  const preconnect1 = document.createElement("link");
  preconnect1.rel = "preconnect"; preconnect1.href = "https://fonts.googleapis.com";
  head.appendChild(preconnect1);
  const preconnect2 = document.createElement("link");
  preconnect2.rel = "preconnect"; preconnect2.href = "https://fonts.gstatic.com"; preconnect2.crossOrigin = "anonymous";
  head.appendChild(preconnect2);
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&family=Lato:wght@400;700&display=swap";
  head.appendChild(stylesheet);
}
export const fontDisplay = '"Merriweather", Georgia, serif';
export const fontBody = '"Lato", system-ui, sans-serif';
// ... plus other semantic tokens, colors, fontSans/fontSerif aliases
\`\`\`
- If destination is under "landing/pages/", output a single default-export React component (e.g. export default function Home() { ... }). Import section components from '../sections/...' and render them. Do NOT include document structure.
- If destination is under "landing/sections/", output a single default-export React component (e.g. export default function Hero() { ... }). Do NOT include document structure or import other landing sections unless needed. Do NOT define new colors or font families in this file; use only tokens/helpers imported from '../theme' for color/typography decisions.
- Do NOT include scripts or useEffect for non-routing logic unless explicitly requested.

**Quality rules**
- Keep structure clean and minimal (MVP).
- Ensure good spacing and readable typography (avoid overly large hero headings).
- Use accessible markup: semantic elements, headings in order, labeled form fields, alt text for images, and visible focus states.
- If you use an uploaded site asset, render it with the ImageAsset component and reference the provided asset alias, never a raw blob URL.
- Make responsiveness a priority, not a final polish pass. Start mobile-first, use Tailwind breakpoints deliberately (e.g., sm:, md:, lg:), and ensure the layout reads well on narrow phones, common tablets, and desktop widths.
- Check responsive failure modes while generating: no horizontal scrolling, no text or controls overlapping imagery, no unusably small tap targets, and no sections whose visual hierarchy collapses on smaller screens.
- Use realistic placeholder content if specifics are missing, but never invent business facts.
- Prefer image-forward sections **only when resolved ImageAsset aliases are available in context**. When the site images context states that no assets are registered, do NOT use external image URLs as substitutes — instead build visual richness through gradients, layered backgrounds, typography, and motion. Placeholder Unsplash or stock URLs are never acceptable.
- When assets ARE available, use them prominently across the hero and several supporting sections, not just as small accents.

Before finalizing output, run an internal check:
- User constraints are satisfied.
- Destination/file hard requirements are satisfied.
- Established site colors/tokens/components remain coherent.
- Inspiration meaningfully shaped layout/composition (not just minor styling tweaks).

**Frontend aesthetics**
${FRONTEND_AESTHETICS_GUIDANCE}

**Art direction**
${LANDING_PAGE_ART_DIRECTION_GUIDANCE}

**Composition**
- Include only what belongs to this file (no unrelated sections).
- Use consistent container and spacing patterns (e.g., max-w-6xl mx-auto px-4 py-12).
- Start from a strong visual thesis, not a safe default layout.
- Build at least one memorable compositional move into the file when appropriate: an asymmetric arrangement, layered image/text overlap, editorial framing, a distinctive card system, a surprising transition, or another brand-appropriate device.
- Avoid making every section a centered stack of heading, paragraph, and uniform cards.
- Vary section rhythm and alignment so the overall page feels authored rather than assembled from repeated blocks.
- If the section needs a CTA button, use clear safe navigation. In HashRouter apps, avoid raw href="#section" for primary nav; use Link for route changes and click handlers for section scrolling.
- If image assets are available for this section, use them prominently and thoughtfully. Prefer uploaded user assets when provided; otherwise use the resolved stock asset aliases already available in context.
- Treat asset aliases as strict IDs, not descriptive suggestions. Use the exact alias from context for the matching slot.
- Do not treat imagery as a one-off accent. If the section can credibly support visuals, prefer a richer composition with photos, product shots, portraits, or supporting images so the page feels visually dense in a polished way.
- CSS animation is fallback-only. If you need only a tiny ambient loop, keep it secondary and subtle; the section should still rely primarily on 'motion/react' for any notable animation.

**Design consistency (when an established style profile is provided in context)**
- Match the established style profile: same color language, typography system, spacing rhythm, button/surface feel, and container patterns.
- Keep visual continuity at the system level (tokens and reusable patterns), while still allowing composition differences guided by inspiration.
- Reuse equivalent Tailwind patterns when they represent shared system choices, not one-off layout specifics.
- Prefer global typography and color tokens from landing/theme.tsx. Avoid section-level color/font overrides unless the user explicitly asks for a localized exception.
- When the established style profile indicates a strong gradient treatment, avoid stacking another equally strong gradient immediately after it. Keep continuity via color family/motif, but vary surface intensity to avoid seam breaks.

**Multi-page sites**
- For the entry (landing/index.tsx), use React Router: import { HashRouter, Routes, Route } from 'react-router-dom'. Wrap the app in <HashRouter>, put <Routes> and <Route path=\"/\" element={<Home />} /> etc. inside <main>. Do not use window.location.hash.
- Create landing/sections/Navbar.tsx and Footer.tsx. In Navbar use React Router's Link for real existing pages only: import { Link } from 'react-router-dom'; use links like <Link to=\"/\">Home</Link> and add About/Contact links only when those pages actually exist in the current site plan.
- Create one file per page under landing/pages/ (e.g. Home.tsx, About.tsx, Contact.tsx).

**Nav links and routing (critical for Navbar/Footer)**
- Use a **smart nav pattern** in HashRouter sites.
- Route links: use Link from react-router-dom, e.g. <Link to=\"/about\">About</Link>.
- Section links in navbar: do NOT use raw href="#sectionId". Instead, if already on "/" smooth-scroll to that section id; otherwise navigate to "/?scrollTo=sectionId" and let Home scroll on mount/effect.
- For section scrolling, every target id must exist (e.g. <section id="menu">).
- Do NOT use <a href=\"#/about\">; use <Link to=\"/about\"> for route navigation.

Now generate the section requested by the userRequest for the given destination.
  `.trim();
}

export function buildModificationContext(previousCodeVersion: string): string {
  return `\nThis is a modification request. The previous code version is:\n\n${previousCodeVersion}\n\nPlease modify ONLY the parts requested by the user while preserving the rest of the structure and content. Do not introduce <style> tags while fixing verification issues; use Tailwind utilities and inline style props only for truly dynamic values.`;
}

export function buildExistingSectionsContext(
  sections: Array<{
    path: string;
    sectionName: string;
    themeTokens: string[];
    typography: string[];
    colors: string[];
    layout: string[];
    surfaces: string[];
    interactions: string[];
    usesMotionReact: boolean;
  }>
): string {
  if (sections.length === 0) return "";

  const formatList = (items: string[]) =>
    items.length > 0 ? items.join(", ") : "none detected";

  const blocks = sections
    .map(
      (s) => `--- ${s.path} (${s.sectionName}) ---
- Theme tokens: ${formatList(s.themeTokens)}
- Typography signals: ${formatList(s.typography)}
- Color signals: ${formatList(s.colors)}
- Layout rhythm signals: ${formatList(s.layout)}
- Surface treatment signals: ${formatList(s.surfaces)}
- Interaction/motion class signals: ${formatList(s.interactions)}
- Uses motion/react: ${s.usesMotionReact ? "yes" : "no"}`
    )
    .join("\n\n");

  const heading =
    sections.length === 1
      ? "**Established style profile (derived from previous section; keep system continuity, not exact markup):**"
      : "**Established style profiles (derived from previous sections; keep system continuity, not exact markup):**";

  return `

${heading}

${blocks}

`;
}

export function buildLayoutContextSection(indexSource: string): string {
  const trimmed = indexSource.trim();
  if (!trimmed) return "";

  return `

**Current entry layout (landing/index.tsx)**  
The app shell below already wraps the site (HashRouter, Navbar, routes, Footer). Match route/page imports to what is imported here. Do not duplicate that shell inside this section or page file.

---
${trimmed}
---

`;
}

/**
 * Inject the current `landing/theme.tsx` source into the section/page codegen
 * prompt. This is the single most effective fix for the
 * "section imports a token theme.tsx does not export" failure mode (which
 * surfaces in the iframe as a `MISSING_NAMED_EXPORT` esbuild error). The LLM
 * cannot see the theme module without this — and routinely hallucinates names
 * like `colorBgNavbar` / `colorTextFooter` that were never declared. By
 * pasting the real source, every imported name can be checked against an
 * authoritative export list at generation time.
 */
export function buildThemeContextSection(themeSource: string): string {
  const trimmed = themeSource.trim();
  if (!trimmed) return "";

  return `

**Current theme tokens (landing/theme.tsx) — AUTHORITATIVE EXPORT LIST**
This is the *exact* source of \`landing/theme.tsx\` as it currently exists in the project. When this file imports anything from \`'../theme'\` or \`'./theme'\`, **only the names actually exported below are valid**. Importing any other identifier (e.g. inventing \`colorBgNavbar\`, \`colorTextFooter\`, \`fontHero\`) will fail the bundle build with a \`No matching export ...\` error and break the preview.

Rules:
- Every named import from theme MUST appear as a value export (\`export const\`, \`export let\`, \`export var\`, \`export function\`, or \`export class\`) in the source below.
- If a token you would like to use does not exist, **do not invent it** — use the closest existing semantic token (e.g. for navbar background prefer \`colorBgSurface\` or \`colorBgBase\`; for navbar text prefer \`colorTextPrimary\`; for footer surfaces prefer \`colorBgSurface\` or \`colorAccentDark\`; etc.). Reuse the existing palette and typography rather than introducing names that do not exist in this file.
- Do not import \`type\` aliases or \`interface\` symbols at runtime; those are TS-only.

---
${trimmed}
---

`;
}

export function buildUserRequestSection(userRequest: string): string {
  return `\nUser's request: ${userRequest}\n\nGenerate the complete React/JSX code now:`;
}

export function buildSiteAssetContextSection(siteAssetContext?: string): string {
  if (!siteAssetContext?.trim()) {
    return "";
  }

  return `\n\n${siteAssetContext.trim()}\n`;
}

export function buildInspirationContextSection(match: {
  description: string;
  section: string;
  tags: string[];
}): string {
  const tagLine =
    match.tags.length > 0 ? `\nTags (for context only): ${match.tags.join(", ")}` : "";

  return `

**Design inspiration (internal reference)**
The following is a retrieved design outline for a **${match.section}**-style section.

Apply it with this contract:
- Treat this inspiration as the primary guide for **layout/composition** decisions in this file (content hierarchy, block arrangement, spacing rhythm, visual pacing, asymmetry, framing devices, and motif placement).
- Use inspiration for structure first. Do **not** treat it as a source of required colors, exact typography families, or exact copy wording.
- Keep **established site colors/theme tokens** and explicit user color constraints higher priority than inspiration color hints.
- If color/style directions conflict, keep site/user constraints and still carry inspiration through structure and composition choices.
- Adapt to destination requirements, explicit user instructions, and site-wide constraints.
- Do not copy placeholder copy verbatim; translate the ideas into this section's real content and layout.
${tagLine}

<inspiration>
${match.description.trim()}
</inspiration>

`;
}
