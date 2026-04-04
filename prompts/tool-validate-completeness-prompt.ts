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
- Treat inline <style> tags in generated landing files as critical because section/page styling must use Tailwind utilities instead.
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
