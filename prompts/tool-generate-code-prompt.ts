const FRONTEND_AESTHETICS_GUIDANCE = `
Frontend aesthetics:
- Avoid generic, "on distribution" frontend outputs and the common "AI slop" aesthetic.
- Make the UI feel distinctive, creative, and context-specific rather than like a cookie-cutter SaaS template.
- Typography is a primary design tool: choose beautiful, interesting font combinations and avoid defaulting to Inter, Roboto, Arial, system fonts, or the same overused choices repeatedly. Load custom web fonts via <link> elements (for example <link rel="stylesheet" href="https://fonts.googleapis.com/css2?...">) in the global HTML <head>, not inside section/page TSX.
- Commit to a cohesive color story. Use CSS variables when defining theme values or repeated colors. Prefer strong dominant tones with sharp accents over timid, evenly distributed palettes.
- Draw inspiration from IDE themes, editorial layouts, cultural aesthetics, music scenes, fashion, print design, and other unexpected references when appropriate.
- Use motion deliberately: prioritize a few memorable animation beats like staggered entrances, reveal effects, scroll-triggered entrances, and tactile hover states. Default to Motion for React via 'motion/react' for primary animation work. Use CSS/Tailwind animation only as a fallback for tiny ambient loops or very simple effects that do not warrant Motion.
- Build atmosphere with backgrounds: layer gradients, glows, subtle patterns, grid treatments, textures, or geometric effects instead of defaulting to a flat solid background.
- Avoid overused AI-generated aesthetics such as purple gradients on white, predictable app-store SaaS layouts, and bland visual hierarchies.
- Vary your choices across generations; do not keep reusing the same aesthetic defaults.
`.trim();

const LANDING_PAGE_ART_DIRECTION_GUIDANCE = `
Art direction process:
- Before writing code, silently decide on a clear design thesis for the page or section. The design thesis should define the emotional tone, conversion goal, and visual point of view in one sentence.
- Silently choose a reference world that gives the design a distinct voice, such as editorial magazine, luxury product campaign, underground music scene, museum catalog, cinematic tech noir, premium wellness brand, or modern industrial brochure.
- Silently define a signature motif and reuse it across the composition. Examples include a repeated framing device, a distinctive border treatment, a recurring glow/gradient language, a specific image crop system, a diagonal or offset grid, or a typography treatment that appears in multiple places.
- Silently choose a typography strategy, palette logic, layout rhythm, motion style, and image direction that all feel like they belong to the same art-directed system.
- Treat originality as a requirement, not a preference. Do not default to the usual startup hero + three feature cards + testimonial strip + CTA stack unless the brief clearly demands it.
- Include at least one section or compositional beat that feels unexpected, memorable, or visually ownable for the brand.
- Use contrast in scale, density, alignment, and pacing so the page does not feel uniformly templated from top to bottom.
- No more than two consecutive major sections should share the same layout pattern.
- Every major section should have a specific job in the conversion story and a composition that supports that job, rather than reusing the same heading + paragraph + cards structure.
- Before finalizing, silently review the result for template-like patterns or overused landing-page tropes and upgrade weak areas to something more distinctive.
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
- Do NOT include <!DOCTYPE html>, <html>, <head>, or <body> in section/page files
- Custom web fonts belong in the global HTML <head> via <link rel="stylesheet" href="..."> (never embedded font imports or @font-face blocks inside generated components)

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
- inspirationQuery (optional): when present, the server may inject a curated design-inspiration outline into this prompt. The injected block is labeled as inspiration only.

**Server-injected context (when applicable)**
- **Entry layout:** For section/page files, the current \`landing/index.tsx\` source may be included so you see the HashRouter shell, which pages exist, and Navbar/Footer imports.
- **Site images:** A list of available ImageAsset aliases (or a notice when none exist yet). Use only those aliases for real imagery; never invent URLs.

**Output requirements**
- Output RAW React/JSX/TSX ONLY (no markdown, no explanations, no code fences).
- Use Tailwind CSS utility classes for ALL styling (no <style> tags, no external CSS). Use the className prop.
- Do not import Google Fonts or define @font-face rules inside section/page files. Keep font loading global: add stylesheets with <link rel="stylesheet" ...> (and preconnect <link>s when appropriate) in the document <head>, not @import or font imports inside TSX. Use inline style props only for truly dynamic values that cannot be expressed cleanly with Tailwind utilities.
- When the section uses meaningful animation, import from 'motion/react' and implement the main entrances, reveals, staggers, or hover choreography with motion components/variants. Do not rely on custom CSS animation or Tailwind 'animate-*' classes for the primary animated experience.
- For real imagery, render only resolved site assets with ImageAsset aliases. Never invent raw image URLs, placeholder CDN URLs, or direct stock-provider URLs in the generated TSX.
- When site assets are provided in context, copy the alias exactly as given in the manifest. Never rewrite "hero.jpg" into something like "hero-warm-and-cozy.jpg".
- Never create or modify files under landing/_runtime/. Those runtime helpers are reserved and provided by the system.
- Do not create custom inline SVG artwork, decorative SVG backgrounds, or hand-written SVG illustrations unless the user explicitly requests SVG-based graphics.
- The code must be valid JSX/TSX and self-contained for this file.
- **File structure (strict)**: Put ALL import statements at the very top of the file. Then output exactly ONE default-export component. Do NOT repeat the component, do NOT put imports after the component, and do NOT duplicate any part of the file. Correct order: first every import line, then the single export default function ... { ... }. Example for a page file: first line "import Hero from '../sections/Hero';", then blank line, then "export default function Home() { return (...); }" once only.
- If destination is exactly "landing/index.tsx", output a WIREFRAME ONLY: import { HashRouter, Routes, Route } from 'react-router-dom', plus Navbar, Footer, and only the page components that are actually part of the current site plan. Wrap everything in <HashRouter>. Use <Routes> and include only the real planned routes, e.g. just <Route path=\"/\" element={<Home />} /> for a single-page site. Do NOT import or route to About/Contact/etc. unless those page files are meant to exist. Do NOT use window.location.hash or manual switch. Do NOT put navbar/footer markup inline. Do NOT output <!DOCTYPE html>, <html>, <head>, or <body>.
- If destination is under "landing/pages/", output a single default-export React component (e.g. export default function Home() { ... }). Import section components from '../sections/...' and render them. Do NOT include document structure.
- If destination is under "landing/sections/", output a single default-export React component (e.g. export default function Hero() { ... }). Do NOT include document structure or import other landing sections unless needed.
- Do NOT include scripts or useEffect for non-routing logic unless explicitly requested.

**Quality rules**
- Keep structure clean and minimal (MVP).
- Ensure good spacing and readable typography (avoid overly large hero headings).
- Use accessible markup: semantic elements, headings in order, labeled form fields, alt text for images, and visible focus states.
- If you use an uploaded site asset, render it with the ImageAsset component and reference the provided asset alias, never a raw blob URL.
- Make it responsive using Tailwind breakpoints (e.g., sm:, md:, lg:).
- Use realistic placeholder content if specifics are missing, but never invent business facts.
- Prefer image-forward sections when suitable. Most landing pages should use strong imagery not only in the hero, but also in several supporting sections where visuals improve clarity, mood, or perceived quality.
- Within reason, default to including one or more meaningful images in major sections unless the section is clearly better as text-only (for example simple nav, footer, or compact legal/utility content).

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

**Design consistency (when a previous section is provided in context)**
- Match the design of that section: same colors, typography, spacing, button styles, and container patterns.
- Use the same Tailwind classes for similar elements (e.g., if headings use text-2xl font-serif, use the same).
- Keep the visual language consistent with the rest of the site even if only one prior section file is shown for reference.

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
  sections: Array<{ path: string; content: string }>
): string {
  if (sections.length === 0) return "";

  const blocks = sections
    .map((s) => `--- ${s.path} ---\n${s.content}`)
    .join("\n\n");

  const heading =
    sections.length === 1
      ? "**Previous section (match its design—colors, typography, spacing, button styles):**"
      : "**Existing sections (match their design—colors, typography, spacing, button styles):**";

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
The following is a retrieved design outline for a **${match.section}**-style section. Use it only as loose visual and compositional inspiration—adapt it to this file's destination, the user's request, and the rest of the site. Do not copy placeholder copy; translate ideas into this section's real content and layout.
${tagLine}

---
${match.description.trim()}
---

`;
}
