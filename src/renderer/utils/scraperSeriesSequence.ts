import type {
  ScraperTitleAnalysisConfig,
  ScraperTitleSequenceKind,
  ScraperTitleSequenceMarker,
} from "@/shared/scraper";
import type { MatchableManga } from "@/renderer/utils/mangaMatching/titleProfiles";
import { analyzeMangaCorrespondenceTitle } from "@/renderer/utils/mangaCorrespondenceTitleAnalysis";
import { extractTitleSequenceMarkers } from "@/renderer/utils/scraperTitleAnalysis";

export type ScraperSeriesSequenceValue = {
  end: number;
  start: number;
};

export type ScraperSeriesSequence = {
  authorNames: string[];
  chapter: ScraperSeriesSequenceValue | null;
  family: ScraperTitleSequenceKind;
  matchTitle: string;
  part: ScraperSeriesSequenceValue | null;
  seriesTitle: string;
  volume: ScraperSeriesSequenceValue | null;
};

export type ScraperSeriesSequenceInput = MatchableManga & {
  chapterLabel?: string | null;
  scraperId?: string | null;
};

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

const uniqueValues = (values: string[]): string[] => {
  const seen = new Set<string>();

  return values.filter((value) => {
    const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
    const key = normalized.toLocaleLowerCase();
    if (!normalized || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const parseSequenceNumber = (value: string | undefined): number | null => {
  const normalizedValue = String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en");
  if (!normalizedValue) {
    return null;
  }

  if (ROMAN_NUMERAL_PATTERN.test(normalizedValue)) {
    return Array.from(normalizedValue).reduceRight((total, character, index, characters) => {
      const currentValue = ROMAN_NUMERAL_VALUES[character] ?? 0;
      const nextValue = ROMAN_NUMERAL_VALUES[characters[index + 1]] ?? 0;
      return total + (currentValue < nextValue ? -currentValue : currentValue);
    }, 0);
  }

  const parsedValue = Number(normalizedValue.replace(",", "."));
  return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : null;
};

const parseSequenceValue = (value: string | undefined): ScraperSeriesSequenceValue | null => {
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
): ScraperSeriesSequenceValue | null => (
  parseSequenceValue(markers.find((marker) => marker.kind === kind)?.value)
);

const getChapterLabelMarker = (chapterLabel: string): ScraperTitleSequenceMarker | null => {
  const extraction = extractTitleSequenceMarkers(chapterLabel);
  const parsedMarker = extraction.sequenceMarkers.find((marker) => marker.kind === "chapter");
  if (parsedMarker) {
    return parsedMarker;
  }

  const directValue = parseSequenceValue(chapterLabel);
  return directValue
    ? { kind: "chapter", label: "chapter", value: chapterLabel.trim() }
    : null;
};

const getSequenceFamily = ({
  chapter,
  part,
  volume,
}: Pick<ScraperSeriesSequence, "chapter" | "part" | "volume">): ScraperTitleSequenceKind | null => {
  if (volume) {
    return "volume";
  }

  if (part) {
    return "part";
  }

  return chapter ? "chapter" : null;
};

export const analyzeScraperSeriesSequence = (
  input: ScraperSeriesSequenceInput,
  configsByScraperId: ReadonlyMap<string, ScraperTitleAnalysisConfig> = new Map(),
): ScraperSeriesSequence | null => {
  const title = String(input.title ?? "").trim();
  if (!title) {
    return null;
  }

  const analysis = analyzeMangaCorrespondenceTitle(
    title,
    configsByScraperId.get(String(input.scraperId ?? "").trim()),
  );
  const markers = [...analysis.sequenceMarkers];
  const chapterLabel = String(input.chapterLabel ?? "").trim();
  if (!markers.some((marker) => marker.kind === "chapter") && chapterLabel) {
    const chapterMarker = getChapterLabelMarker(chapterLabel);
    if (chapterMarker) {
      markers.push(chapterMarker);
    }
  }

  const chapter = getMarkerValue(markers, "chapter");
  const part = getMarkerValue(markers, "part");
  const volume = getMarkerValue(markers, "volume");
  const family = getSequenceFamily({ chapter, part, volume });
  const matchTitles = uniqueValues([
    analysis.title,
    ...analysis.alternativeTitles,
    ...(input.advancedRomanizedTitleVariants ?? []).map((variant) => (
      analyzeMangaCorrespondenceTitle(variant, undefined).title
    )),
  ]);

  if (!family || !matchTitles.length) {
    return null;
  }

  return {
    authorNames: uniqueValues([
      ...analysis.authors,
      ...(input.authorNames ?? []),
    ]),
    chapter,
    family,
    matchTitle: matchTitles.join(" | "),
    part,
    seriesTitle: analysis.title || matchTitles[0],
    volume,
  };
};

const getSequencePosition = (
  sequence: ScraperSeriesSequence,
  edge: "end" | "start",
): number[] => {
  if (sequence.family === "volume") {
    return [
      sequence.volume?.[edge] ?? 0,
      sequence.part?.[edge] ?? 0,
      sequence.chapter?.[edge] ?? 0,
    ];
  }

  if (sequence.family === "part") {
    return [
      sequence.part?.[edge] ?? 0,
      sequence.chapter?.[edge] ?? 0,
    ];
  }

  return [sequence.chapter?.[edge] ?? 0];
};

const comparePositions = (left: number[], right: number[]): number => {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
};

export const isScraperSeriesSequenceAfterFirst = (
  sequence: ScraperSeriesSequence,
): boolean => getSequencePosition(sequence, "start").some((value) => value > 1);

export const isScraperSeriesSequenceEarlier = (
  candidate: ScraperSeriesSequence,
  current: ScraperSeriesSequence,
): boolean => (
  candidate.family === current.family
  && comparePositions(
    getSequencePosition(candidate, "end"),
    getSequencePosition(current, "start"),
  ) < 0
);

export const compareScraperSeriesSequenceProgress = (
  left: ScraperSeriesSequence,
  right: ScraperSeriesSequence,
): number => comparePositions(
  getSequencePosition(left, "end"),
  getSequencePosition(right, "end"),
);

export const formatScraperSeriesSequence = (
  sequence: ScraperSeriesSequence,
  edge: "end" | "start" = "start",
): string => {
  const labels = [
    sequence.volume ? `volume ${sequence.volume[edge]}` : "",
    sequence.part ? `partie ${sequence.part[edge]}` : "",
    sequence.chapter ? `chapitre ${sequence.chapter[edge]}` : "",
  ].filter(Boolean);

  return labels.join(", ");
};
