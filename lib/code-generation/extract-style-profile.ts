export type ExistingSectionStyleSnapshot = {
  path: string;
  sectionName: string;
  themeTokens: string[];
  typography: string[];
  colors: string[];
  layout: string[];
  surfaces: string[];
  interactions: string[];
  usesMotionReact: boolean;
};

const CLASSNAME_REGEX =
  /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{"([^"]*)"\}|\{'([^']*)'\})/g;

function splitClasses(input: string): string[] {
  return input
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function getTopTokens(
  allTokens: string[],
  matcher: (token: string) => boolean,
  limit = 6
): string[] {
  const counts = new Map<string, number>();
  for (const token of allTokens) {
    if (!matcher(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, limit)
    .map(([token]) => token);
}

function readClassTokens(content: string): string[] {
  const tokens: string[] = [];
  const re = new RegExp(CLASSNAME_REGEX);
  let match: RegExpExecArray | null = null;

  while ((match = re.exec(content))) {
    const classList =
      match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? "";
    tokens.push(...splitClasses(classList));
  }

  return tokens;
}

function readThemeTokens(content: string): string[] {
  const tokens = new Set<string>();
  const importRegex =
    /import\s*\{([^}]+)\}\s*from\s*['"](?:\.\.\/theme|\.\/theme)['"];?/g;
  let match: RegExpExecArray | null = null;

  while ((match = importRegex.exec(content))) {
    const names = match[1]
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean)
      .map((token) => token.split(/\s+as\s+/i)[0]?.trim() ?? token);
    for (const name of names) tokens.add(name);
  }

  return [...tokens].sort((a, b) => a.localeCompare(b));
}

function inferSectionName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const file = normalized.split("/").pop() ?? normalized;
  return file.replace(/\.[^.]+$/, "") || "Section";
}

export function extractSectionStyleSnapshot(
  path: string,
  content: string
): ExistingSectionStyleSnapshot {
  const classTokens = readClassTokens(content);
  const themeTokens = readThemeTokens(content);

  const typography = getTopTokens(
    classTokens,
    (token) =>
      /^font-/.test(token) ||
      /^(tracking-|leading-)/.test(token) ||
      /^text-(xs|sm|base|lg|xl|[2-9]xl)$/.test(token)
  );

  const colors = getTopTokens(
    classTokens,
    (token) =>
      /^(bg|text|border|ring|from|via|to|stroke|fill)-/.test(token) &&
      !/^text-(xs|sm|base|lg|xl|[2-9]xl)$/.test(token)
  );

  const layout = getTopTokens(
    classTokens,
    (token) =>
      /^(container|max-w|min-h|w-full|h-screen|mx-auto|px-|py-|pt-|pb-|gap-|grid|flex|items-|justify-)/.test(
        token
      )
  );

  const surfaces = getTopTokens(
    classTokens,
    (token) =>
      /^(rounded|shadow|backdrop-blur|border|ring|opacity-)/.test(token)
  );

  const interactions = getTopTokens(
    classTokens,
    (token) =>
      /^(hover:|focus:|focus-visible:|transition|duration-|ease-|active:)/.test(
        token
      )
  );

  const usesMotionReact = /from\s+['"]motion\/react['"]/.test(content);

  return {
    path,
    sectionName: inferSectionName(path),
    themeTokens,
    typography,
    colors,
    layout,
    surfaces,
    interactions,
    usesMotionReact,
  };
}
