import type { ReadingListItem } from "@/renderer/types/readingList";
import {
  getMangaTitleMergeMatchKind,
  getMangaTitleRomanizationTargets,
} from "@/renderer/utils/mangaMatching/titleProfiles";
import { extractTentativeAuthorNamesFromTitle } from "@/renderer/utils/mangaMatching/tentativeAuthors";
import {
  analyzeScraperTitle,
  extractTitleSequenceMarkers,
} from "@/renderer/utils/scraperTitleAnalysis";
import type {
  ScraperTitleAnalysisConfig,
  ScraperTitleSequenceKind,
  ScraperTitleSequenceMarker,
} from "@/shared/scraper";

export type ReadingListDropEdge = "after" | "before";

export type ReadingListTitleAnalysisConfigs = ReadonlyMap<string, ScraperTitleAnalysisConfig>;

type SequenceValue = {
  end: number;
  start: number;
};

type ReadingListSequence = {
  authorNames: string[];
  chapter: SequenceValue | null;
  family: ScraperTitleSequenceKind | "generic";
  generic: SequenceValue | null;
  matchTitle: string;
  part: SequenceValue | null;
  volume: SequenceValue | null;
};

type IndexedReadingListItem = {
  index: number;
  item: ReadingListItem;
  sequence: ReadingListSequence;
};

const TRAILING_NUMBER_PATTERN = /([0-9]+(?:[.,][0-9]+)?)\s*[\])}._-]*$/u;
const ROMAN_NUMERAL_PATTERN = /^[ivxlcdm]+$/iu;
const ROMAN_NUMERAL_VALUES: Record<string, number> = {
  c: 100,
  d: 500,
  i: 1,
  l: 50,
  m: 1000,
  v: 5,
  x: 10,
};

const parseSequenceNumber = (value: string | undefined): number | null => {
  if (!value) {
    return null;
  }

  const normalizedValue = value.normalize("NFKC").trim().toLocaleLowerCase("en");
  if (!ROMAN_NUMERAL_PATTERN.test(normalizedValue)) {
    const parsedValue = Number(normalizedValue.replace(",", "."));
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  return Array.from(normalizedValue).reduceRight((total, character, index, characters) => {
    const currentValue = ROMAN_NUMERAL_VALUES[character] ?? 0;
    const nextValue = ROMAN_NUMERAL_VALUES[characters[index + 1]] ?? 0;
    return total + (currentValue < nextValue ? -currentValue : currentValue);
  }, 0);
};

const parseSequenceValue = (value: string | undefined): SequenceValue | null => {
  const [startValue, endValue] = String(value ?? "").split("-", 2);
  const start = parseSequenceNumber(startValue);
  if (start === null) {
    return null;
  }

  return {
    start,
    end: parseSequenceNumber(endValue) ?? start,
  };
};

const getMarkerValue = (
  markers: ScraperTitleSequenceMarker[],
  kind: ScraperTitleSequenceKind,
): SequenceValue | null => (
  parseSequenceValue(markers.find((marker) => marker.kind === kind)?.value)
);

const getItemAuthorNames = (
  item: ReadingListItem,
  analyzedAuthorNames: string[] = [],
): string[] => {
  if (analyzedAuthorNames.length) {
    return analyzedAuthorNames;
  }

  if (item.metadata.authors?.length) {
    return item.metadata.authors;
  }

  return extractTentativeAuthorNamesFromTitle(item.metadata.title);
};

const getItemTitleAnalysisConfig = (
  item: ReadingListItem,
  configs: ReadingListTitleAnalysisConfigs,
): ScraperTitleAnalysisConfig | null => (
  item.sourceTarget.kind === "scraper.details"
    ? configs.get(item.sourceTarget.scraperId) ?? null
    : null
);

const buildSequence = (
  item: ReadingListItem,
  matchTitle: string,
  markers: ScraperTitleSequenceMarker[],
  analyzedAuthorNames: string[] = [],
): ReadingListSequence | null => {
  const volume = getMarkerValue(markers, "volume");
  const chapter = getMarkerValue(markers, "chapter");
  const part = getMarkerValue(markers, "part");
  if (!matchTitle.trim() || (!volume && !chapter && !part)) {
    return null;
  }

  return {
    authorNames: getItemAuthorNames(item, analyzedAuthorNames),
    chapter,
    family: volume ? "volume" : part ? "part" : "chapter",
    generic: null,
    matchTitle,
    part,
    volume,
  };
};

const extractConfiguredSequence = (
  item: ReadingListItem,
  configs: ReadingListTitleAnalysisConfigs,
): ReadingListSequence | null => {
  const config = getItemTitleAnalysisConfig(item, configs);
  if (!config?.enabled) {
    return null;
  }

  const result = analyzeScraperTitle(item.metadata.title, config);
  if (!result.matched || !result.sequenceMarkers.length) {
    return null;
  }

  return buildSequence(
    item,
    [result.title, ...result.alternativeTitles].filter(Boolean).join(" | "),
    result.sequenceMarkers,
    result.authors,
  );
};

const extractGenericSequence = (item: ReadingListItem): ReadingListSequence | null => {
  const candidates = [
    item.metadata.title.normalize("NFKC"),
    ...getMangaTitleRomanizationTargets(item.metadata.title),
  ].map((target) => extractTitleSequenceMarkers(target));
  const sequenceCandidate = candidates.find(({ sequenceMarkers }) => sequenceMarkers.length > 0);
  if (sequenceCandidate) {
    return buildSequence(
      item,
      candidates.map(({ title }) => title).filter(Boolean).join(" | "),
      sequenceCandidate.sequenceMarkers,
    );
  }

  for (const candidate of candidates) {
    const genericMatch = candidate.title.match(TRAILING_NUMBER_PATTERN);
    const generic = parseSequenceValue(genericMatch?.[1]);
    if (generic && genericMatch?.index !== undefined) {
      return {
        authorNames: getItemAuthorNames(item),
        chapter: null,
        family: "generic",
        generic,
        matchTitle: candidate.title.slice(0, genericMatch.index).trim(),
        part: null,
        volume: null,
      };
    }
  }

  return null;
};

const extractReadingListSequence = (
  item: ReadingListItem,
  configs: ReadingListTitleAnalysisConfigs,
): ReadingListSequence | null => (
  extractConfiguredSequence(item, configs) ?? extractGenericSequence(item)
);

const compareOptionalSequenceValues = (
  left: SequenceValue | null,
  right: SequenceValue | null,
): number => {
  if (left && right) {
    return left.start - right.start || left.end - right.end;
  }

  if (!left) {
    return right ? -1 : 0;
  }

  return 1;
};

const compareSequences = (left: IndexedReadingListItem, right: IndexedReadingListItem): number => (
  compareOptionalSequenceValues(left.sequence.volume, right.sequence.volume)
  || compareOptionalSequenceValues(left.sequence.part, right.sequence.part)
  || compareOptionalSequenceValues(left.sequence.chapter, right.sequence.chapter)
  || compareOptionalSequenceValues(left.sequence.generic, right.sequence.generic)
  || left.index - right.index
);

const doSequencesBelongTogether = (
  left: ReadingListSequence,
  right: ReadingListSequence,
): boolean => (
  left.family === right.family
  && getMangaTitleMergeMatchKind(
    { title: left.matchTitle, authorNames: left.authorNames },
    { title: right.matchTitle, authorNames: right.authorNames },
  ) !== null
);

export const autoSortReadingListItems = (
  items: ReadingListItem[],
  configs: ReadingListTitleAnalysisConfigs = new Map(),
): ReadingListItem[] => {
  const indexedItems = items.flatMap((item, index): IndexedReadingListItem[] => {
    const sequence = extractReadingListSequence(item, configs);
    return sequence ? [{ index, item, sequence }] : [];
  });
  const groups: IndexedReadingListItem[][] = [];

  indexedItems.forEach((indexedItem) => {
    const groupItems = groups.find((candidateItems) => candidateItems.some((candidateItem) => (
      doSequencesBelongTogether(candidateItem.sequence, indexedItem.sequence)
    )));
    if (groupItems) {
      groupItems.push(indexedItem);
    } else {
      groups.push([indexedItem]);
    }
  });

  const sortedItems = [...items];
  groups.forEach((groupItems) => {
    if (groupItems.length < 2) {
      return;
    }

    const groupIndexes = groupItems.map(({ index }) => index).sort((left, right) => left - right);
    const orderedGroupItems = [...groupItems].sort(compareSequences);
    groupIndexes.forEach((targetIndex, orderedIndex) => {
      sortedItems[targetIndex] = orderedGroupItems[orderedIndex].item;
    });
  });

  return sortedItems;
};

export const moveReadingListItem = (
  items: ReadingListItem[],
  itemId: string,
  offset: number,
): ReadingListItem[] => {
  const sourceIndex = items.findIndex((item) => item.id === itemId);
  const targetIndex = sourceIndex + offset;
  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= items.length) {
    return [...items];
  }

  const reorderedItems = [...items];
  const [movedItem] = reorderedItems.splice(sourceIndex, 1);
  reorderedItems.splice(targetIndex, 0, movedItem);
  return reorderedItems;
};

export const reorderReadingListItems = (
  items: ReadingListItem[],
  sourceItemId: string,
  targetItemId: string,
  dropEdge: ReadingListDropEdge,
): ReadingListItem[] => {
  if (sourceItemId === targetItemId) {
    return [...items];
  }

  const movedItem = items.find((item) => item.id === sourceItemId);
  if (!movedItem || !items.some((item) => item.id === targetItemId)) {
    return [...items];
  }

  const reorderedItems = items.filter((item) => item.id !== sourceItemId);
  const targetIndex = reorderedItems.findIndex((item) => item.id === targetItemId);
  const insertionIndex = targetIndex + (dropEdge === "after" ? 1 : 0);
  reorderedItems.splice(insertionIndex, 0, movedItem);
  return reorderedItems;
};
