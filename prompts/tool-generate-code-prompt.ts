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

export function buildModificationContext(previousCodeVersion: string): string {
  return `\nThis is a modification request. The previous code version is:\n\n${previousCodeVersion}\n\nPlease modify ONLY the parts requested by the user while preserving the rest of the structure and content.`;
}

export function buildUserRequestSection(userRequest: string): string {
  return `\nUser's request: ${userRequest}\n\nGenerate the complete HTML code now:`;
}
