import type { ScraperTitleAnalysisConfig } from "@/shared/scraper";
import {
  analyzeMangaCorrespondenceTitle,
  type MangaCorrespondenceTitleAnalysis,
} from "@/renderer/utils/mangaCorrespondenceTitleAnalysis";
import { partitionCorrespondenceAlternativeTitles } from "@/renderer/backgroundSearch/mangaCorrespondenceMatching";

const DERIVATIVE_RELEASE_PATTERN = /(?:^|[^\p{L}\p{N}])(?:ai[\s_-]*generated|ai[\s_-]*generation|oav\s*0*\d+|ova\s*0*\d+|\d+\s+images?)(?:$|[^\p{L}\p{N}])/iu;

const normalizeIdentityKey = (value: string): string => (
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase()
);

const uniqueIdentityValues = (values: Array<string | undefined>): string[] => {
  const seen = new Set<string>();
  return values.map((value) => value?.trim().replace(/\s+/g, " ") ?? "").filter((value) => {
    const key = normalizeIdentityKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const escapeRegex = (value: string): string => (
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
);

const buildFlexibleAuthorPattern = (value: string): string => (
  escapeRegex(value.trim()).replace(/\s+/g, "\\s*")
);

export const isClearlyDerivativeMangaCorrespondenceTitle = (
  rawTitle: string,
): boolean => (
  DERIVATIVE_RELEASE_PATTERN.test(String(rawTitle ?? "").normalize("NFKC"))
);

export const stripMangaCorrespondenceTrailingKnownAuthor = (
  rawTitle: string,
  knownAuthors: string[],
): string => {
  const title = String(rawTitle ?? "").trim();

  for (const author of knownAuthors) {
    const authorPattern = buildFlexibleAuthorPattern(author);
    if (!authorPattern) continue;

    const match = title.match(new RegExp(
      `^(?<title>.*?\\S)\\s*(?<chapter>[0-9０-９]{1,4}(?:[.,][0-9０-９]+)?)\\s*(?:[-–—:]\\s*)?${authorPattern}\\s*$`,
      "iu",
    ));
    if (match?.groups?.title && match.groups.chapter) {
      return `${match.groups.title} ${match.groups.chapter}`;
    }

    const leadingMatch = title.match(new RegExp(
      `^\\s*(?:\\[|\\()?\\s*${authorPattern}\\s*(?:\\]|\\))?\\s*[-–—:]\\s*(?<title>.+\\S)\\s*$`,
      "iu",
    ));
    if (leadingMatch?.groups?.title) {
      return leadingMatch.groups.title.trim();
    }

    const trailingMatch = title.match(new RegExp(
      `^(?<title>.+\\S)\\s*[-–—:]\\s*${authorPattern}\\s*$`,
      "iu",
    ));
    if (trailingMatch?.groups?.title) {
      return trailingMatch.groups.title.trim();
    }
  }

  return title;
};

export type MangaCorrespondenceSourceIdentity = {
  analysis: MangaCorrespondenceTitleAnalysis;
  titles: string[];
  titleAlternatives: string[];
  authorAlternatives: string[];
  authors: string[];
};

/**
 * Applies the same title/author identity extraction to listing cards and manually supplied detail pages.
 */
export const analyzeMangaCorrespondenceSourceIdentity = (options: {
  rawTitle: string;
  titleAnalysisConfig: ScraperTitleAnalysisConfig | null | undefined;
  knownAuthors?: string[];
  supplementalAuthors?: string[];
}): MangaCorrespondenceSourceIdentity => {
  const knownAuthors = uniqueIdentityValues(options.knownAuthors ?? []);
  const analysis = analyzeMangaCorrespondenceTitle(
    stripMangaCorrespondenceTrailingKnownAuthor(options.rawTitle, knownAuthors),
    options.titleAnalysisConfig,
  );
  const {
    titleAlternatives,
    authorAlternatives,
  } = partitionCorrespondenceAlternativeTitles(analysis.alternativeTitles, knownAuthors);
  const parsedAuthorKeys = analysis.authors.map(normalizeIdentityKey);
  const supplementalAuthors = (options.supplementalAuthors ?? []).filter((author) => (
    !parsedAuthorKeys.some((parsedAuthor) => normalizeIdentityKey(author).includes(parsedAuthor))
  ));
  const authors = uniqueIdentityValues([
    ...analysis.authors,
    ...supplementalAuthors,
    ...authorAlternatives,
  ]);

  return {
    analysis,
    titles: uniqueIdentityValues([analysis.title, ...titleAlternatives]),
    titleAlternatives,
    authorAlternatives,
    authors,
  };
};
