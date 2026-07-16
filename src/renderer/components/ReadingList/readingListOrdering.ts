import type { ReadingListItem } from "@/renderer/types/readingList";

export type ReadingListDropEdge = "after" | "before";

type ReadingListSequence = {
  chapter: number | null;
  generic: number | null;
  groupKey: string;
  volume: number | null;
};

type IndexedReadingListItem = {
  index: number;
  item: ReadingListItem;
  sequence: ReadingListSequence;
};

const CHAPTER_PATTERN = /(?:^|[\s()[\]{}_\-–—:;,.])(?:chap(?:it(?:re)?)?|chapter|ch|episode|ep)\s*\.?\s*(?:n(?:o|°)?\s*)?[#:]?\s*([0-9]+(?:[.,][0-9]+)?)/iu;
const CHAPTER_PATTERN_GLOBAL = new RegExp(CHAPTER_PATTERN.source, "giu");
const JAPANESE_CHAPTER_PATTERN = /第\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:話|章)/u;
const JAPANESE_CHAPTER_PATTERN_GLOBAL = new RegExp(JAPANESE_CHAPTER_PATTERN.source, "gu");
const VOLUME_PATTERN = /(?:^|[\s()[\]{}_\-–—:;,.])(?:vol(?:ume)?|tome|book)\s*\.?\s*(?:n(?:o|°)?\s*)?[#:]?\s*([0-9]+(?:[.,][0-9]+)?)/iu;
const VOLUME_PATTERN_GLOBAL = new RegExp(VOLUME_PATTERN.source, "giu");
const JAPANESE_VOLUME_PATTERN = /第\s*([0-9]+(?:[.,][0-9]+)?)\s*巻/u;
const JAPANESE_VOLUME_PATTERN_GLOBAL = new RegExp(JAPANESE_VOLUME_PATTERN.source, "gu");
const TRAILING_NUMBER_PATTERN = /([0-9]+(?:[.,][0-9]+)?)\s*[\])}._-]*$/u;

const parseSequenceNumber = (value: string | undefined): number | null => {
  if (!value) {
    return null;
  }

  const parsedValue = Number(value.replace(",", "."));
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const extractSequenceNumber = (title: string, patterns: RegExp[]): number | null => {
  for (const pattern of patterns) {
    const sequenceNumber = parseSequenceNumber(title.match(pattern)?.[1]);
    if (sequenceNumber !== null) {
      return sequenceNumber;
    }
  }

  return null;
};

const normalizeGroupKey = (value: string): string => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("fr")
  .replace(/[\s()[\]{}_\-–—:;,.#]+/g, " ")
  .trim();

const extractReadingListSequence = (title: string): ReadingListSequence => {
  const normalizedTitle = title.normalize("NFKC");
  const volume = extractSequenceNumber(normalizedTitle, [VOLUME_PATTERN, JAPANESE_VOLUME_PATTERN]);
  const chapter = extractSequenceNumber(normalizedTitle, [CHAPTER_PATTERN, JAPANESE_CHAPTER_PATTERN]);
  let titleWithoutSequence = normalizedTitle
    .replace(VOLUME_PATTERN_GLOBAL, " ")
    .replace(JAPANESE_VOLUME_PATTERN_GLOBAL, " ")
    .replace(CHAPTER_PATTERN_GLOBAL, " ")
    .replace(JAPANESE_CHAPTER_PATTERN_GLOBAL, " ");
  const genericMatch = volume === null && chapter === null
    ? titleWithoutSequence.match(TRAILING_NUMBER_PATTERN)
    : null;
  const generic = parseSequenceNumber(genericMatch?.[1]);

  if (genericMatch?.index !== undefined) {
    titleWithoutSequence = titleWithoutSequence.slice(0, genericMatch.index);
  }

  const sequenceKind = volume !== null
    ? chapter !== null ? "volume-and-chapter" : "volume"
    : chapter !== null ? "chapter" : "generic";

  return {
    chapter,
    generic,
    groupKey: `${normalizeGroupKey(titleWithoutSequence)}|${sequenceKind}`,
    volume,
  };
};

const compareOptionalNumbers = (left: number | null, right: number | null): number => {
  if (left !== null && right !== null) {
    return left - right;
  }

  if (left !== null) {
    return -1;
  }

  return right !== null ? 1 : 0;
};

const compareSequences = (left: IndexedReadingListItem, right: IndexedReadingListItem): number => (
  compareOptionalNumbers(left.sequence.volume, right.sequence.volume)
  || compareOptionalNumbers(left.sequence.chapter, right.sequence.chapter)
  || compareOptionalNumbers(left.sequence.generic, right.sequence.generic)
  || left.index - right.index
);

const hasSequenceNumber = (sequence: ReadingListSequence): boolean => (
  sequence.volume !== null || sequence.chapter !== null || sequence.generic !== null
);

export const autoSortReadingListItems = (items: ReadingListItem[]): ReadingListItem[] => {
  const indexedItems = items.map((item, index): IndexedReadingListItem => ({
    index,
    item,
    sequence: extractReadingListSequence(item.metadata.title),
  }));
  const groups = new Map<string, IndexedReadingListItem[]>();

  indexedItems.forEach((indexedItem) => {
    if (!hasSequenceNumber(indexedItem.sequence)) {
      return;
    }

    const groupItems = groups.get(indexedItem.sequence.groupKey) ?? [];
    groupItems.push(indexedItem);
    groups.set(indexedItem.sequence.groupKey, groupItems);
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
