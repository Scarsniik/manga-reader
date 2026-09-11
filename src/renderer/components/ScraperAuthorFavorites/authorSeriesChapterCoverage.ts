import type { ScraperChapterItem } from "@/shared/scraper";
import { describeMangaCorrespondenceChapter } from "@/renderer/utils/mangaCorrespondenceChapter";
import { analyzeMangaCorrespondenceTitle } from "@/renderer/utils/mangaCorrespondenceTitleAnalysis";

export type AuthorSeriesSourceChapterCoverage = {
  chapter: string;
};

const CHAPTER_NUMBER_SOURCE = "[0-9０-９]+(?:[.,][0-9０-９]+)?";
const LEADING_CHAPTER_LABEL_PATTERN = new RegExp(
  `^\\s*(?:(?:chapitre|chapter|ch)\\.?\\s*)?(?<chapter>${CHAPTER_NUMBER_SOURCE}(?:\\s*[-–—~〜～]\\s*${CHAPTER_NUMBER_SOURCE})?)\\s*(?:[-–—:：|]|$)`,
  "iu",
);

const formatChapterBoundary = (value: number): string => String(value);

const extractChapterFromLabel = (label: string): string | undefined => {
  const leadingChapter = label.match(LEADING_CHAPTER_LABEL_PATTERN)?.groups?.chapter;
  if (leadingChapter) {
    return leadingChapter
      .normalize("NFKC")
      .replace(",", ".")
      .replace(/\s*[-–—~〜～]\s*/gu, "-");
  }

  return analyzeMangaCorrespondenceTitle(label, null).chapter;
};

export const buildAuthorSeriesChapterCoverage = (
  chapters: ScraperChapterItem[],
): AuthorSeriesSourceChapterCoverage | null => {
  const detectedChaptersByValue = new Map(chapters.flatMap((chapter) => {
    const analyzedChapter = extractChapterFromLabel(chapter.label);
    if (!analyzedChapter) return [];

    const descriptor = describeMangaCorrespondenceChapter(analyzedChapter);
    return descriptor.kind === "single" || descriptor.kind === "range"
      ? [[descriptor.value, descriptor] as const]
      : [];
  }));
  const detectedChapters = Array.from(detectedChaptersByValue.values());
  if (!detectedChapters.length) return null;

  const start = Math.min(...detectedChapters.map((chapter) => chapter.start));
  const end = Math.max(...detectedChapters.map((chapter) => chapter.end));
  if (start === end) return null;

  return {
    chapter: `${formatChapterBoundary(start)}-${formatChapterBoundary(end)}`,
  };
};
