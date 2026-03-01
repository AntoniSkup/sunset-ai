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
- Do NOT include <!DOCTYPE html>, <html>, <head>, or <body> in section/page files`;
}

export function createSectionPrompt(): string {
  return `
You are using the **create_section** tool.

**Purpose**
Generate exactly ONE React/TSX file for a landing site. Each tool call creates/updates exactly one file at the destination provided by the tool call (e.g., "landing/sections/Hero.tsx"). Your output MUST be only the content of that single file.

**Input (from the tool call)**
- destination: where this file will be saved (use it only to understand what you are building)
- userRequest: freeform instructions describing this file (content + style + any constraints)

**Output requirements**
- Output RAW React/JSX/TSX ONLY (no markdown, no explanations, no code fences).
- Use Tailwind CSS utility classes for ALL styling (no <style> tags, no external CSS). Use the className prop.
- The code must be valid JSX/TSX and self-contained for this file.
- **File structure (strict)**: Put ALL import statements at the very top of the file. Then output exactly ONE default-export component. Do NOT repeat the component, do NOT put imports after the component, and do NOT duplicate any part of the file. Correct order: first every import line, then the single export default function ... { ... }. Example for a page file: first line "import Hero from '../sections/Hero';", then blank line, then "export default function Home() { return (...); }" once only.
- If destination is exactly "landing/index.tsx", output a WIREFRAME ONLY: import { HashRouter, Routes, Route } from 'react-router-dom', plus Navbar, Footer, and page components. Wrap everything in <HashRouter>. Use <Routes> and <Route path=\"/\" element={<Home />} /> (and path=\"/about\" element={<About />} etc.) inside <main>. Do NOT use window.location.hash or manual switch. Do NOT put navbar/footer markup inline. Do NOT output <!DOCTYPE html>, <html>, <head>, or <body>.
- If destination is under "landing/pages/", output a single default-export React component (e.g. export default function Home() { ... }). Import section components from '../sections/...' and render them. Do NOT include document structure.
- If destination is under "landing/sections/", output a single default-export React component (e.g. export default function Hero() { ... }). Do NOT include document structure or import other landing sections unless needed.
- Do NOT include scripts or useEffect for non-routing logic unless explicitly requested.

**Quality rules**
- Keep structure clean and minimal (MVP).
- Ensure good spacing and readable typography (avoid overly large hero headings).
- Use accessible markup: semantic elements, headings in order, labeled form fields, alt text for images, and visible focus states.
- Make it responsive using Tailwind breakpoints (e.g., sm:, md:, lg:).
- Use realistic placeholder content if specifics are missing, but never invent business facts.

**Composition**
- Include only what belongs to this file (no unrelated sections).
- Use consistent container and spacing patterns (e.g., max-w-6xl mx-auto px-4 py-12).
- If the section needs a CTA button, use a clear label and a safe href (e.g. "#contact" for same-page section, or "#/contact" for a contact page in multi-page sites).

**Design consistency (when existing sections are provided)**
- Match the design of existing sections: same colors, typography, spacing, button styles, and container patterns.
- Use the same Tailwind classes for similar elements (e.g., if headings use text-2xl font-serif, use the same).
- Keep the visual language consistent across the entire site.

**Multi-page sites**
- For the entry (landing/index.tsx), use React Router: import { HashRouter, Routes, Route } from 'react-router-dom'. Wrap the app in <HashRouter>, put <Routes> and <Route path=\"/\" element={<Home />} /> etc. inside <main>. Do not use window.location.hash.
- Create landing/sections/Navbar.tsx and Footer.tsx. In Navbar use React Router's Link: import { Link } from 'react-router-dom'; use <Link to=\"/\">Home</Link>, <Link to=\"/about\">About</Link> (path with leading slash, no #). This makes navigation work in the preview.
- Create one file per page under landing/pages/ (e.g. Home.tsx, About.tsx, Contact.tsx).

**Nav links and routing (critical for Navbar/Footer)**
- **Single-page site** (one page with sections): Use in-page anchor links. Navbar links must be href="#sectionId" (no slash after #), e.g. href="#menu", href="#contact". Each section on the Home page MUST have a matching id (e.g. <section id="menu">).
- **Multi-page site** (separate pages): Use React Router. In landing/index.tsx use HashRouter, Routes, Route. In Navbar use Link from 'react-router-dom': <Link to=\"/\">Home</Link>, <Link to=\"/about\">About</Link>. Do NOT use <a href=\"#/about\">; use <Link to=\"/about\"> so routing works.

Now generate the section requested by the userRequest for the given destination.
  `.trim();
}

export function buildModificationContext(previousCodeVersion: string): string {
  return `\nThis is a modification request. The previous code version is:\n\n${previousCodeVersion}\n\nPlease modify ONLY the parts requested by the user while preserving the rest of the structure and content.`;
}

export function buildExistingSectionsContext(
  sections: Array<{ path: string; content: string }>
): string {
  if (sections.length === 0) return "";

  const blocks = sections
    .map((s) => `--- ${s.path} ---\n${s.content}`)
    .join("\n\n");

  return `

**Existing sections (match their design - colors, typography, spacing, button styles):**

${blocks}

`;
}

export function buildUserRequestSection(userRequest: string): string {
  return `\nUser's request: ${userRequest}\n\nGenerate the complete React/JSX code now:`;
}
