import { getMultiSearchSourceLanguageValues } from "@/renderer/components/MultiSearch/multiSearchLanguageFilters";
import {
  buildQuickReviewItemsFromMergedResults,
} from "@/renderer/components/QuickReview/quickReviewItems";
import type {
  QuickReviewItem,
  QuickReviewSeriesLanguageAvailability,
  QuickReviewSeriesSession,
} from "@/renderer/components/QuickReview/types";
import {
  countAuthorSeriesChapters,
  type AuthorSeriesGroup,
} from "@/renderer/components/ScraperAuthorFavorites/authorSeriesGroups";
import { getLanguageLabel } from "@/renderer/utils/languageDetection";

export type AuthorSeriesQuickReview = {
  items: QuickReviewItem[];
  seriesSession: QuickReviewSeriesSession;
};

const buildLanguageAvailability = (
  series: AuthorSeriesGroup,
): QuickReviewSeriesLanguageAvailability[] => {
  const chaptersByLanguage = new Map<string, string[]>();

  series.chapters.forEach((chapter) => {
    chapter.result.sources.forEach((source) => {
      getMultiSearchSourceLanguageValues(source).forEach((languageCode) => {
        chaptersByLanguage.set(languageCode, [
          ...(chaptersByLanguage.get(languageCode) ?? []),
          chapter.chapter,
        ]);
      });
    });
  });

  return Array.from(chaptersByLanguage, ([languageCode, chapters]) => ({
    languageCode,
    chapterCount: countAuthorSeriesChapters(chapters),
  })).sort((left, right) => (
    right.chapterCount - left.chapterCount
    || getLanguageLabel(left.languageCode).localeCompare(
      getLanguageLabel(right.languageCode),
      "fr",
      { sensitivity: "base" },
    )
  ));
};

export const buildAuthorSeriesQuickReview = (
  groups: AuthorSeriesGroup[],
  contextLabel?: string,
): AuthorSeriesQuickReview => {
  const items: QuickReviewItem[] = [];
  const seriesGroups: QuickReviewSeriesSession["groups"] = [];

  groups.forEach((group) => {
    const groupEntries = group.chapters.flatMap((chapter) => (
      buildQuickReviewItemsFromMergedResults([chapter.result]).map((item) => ({
        chapterLabel: chapter.chapter,
        item: {
          ...item,
          id: `${group.id}:${item.id}`,
        },
      }))
    ));
    const groupItems = groupEntries.map((entry) => entry.item);
    items.push(...groupItems);

    // The One Shot category is only a visual bucket in the author view. Its cards
    // remain independent entries and must not gain series navigation or metadata.
    if (group.kind === "oneShots") return;

    seriesGroups.push({
      id: group.id,
      title: group.title,
      chapterCount: group.chapterCount,
      sourceCount: group.sourceCount,
      chapters: groupEntries.map((entry) => ({
        itemId: entry.item.id,
        label: entry.chapterLabel,
      })),
      languageAvailability: buildLanguageAvailability(group),
    });
  });

  return {
    items,
    seriesSession: {
      contextLabel,
      groups: seriesGroups,
    },
  };
};
