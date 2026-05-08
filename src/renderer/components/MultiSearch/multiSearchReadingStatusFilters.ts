import {
  buildFilteredMultiSearchMergedResult,
} from "@/renderer/components/MultiSearch/multiSearchResultFilters";
import {
  getMultiSearchSourceLanguageValues,
} from "@/renderer/components/MultiSearch/multiSearchLanguageFilters";
import {
  getMultiSearchAvailabilityReadingStatus,
  getMultiSearchSourceAvailability,
  type MultiSearchProgressIndex,
} from "@/renderer/components/MultiSearch/multiSearchSourceState";
import type {
  MultiSearchMergedResult,
  MultiSearchReadingStatusFilter,
  MultiSearchScraperRun,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import type { Manga } from "@/renderer/types";

export type MultiSearchReadingStatusFilterContext = {
  libraryMangas: Manga[];
  bookmarkedSourceKeys: Set<string>;
  sourceProgressIndex: MultiSearchProgressIndex;
};

const READING_STATUS_ORDER: MultiSearchReadingStatusFilter[] = [
  "unread",
  "inProgress",
  "read",
];

export const MULTI_SEARCH_READING_STATUS_LABELS: Record<MultiSearchReadingStatusFilter, string> = {
  unread: "Non lu",
  inProgress: "En cours",
  read: "Lu",
};

export const hasActiveMultiSearchReadingStatusFilter = (
  statuses: MultiSearchReadingStatusFilter[],
): boolean => statuses.length > 0;

export const toggleMultiSearchReadingStatusFilter = (
  statuses: MultiSearchReadingStatusFilter[],
  toggledStatus: MultiSearchReadingStatusFilter,
): MultiSearchReadingStatusFilter[] => {
  const nextStatuses = statuses.includes(toggledStatus)
    ? statuses.filter((status) => status !== toggledStatus)
    : [...statuses, toggledStatus];

  return READING_STATUS_ORDER.filter((status) => nextStatuses.includes(status));
};

const getSourceReadingStatus = (
  source: MultiSearchSourceResult,
  context: MultiSearchReadingStatusFilterContext,
): MultiSearchReadingStatusFilter => (
  getMultiSearchAvailabilityReadingStatus(
    getMultiSearchSourceAvailability({
      source,
      libraryMangas: context.libraryMangas,
      bookmarkedSourceKeys: context.bookmarkedSourceKeys,
      progressIndex: context.sourceProgressIndex,
    }),
  )
);

const doesSourceMatchReadingStatusFilter = (
  source: MultiSearchSourceResult,
  statuses: MultiSearchReadingStatusFilter[],
  context: MultiSearchReadingStatusFilterContext,
): boolean => (
  !statuses.length || statuses.includes(getSourceReadingStatus(source, context))
);

export const filterMultiSearchMergedResultsByReadingStatus = (
  results: MultiSearchMergedResult[],
  statuses: MultiSearchReadingStatusFilter[],
  context: MultiSearchReadingStatusFilterContext,
): MultiSearchMergedResult[] => {
  if (!hasActiveMultiSearchReadingStatusFilter(statuses)) {
    return results;
  }

  return results.reduce<MultiSearchMergedResult[]>((visibleResults, result) => {
    const visibleSources = result.sources.filter((source) => (
      doesSourceMatchReadingStatusFilter(source, statuses, context)
    ));

    if (!visibleSources.length) {
      return visibleResults;
    }

    visibleResults.push(
      buildFilteredMultiSearchMergedResult(result, visibleSources, getMultiSearchSourceLanguageValues),
    );
    return visibleResults;
  }, []);
};

export const filterMultiSearchRunsByReadingStatus = (
  runs: MultiSearchScraperRun[],
  statuses: MultiSearchReadingStatusFilter[],
  context: MultiSearchReadingStatusFilterContext,
): MultiSearchScraperRun[] => {
  if (!hasActiveMultiSearchReadingStatusFilter(statuses)) {
    return runs;
  }

  return runs.map((run) => ({
    ...run,
    results: run.results.filter((source) => (
      doesSourceMatchReadingStatusFilter(source, statuses, context)
    )),
  }));
};
