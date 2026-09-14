import type { MangaCorrespondenceBackgroundInput } from "@/shared/backgroundSearch";
import type { MangaCorrespondenceMatch } from "@/renderer/backgroundSearch/types";
import { buildMultiSearchSourceIdentityKey } from "@/renderer/components/MultiSearch/multiSearchMerge";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";

const uniqueValues = (values: Array<string | undefined>): string[] => Array.from(new Set(
  values.map((value) => value?.trim() ?? "").filter(Boolean),
));

export const buildMangaCorrespondenceReferenceMatch = (
  input: MangaCorrespondenceBackgroundInput | null | undefined,
): MangaCorrespondenceMatch | null => {
  const reference = input?.reference;
  if (!input || !reference) return null;
  const scraper = input.scrapers.find((candidate) => candidate.id === reference.scraperId);
  const sourceUrl = reference.sourceUrl.trim();
  const rawTitle = reference.rawTitle.trim() || reference.title.trim();
  const analyzedTitle = reference.title.trim() || rawTitle;
  if (!scraper || !sourceUrl || !rawTitle || !analyzedTitle) return null;

  const sourceLanguageCodes = uniqueValues(scraper.globalConfig.sourceLanguages ?? []);
  const detectedLanguageCodes = uniqueValues(reference.languageCodes ?? []);
  const source: MultiSearchSourceResult = {
    scraper,
    result: {
      title: rawTitle,
      detailUrl: sourceUrl,
      detailsMetadataFetched: true,
      detailsTitle: rawTitle,
      detailsSourceUrl: sourceUrl,
      authorNames: reference.authors,
      authorUrls: reference.authorUrls,
      thumbnailUrl: reference.thumbnailUrl,
      thumbnailCandidates: reference.thumbnailCandidates,
      summary: reference.summary,
      pageCount: reference.pageCount,
      languageCodes: detectedLanguageCodes,
    },
    searchTerm: analyzedTitle,
    pageIndex: 0,
    sourceLanguageCodes,
    detectedLanguageCodes,
    tentativeAuthorNames: uniqueValues(reference.authors),
    contextualAuthorNames: uniqueValues(reference.authors),
    advancedRomanizedTitleVariants: [],
    advancedRomanizedTentativeAuthorNameVariants: [],
    advancedRomanizedContextualAuthorNameVariants: [],
    contentTypes: uniqueValues(scraper.globalConfig.contentTypes ?? []),
    canOpenDetails: true,
  };

  return {
    key: buildMultiSearchSourceIdentityKey(source),
    source,
    analyzedTitle,
    alternativeTitles: uniqueValues(reference.alternativeTitles),
    authors: uniqueValues(reference.authors),
    chapter: reference.chapter?.trim() || undefined,
    matchedTerm: analyzedTitle,
    discoveredByStepIds: [],
  };
};

export const includeMangaCorrespondenceReferenceMatch = (
  input: MangaCorrespondenceBackgroundInput | null | undefined,
  matches: MangaCorrespondenceMatch[],
): MangaCorrespondenceMatch[] => {
  const referenceMatch = buildMangaCorrespondenceReferenceMatch(input);
  if (!referenceMatch || matches.some((match) => match.key === referenceMatch.key)) return matches;
  return [referenceMatch, ...matches];
};
