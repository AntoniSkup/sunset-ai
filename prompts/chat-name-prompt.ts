/**
 * Per-language guidance appended to the chat-name prompt. Mirrors the
 * "Response language" block in the main chat system prompt: it tells the
 * model what language the visible string should be in, plus enough
 * language-specific style notes to avoid the most common bad outputs
 * (loan-word soup, English Title Case, etc.).
 */
function buildChatNameLanguageBlock(language: string | undefined): string {
  const trimmed = language?.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();

  if (lower === "polish") {
    return `
**Język tytułu**
- Napisz tytuł po polsku.
- Używaj naturalnej polszczyzny — unikaj kalek z angielskiego ("strona landing page", "biznes online", "startup SaaS"). Preferuj naturalne odpowiedniki: "strona internetowa", "sklep online", "portfolio", "wizytówka", "lądowanie produktu" itp.
- Nazwy własne (marki, nazwy firm, technologii) zachowaj w oryginalnej formie. Nie tłumacz nazw produktów ani imion klientów.
- Stosuj polską kapitalizację zdaniową: tylko pierwsza litera tytułu i nazwy własne wielką literą. Nie używaj angielskiego Title Case.
- Krótko, rzeczowo, bez kropki na końcu i bez cudzysłowów.
`.trim();
  }

  if (lower === "english") {
    return "";
  }

  return `\n**Title language**\n- Write the title in ${trimmed}.\n- Use natural phrasing in ${trimmed}; avoid loan-word salad and English Title Case unless that is genuinely how titles look in ${trimmed}.\n- Keep proper nouns (brand, company, product names) in their original form.\n`.trim();
}

export function buildChatNamePrompt(
  userQuestion: string,
  responseLanguage?: string
): string {
  const langBlock = buildChatNameLanguageBlock(responseLanguage);
  const langSection = langBlock ? `\n\n${langBlock}\n` : "";

  return `You are an AI website builder agent.
Generate a short, descriptive title (max 60 characters) for a website project based on this request:

"${userQuestion}"
${langSection}
Respond with ONLY the title, no other text.
`;
}
