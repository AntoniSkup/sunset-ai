import { parse } from "node-html-parser";
import type { CodeValidationResult } from "./types";

function stripMarkdownCodeFences(input: string): {
  code: string;
  stripped: boolean;
} {
  if (!input) return { code: input, stripped: false };

  let code = input.trim();
  let stripped = false;

  if (code.startsWith("```")) {
    const before = code;
    code = code.replace(/^```[^\r\n]*\r?\n/, "");
    code = code.replace(/\r?\n```$/, "");
    code = code.replace(/```$/, "");
    code = code.trim();
    stripped = code !== before.trim();
  }

  return { code, stripped };
}

export function parseAndValidateHTML(html: string): {
  isValid: boolean;
  root: ReturnType<typeof parse> | null;
  errors: string[];
} {
  try {
    const root = parse(html);
    const errors: string[] = [];

    if (!root.querySelector("html")) {
      errors.push("Missing <html> tag");
    }

    if (!root.querySelector("head")) {
      errors.push("Missing <head> tag");
    }

    if (!root.querySelector("body")) {
      errors.push("Missing <body> tag");
    }

    return {
      isValid: errors.length === 0,
      root,
      errors,
    };
  } catch (error) {
    return {
      isValid: false,
      root: null,
      errors: [error instanceof Error ? error.message : "Failed to parse HTML"],
    };
  }
}

export function fixCommonErrors(html: string): {
  fixedCode: string;
  fixesApplied: string[];
} {
  const fixesApplied: string[] = [];
  let fixedCode = html;

  const unclosedTagPattern = /<(\w+)([^>]*)>(?!.*<\/\1>)/g;
  const matches = Array.from(html.matchAll(unclosedTagPattern));

  const tagStack: string[] = [];
  const openTags = new Set<string>();

  matches.forEach((match) => {
    const tagName = match[1];
    if (!openTags.has(tagName)) {
      openTags.add(tagName);
      tagStack.push(tagName);
    }
  });

  if (tagStack.length > 0) {
    const closingTags = tagStack
      .reverse()
      .map((tag) => `</${tag}>`)
      .join("");
    fixedCode = fixedCode + closingTags;
    fixesApplied.push(`Closed ${tagStack.length} unclosed tag(s)`);
  }

  if (!fixedCode.includes("<!DOCTYPE html>")) {
    fixedCode = "<!DOCTYPE html>\n" + fixedCode;
    fixesApplied.push("Added missing DOCTYPE declaration");
  }

  if (!fixedCode.includes("<html")) {
    fixedCode = "<html>\n" + fixedCode + "\n</html>";
    fixesApplied.push("Wrapped content in <html> tags");
  }

  return {
    fixedCode,
    fixesApplied,
  };
}

export async function validateAndFixCode(
  code: string
): Promise<CodeValidationResult> {
  if (!code || code.trim().length === 0) {
    return {
      isValid: false,
      fixedCode: code,
      fixesApplied: [],
      errors: ["Code content is empty"],
    };
  }

  if (code.length > 1024 * 1024) {
    return {
      isValid: false,
      fixedCode: code,
      fixesApplied: [],
      errors: ["Code exceeds maximum size limit of 1MB"],
    };
  }

  const stripped = stripMarkdownCodeFences(code);
  const fixesAppliedPrefix = stripped.stripped
    ? ["Removed markdown code fences"]
    : [];

  const parseResult = parseAndValidateHTML(stripped.code);

  if (parseResult.isValid) {
    return {
      isValid: true,
      fixedCode: stripped.code,
      fixesApplied: fixesAppliedPrefix,
      errors: [],
    };
  }

  const fixResult = fixCommonErrors(stripped.code);
  const reparseResult = parseAndValidateHTML(fixResult.fixedCode);

  return {
    isValid: reparseResult.isValid,
    fixedCode: fixResult.fixedCode,
    fixesApplied: [...fixesAppliedPrefix, ...fixResult.fixesApplied],
    errors: reparseResult.errors,
  };
}
