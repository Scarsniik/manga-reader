import { isTitleLanguageMarker } from "@/renderer/utils/languageDetection";

const TENTATIVE_AUTHOR_PREFIX_PATTERN = /^\s*(?:\([^)]*\)\s*)*(?:\[\s*([^\]]+?)\s*]\s*)+/;
const TENTATIVE_AUTHOR_NAME_PATTERN = /\[\s*([^\]]+?)\s*]/g;

const normalizeListValue = (value: unknown): string => (
  String(value ?? "").trim().replace(/\s+/g, " ")
);

const splitTentativeAuthorName = (value: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  Array.from(value).forEach((char) => {
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
    }

    if (char === ")" || char === "]" || char === "}") {
      depth = Math.max(0, depth - 1);
    }

    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      return;
    }

    current += char;
  });

  parts.push(current);
  return parts.map(normalizeListValue).filter(Boolean);
};

const collectTentativeAuthorNames = (value: string): string[] => {
  const author = normalizeListValue(value);
  if (!author || isTitleLanguageMarker(author)) {
    return [];
  }

  const splitAuthors = splitTentativeAuthorName(author)
    .filter((splitAuthor) => !isTitleLanguageMarker(splitAuthor));

  return Array.from(new Set([author, ...splitAuthors]));
};

export const extractTentativeAuthorNamesFromTitle = (title: string): string[] => {
  const prefixMatch = title.match(TENTATIVE_AUTHOR_PREFIX_PATTERN);
  if (!prefixMatch) {
    return [];
  }

  const seen = new Set<string>();
  const authors: string[] = [];

  Array.from(prefixMatch[0].matchAll(TENTATIVE_AUTHOR_NAME_PATTERN)).forEach((match) => {
    collectTentativeAuthorNames(match[1]).forEach((author) => {
      const key = author.toLowerCase();
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      authors.push(author);
    });
  });

  return authors;
};
