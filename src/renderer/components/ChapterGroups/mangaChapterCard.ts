import { buildMultiSearchResultLanguageFilterCodes } from "@/renderer/components/MultiSearch/multiSearchLanguageFilters";
import { buildMultiSearchSourceIdentityKey } from "@/renderer/components/MultiSearch/multiSearchMerge";
import { selectPreferredMultiSearchTitleSource } from "@/renderer/components/MultiSearch/multiSearchTitleSelection";
import type {
  MultiSearchMergeOptions,
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";

type BuildMangaChapterCardOptions = {
  chapter: string;
  fallbackTitle: string;
  idPrefix: string;
  mergeOptions: MultiSearchMergeOptions;
  sources: MultiSearchSourceResult[];
};

export const buildMangaChapterCard = ({
  chapter,
  fallbackTitle,
  idPrefix,
  mergeOptions,
  sources,
}: BuildMangaChapterCardOptions): MultiSearchMergedResult | undefined => {
  const seenSourceKeys = new Set<string>();
  const uniqueSources = sources.filter((source) => {
    const key = buildMultiSearchSourceIdentityKey(source);
    if (seenSourceKeys.has(key)) return false;
    seenSourceKeys.add(key);
    return true;
  });
  if (!uniqueSources.length) return undefined;

  const preferredSource = selectPreferredMultiSearchTitleSource(
    uniqueSources,
    mergeOptions.preferredTitleLanguageCodes,
  );
  return {
    id: `${idPrefix}::chapter::${chapter}`,
    title: preferredSource?.result.title || fallbackTitle,
    coverUrl: preferredSource?.result.thumbnailUrl,
    summary: uniqueSources.find((source) => source.result.summary)?.result.summary,
    pageCount: uniqueSources.find((source) => source.result.pageCount)?.result.pageCount,
    sources: uniqueSources,
    sourceLanguageCodes: buildMultiSearchResultLanguageFilterCodes(uniqueSources),
    tentativeAuthorNames: Array.from(new Set(
      uniqueSources.flatMap((source) => source.tentativeAuthorNames),
    )),
    contentTypes: Array.from(new Set(uniqueSources.flatMap((source) => source.contentTypes))),
    preferredTitleLanguageCodes: [...mergeOptions.preferredTitleLanguageCodes],
  };
};
