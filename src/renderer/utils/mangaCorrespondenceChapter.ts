import type { MangaCorrespondenceTitleAnalysis } from "@/renderer/utils/mangaCorrespondenceTitleAnalysis";

const NON_CHAPTER_RELEASE_PATTERN = /(?:^|[^\p{L}\p{N}])(?:extra|extras|bonus|omake|special|side[\s-]*story|after[\s-]*story|afterword|epilogue|prologue|encore|interlude|appendix|ongoing|complete|compilation|soush(?:u+|ū)hen|総集編|おまけ|番外編|特別編)(?:$|[^\p{L}\p{N}])/iu;

const normalizeComparableTitle = (value: string): string => (
  value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
);

const containsNonChapterReleaseMarker = (
  analysis: MangaCorrespondenceTitleAnalysis,
): boolean => (
  [
    analysis.parody,
    ...analysis.suffixTags,
    ...analysis.unmatchedParts,
  ].some((value) => NON_CHAPTER_RELEASE_PATTERN.test(String(value ?? "")))
);

export const inferMangaCorrespondenceFirstChapter = (
  analysis: MangaCorrespondenceTitleAnalysis,
  knownTitles: string[],
): string | undefined => {
  if (
    analysis.chapter
    || analysis.sequenceMarkers.some((marker) => marker.kind !== "chapter")
    || containsNonChapterReleaseMarker(analysis)
  ) {
    return undefined;
  }

  const analyzedTitleKeys = new Set(
    [analysis.title, ...analysis.alternativeTitles]
      .map(normalizeComparableTitle)
      .filter(Boolean),
  );
  const matchesKnownTitleExactly = knownTitles.some((title) => (
    analyzedTitleKeys.has(normalizeComparableTitle(title))
  ));

  return matchesKnownTitleExactly ? "1" : undefined;
};
