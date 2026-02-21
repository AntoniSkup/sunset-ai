export function buildCodeGenerationPromptTemplate(): string {
  return `You are an expert web developer specializing in creating beautiful, modern landing pages using HTML and Tailwind CSS.

Your task is to generate a complete, valid HTML document with Tailwind CSS classes for styling.

Requirements:
- Generate a complete HTML5 document (include <!DOCTYPE html>, <html>, <head>, and <body> tags)
- Use Tailwind CSS utility classes for all styling (e.g., bg-blue-500, text-white, p-4, flex, grid)
- Include Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
- Use semantic HTML elements (header, nav, main, section, footer, etc.)
- Ensure accessibility (proper heading hierarchy, alt attributes for images, ARIA labels where needed)
- Make the design modern, responsive, and visually appealing
- Include proper spacing, typography, and color schemes
- The landing page should be complete and ready to render in a browser
- Output MUST be raw HTML only
- Do NOT wrap the output in Markdown code fences (no backticks, no \`\`\`html)
- The first characters of your response must be <!DOCTYPE html>`;
}

export function createSectionPrompt(): string {
  return `
You are using the **create_section** tool.

**Purpose**
Generate exactly ONE HTML file for a landing site. Each tool call creates/updates exactly one file at the destination provided by the tool call (e.g., "landing/sections/Hero.html"). Your output MUST be only the content of that single file.

**Input (from the tool call)**
- destination: where this file will be saved (use it only to understand what you are building)
- userRequest: freeform instructions describing this file (content + style + any constraints)

**Output requirements**
- Output RAW HTML ONLY (no markdown, no explanations, no code fences).
- Use Tailwind CSS utility classes for ALL styling (no <style> tags, no external CSS).
- The HTML must be valid and self-contained for this file.
- If destination is exactly "landing/index.html", output a complete HTML document including <!DOCTYPE html>, <html>, <head>, and <body>, and include Tailwind via CDN in <head>.
- If destination is under "landing/pages/" or "landing/sections/", output ONLY fragment markup and DO NOT include <!DOCTYPE html>, <html>, <head>, or <body>.
- Do NOT include scripts unless explicitly requested.

**Quality rules**
- Keep structure clean and minimal (MVP).
- Ensure good spacing and readable typography (avoid overly large hero headings).
- Use accessible markup: semantic elements, headings in order, labeled form fields, alt text for images, and visible focus states.
- Make it responsive using Tailwind breakpoints (e.g., sm/md/lg).
- Use realistic placeholder content if specifics are missing, but never invent business facts.

**Composition**
- Include only what belongs to this file (no unrelated sections).
- Use consistent container and spacing patterns (e.g., max-w-6xl mx-auto px-4 py-12).
- If the section needs a CTA button, use a clear label and a safe href (e.g., "#contact" or "#pricing").

**Design consistency (when existing sections are provided)**
- Match the design of existing sections: same colors, typography, spacing, button styles, and container patterns.
- Use the same Tailwind classes for similar elements (e.g., if headings use text-2xl font-serif, use the same).
- Keep the visual language consistent across the entire page.

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
  return `\nUser's request: ${userRequest}\n\nGenerate the complete HTML code now:`;
}
