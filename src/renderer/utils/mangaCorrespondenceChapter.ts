import type { MangaCorrespondenceTitleAnalysis } from "@/renderer/utils/mangaCorrespondenceTitleAnalysis";

const NON_CHAPTER_RELEASE_PATTERN = /(?:^|[^\p{L}\p{N}])(?:extra|extras|bonus|omake|special|side[\s-]*story|after[\s-]*story|afterword|epilogue|prologue|encore|interlude|appendix|ongoing|complete|compilation|soush(?:u+|ū)hen|総集編|おまけ|番外編|特別編)(?:$|[^\p{L}\p{N}])/iu;
const SINGLE_CHAPTER_PATTERN = /^(?<value>[0-9]+(?:\.[0-9]+)?)$/u;
const CHAPTER_RANGE_PATTERN = /^(?<start>[0-9]+(?:\.[0-9]+)?)-(?<end>[0-9]+(?:\.[0-9]+)?)$/u;
const COMPILATION_CHAPTER_PATTERN = /^Compilation(?:\s+(?<value>.+))?$/iu;

export type MangaCorrespondenceChapterKind = "single" | "range" | "compilation" | "other";

export type MangaCorrespondenceChapterDescriptor = {
  kind: MangaCorrespondenceChapterKind;
  value: string;
  start: number;
  end: number;
};

const parseFiniteNumber = (value?: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};

export const describeMangaCorrespondenceChapter = (
  value: string,
): MangaCorrespondenceChapterDescriptor => {
  const normalized = value.trim().replace(",", ".");
  const single = normalized.match(SINGLE_CHAPTER_PATTERN);
  if (single?.groups?.value) {
    const numeric = parseFiniteNumber(single.groups.value);
    return { kind: "single", value: normalized, start: numeric, end: numeric };
  }

  const range = normalized.match(CHAPTER_RANGE_PATTERN);
  if (range?.groups?.start && range.groups.end) {
    return {
      kind: "range",
      value: normalized,
      start: parseFiniteNumber(range.groups.start),
      end: parseFiniteNumber(range.groups.end),
    };
  }

  const compilation = normalized.match(COMPILATION_CHAPTER_PATTERN);
  if (compilation) {
    const nested = describeMangaCorrespondenceChapter(compilation.groups?.value ?? "");
    return {
      kind: "compilation",
      value: normalized,
      start: nested.start,
      end: nested.end,
    };
  }

  return {
    kind: "other",
    value: normalized,
    start: Number.MAX_SAFE_INTEGER,
    end: Number.MAX_SAFE_INTEGER,
  };
};

const CHAPTER_KIND_SORT_ORDER: Record<MangaCorrespondenceChapterKind, number> = {
  single: 0,
  range: 1,
  compilation: 2,
  other: 3,
};

export const compareMangaCorrespondenceChapters = (
  left: string,
  right: string,
): number => {
  const leftDescriptor = describeMangaCorrespondenceChapter(left);
  const rightDescriptor = describeMangaCorrespondenceChapter(right);
  if (leftDescriptor.kind === "other" && rightDescriptor.kind === "other") {
    return 0;
  }

  return CHAPTER_KIND_SORT_ORDER[leftDescriptor.kind] - CHAPTER_KIND_SORT_ORDER[rightDescriptor.kind]
    || leftDescriptor.start - rightDescriptor.start
    || leftDescriptor.end - rightDescriptor.end
    || left.localeCompare(right);
};

type MangaCorrespondenceChapterGroup<T> = {
  aliasKeys: Set<string>;
  chapter: string;
  entries: Array<{ entry: T; index: number }>;
};

const normalizeChapterAliasKey = (value: string): string => (
  value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
);

const getChapterAliasKeys = (value: string): string[] => {
  const descriptor = describeMangaCorrespondenceChapter(value);
  if (descriptor.kind !== "other") {
    return [`structured:${descriptor.value.toLocaleLowerCase()}`];
  }

  const normalized = normalizeChapterAliasKey(value);
  return normalized
    ? [`named:${normalized}`, `named:${normalized.replace(/\s+/g, "")}`]
    : [];
};

export const groupMangaCorrespondenceChapters = <T>(entries: Array<{
  aliases?: string[];
  chapter: string;
  entry: T;
}>): Array<{ chapter: string; entries: T[] }> => {
  const groups: Array<MangaCorrespondenceChapterGroup<T>> = [];

  entries.forEach(({ aliases = [], chapter, entry }, index) => {
    const aliasKeys = new Set(
      [chapter, ...aliases].flatMap(getChapterAliasKeys),
    );
    const matchingGroups = groups.filter((group) => (
      Array.from(aliasKeys).some((key) => group.aliasKeys.has(key))
    ));
    if (!matchingGroups.length) {
      groups.push({ aliasKeys, chapter, entries: [{ entry, index }] });
      return;
    }

    const targetGroup = matchingGroups[0];
    targetGroup.entries.push({ entry, index });
    aliasKeys.forEach((key) => targetGroup.aliasKeys.add(key));
    matchingGroups.slice(1).forEach((group) => {
      group.entries.forEach((groupEntry) => targetGroup.entries.push(groupEntry));
      group.aliasKeys.forEach((key) => targetGroup.aliasKeys.add(key));
      groups.splice(groups.indexOf(group), 1);
    });
  });

  return groups.map(({ chapter, entries: groupEntries }) => ({
    chapter,
    entries: groupEntries
      .sort((left, right) => left.index - right.index)
      .map(({ entry }) => entry),
  }));
};

export const doMangaCorrespondenceChaptersOverlap = (
  left: string,
  right: string,
): boolean => {
  const leftDescriptor = describeMangaCorrespondenceChapter(left);
  const rightDescriptor = describeMangaCorrespondenceChapter(right);
  const leftIsNumeric = leftDescriptor.kind === "single" || leftDescriptor.kind === "range";
  const rightIsNumeric = rightDescriptor.kind === "single" || rightDescriptor.kind === "range";

  if (leftIsNumeric && rightIsNumeric) {
    return leftDescriptor.start <= rightDescriptor.end
      && rightDescriptor.start <= leftDescriptor.end;
  }

  return leftDescriptor.value.toLocaleLowerCase() === rightDescriptor.value.toLocaleLowerCase();
};

export const formatMangaCorrespondenceChapterLabel = (
  value: string,
  capitalize = false,
): string => {
  const descriptor = describeMangaCorrespondenceChapter(value);
  let label: string;
  if (descriptor.kind === "single") {
    label = `chapitre ${descriptor.value}`;
  } else if (descriptor.kind === "range") {
    label = `chapitres ${descriptor.value.replace("-", " à ")}`;
  } else if (descriptor.kind === "compilation") {
    const suffix = descriptor.value.replace(/^Compilation\s*/iu, "");
    label = suffix ? `compilation ${suffix}` : "compilation";
  } else {
    label = descriptor.value;
  }

  return capitalize && label
    ? `${label.charAt(0).toLocaleUpperCase()}${label.slice(1)}`
    : label;
};

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
    analysis.title,
    ...analysis.alternativeTitles,
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

export const resolveMangaCorrespondenceMatchChapter = (
  storedChapter: string | undefined,
  analyzedChapter: string | undefined,
  inferredChapter: string | undefined,
  acceptedManually = false,
  chapterOverride?: string | null,
  preferAnalyzedChapter = false,
): string => {
  if (chapterOverride !== undefined) return chapterOverride || "Non renseigné";
  if (acceptedManually && storedChapter) return storedChapter;
  if (preferAnalyzedChapter && analyzedChapter) return analyzedChapter;
  if (storedChapter) {
    return storedChapter === "1" && analyzedChapter && analyzedChapter !== "1"
      ? analyzedChapter
      : storedChapter;
  }
  return analyzedChapter || inferredChapter || "Non renseigné";
};
