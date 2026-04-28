import { routing, type AppLocale } from "@/i18n/routing";

/**
 * Lightweight, dependency-free language detection for chat input.
 *
 * The goal is to bias the AI's response/output language toward what the user
 * actually wrote in their first message. We only need to distinguish between
 * the locales the app supports today (`en` and `pl`), so a small character /
 * common-word heuristic is enough.
 *
 * Returns `null` when the input is too short or too ambiguous to commit to a
 * specific locale. Callers should fall back to the user's account locale or
 * the default in that case.
 */

const SUPPORTED: ReadonlySet<string> = new Set(routing.locales);

const POLISH_DIACRITICS = /[ąćęłńóśźż]/i;

const POLISH_FUNCTION_WORDS = new Set([
  "i",
  "w",
  "na",
  "do",
  "z",
  "ze",
  "od",
  "po",
  "za",
  "się",
  "nie",
  "tak",
  "to",
  "jest",
  "są",
  "był",
  "była",
  "było",
  "być",
  "moja",
  "moje",
  "mój",
  "mojego",
  "mojej",
  "mojego",
  "mojego",
  "twoja",
  "twoje",
  "twój",
  "ten",
  "ta",
  "te",
  "ci",
  "tym",
  "który",
  "która",
  "które",
  "jak",
  "lub",
  "albo",
  "ale",
  "oraz",
  "dla",
  "też",
  "też",
  "tylko",
  "więc",
  "żeby",
  "aby",
  "bo",
  "ponieważ",
  "kiedy",
  "gdy",
  "gdzie",
  "czy",
  "co",
  "kto",
  "ile",
  "moim",
  "twoim",
  "naszej",
  "naszego",
  "stronę",
  "strone",
  "strona",
  "strony",
  "zrób",
  "zrob",
  "stwórz",
  "stworz",
  "zbuduj",
  "potrzebuję",
  "potrzebuje",
  "chcę",
  "chce",
  "chciałbym",
  "chcialbym",
  "chciałabym",
  "chcialabym",
  "może",
  "moze",
  "musi",
  "muszę",
  "musze",
  "mam",
  "masz",
  "mamy",
  "macie",
  "mają",
  "maja",
  "klient",
  "klienta",
  "klienci",
  "firmy",
  "firma",
  "firmę",
  "firme",
  "firmowej",
  "kawiarni",
  "kawiarnia",
  "restauracji",
  "restauracja",
  "biznesu",
  "biznes",
  "produktu",
  "produkt",
  "produkty",
  "usługi",
  "usluga",
  "uslugi",
  "usługa",
]);

const ENGLISH_FUNCTION_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "to",
  "of",
  "in",
  "on",
  "at",
  "for",
  "with",
  "from",
  "by",
  "as",
  "this",
  "that",
  "these",
  "those",
  "i",
  "you",
  "we",
  "they",
  "he",
  "she",
  "it",
  "my",
  "your",
  "our",
  "their",
  "his",
  "her",
  "its",
  "make",
  "create",
  "build",
  "need",
  "want",
  "would",
  "should",
  "could",
  "will",
  "page",
  "site",
  "website",
  "landing",
  "business",
  "product",
  "service",
  "shop",
  "store",
  "restaurant",
  "company",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .filter((w) => w.length > 0);
}

/**
 * Return the most likely locale (`"en" | "pl"`) for the given text, or `null`
 * when the signal is too weak to be confident.
 *
 * Heuristic, in order of strength:
 * 1. Polish-specific diacritics (ą, ć, ę, ł, ń, ó, ś, ź, ż) are a near-certain
 *    signal for Polish.
 * 2. Token overlap with a small set of high-frequency function words
 *    (Polish vs. English) decides remaining cases.
 * 3. Texts shorter than ~3 meaningful tokens with no diacritics return `null`.
 */
export function detectChatLocale(text: string): AppLocale | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (POLISH_DIACRITICS.test(trimmed)) {
    return "pl";
  }

  const tokens = tokenize(trimmed);
  if (tokens.length < 3) return null;

  let plScore = 0;
  let enScore = 0;
  for (const token of tokens) {
    if (POLISH_FUNCTION_WORDS.has(token)) plScore += 1;
    if (ENGLISH_FUNCTION_WORDS.has(token)) enScore += 1;
  }

  if (plScore === 0 && enScore === 0) return null;
  if (plScore > enScore) return "pl";
  if (enScore > plScore) return "en";
  return null;
}

/**
 * Resolve the locale to use for AI output (chat replies, generated landing
 * page copy, generated chat title), preferring (in order):
 *   1. The chat record's pinned `responseLanguage` (locked on first message).
 *   2. Detection from the message text itself.
 *   3. The user's account `locale` preference.
 *   4. The app default locale.
 */
export function resolveAiOutputLocale(opts: {
  chatResponseLanguage?: string | null;
  detectFromText?: string | null;
  userLocale?: string | null;
}): AppLocale {
  const fallback = routing.defaultLocale;

  if (opts.chatResponseLanguage && SUPPORTED.has(opts.chatResponseLanguage)) {
    return opts.chatResponseLanguage as AppLocale;
  }

  if (opts.detectFromText) {
    const detected = detectChatLocale(opts.detectFromText);
    if (detected) return detected;
  }

  if (opts.userLocale && SUPPORTED.has(opts.userLocale)) {
    return opts.userLocale as AppLocale;
  }

  return fallback;
}

/**
 * Human-readable English label for a locale, suitable for inlining into an
 * AI system prompt (e.g. "Respond in Polish.").
 */
export function localeLanguageLabel(locale: AppLocale): string {
  switch (locale) {
    case "pl":
      return "Polish";
    case "en":
    default:
      return "English";
  }
}
