import { stripTitleLanguageMarkers } from "@/renderer/utils/languageDetection";

export const normalizeCorrespondenceTitle = (value: string): string => (
  stripTitleLanguageMarkers(value)
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(
      /\b(?:[\p{L}\p{N}]\s*\.\s*){2,}/gu,
      (initialism) => {
        const trailingWhitespace = initialism.match(/\s+$/u)?.[0] ?? "";
        return `${initialism.replace(/[.\s]/g, "")}${trailingWhitespace}`;
      },
    )
    .replace(/[’'`]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
);

export const doesCorrespondenceTitleContainKnownTitle = (
  candidateTitle: string,
  knownTitle: string,
): boolean => {
  const candidate = normalizeCorrespondenceTitle(candidateTitle);
  const known = normalizeCorrespondenceTitle(knownTitle);
  if (!candidate || !known) return false;
  if (candidate === known) return true;

  // Avoid accepting incidental occurrences for very short titles while still
  // supporting compact CJK titles when the whole normalized value matches.
  if (Array.from(known).length < 4) return false;
  return ` ${candidate} `.includes(` ${known} `);
};

export const extractCorrespondenceBareHashChapter = (value: string): string | undefined => {
  const chapters = Array.from(value.matchAll(/#\s*([0-9０-９]+(?:[.,][0-9０-９]+)?)/gu))
    .map((match) => match[1].normalize("NFKC").replace(",", "."));
  const uniqueChapters = Array.from(new Set(chapters));
  return uniqueChapters.length === 1 ? uniqueChapters[0] : undefined;
};
