export function buildCompletenessValidationPrompt(params: {
  siteSpec?: string;
  siteSnapshot: string;
}): string {
  const specSection = params.siteSpec?.trim()
    ? `\nUser requested site spec:\n${params.siteSpec.trim()}\n`
    : "\nUser requested site spec: (not provided)\n";

  return `
You are validating whether a generated landing site is complete.

Rules:
- Focus on missing required pages/sections/components based on code and user spec.
- Treat obvious omissions and broken composition as critical.
- Treat literal HTML **lowercase** \`<style>\` ... \`</style>\` tags in landing TSX as critical (section/page styling must use Tailwind). Do **not** flag: React \`style={{...}}\` props, CSS-module \`import styles from\`, variables named \`styles\`, or PascalCase components like \`<StyleSheet />\`.
- Prefer Motion for React via 'motion/react' for primary animation. If the site uses CSS/Tailwind animation as the main animation strategy instead of Motion for React, flag it. Custom CSS animation should be fallback-only.
- Prefer conservative findings; do not invent speculative requirements.
- Return STRICT JSON only matching this schema:
{
  "status": "pass" | "fail",
  "summary": string,
  "missingItems": string[],
  "criticalFindings": [{"issueCode": string, "message": string, "path"?: string, "suggestedFix"?: string}],
  "warningFindings": [{"issueCode": string, "message": string, "path"?: string, "suggestedFix"?: string}],
  "confidence": number
}

${specSection}
Current site files:
${params.siteSnapshot}
`.trim();
}
