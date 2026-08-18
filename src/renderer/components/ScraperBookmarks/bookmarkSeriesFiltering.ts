import type {
  ScraperBookmarkRecord,
  ScraperBookmarkSeriesFilterMode,
} from "@/shared/scraper";
import { analyzeScraperTitle } from "@/renderer/utils/scraperTitleAnalysis";
import type { ScraperTitleAnalysisConfigs } from "@/renderer/utils/scraperTitleAnalysisConfigs";

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

const parseChapterNumber = (value: string | undefined): number | null => {
  const startValue = String(value ?? "")
    .normalize("NFKC")
    .split("-", 1)[0]
    .trim()
    .toLocaleLowerCase("en");
  if (!startValue) {
    return null;
  }

  if (ROMAN_NUMERAL_PATTERN.test(startValue)) {
    return Array.from(startValue).reduceRight((total, character, index, characters) => {
      const currentValue = ROMAN_NUMERAL_VALUES[character] ?? 0;
      const nextValue = ROMAN_NUMERAL_VALUES[characters[index + 1]] ?? 0;
      return total + (currentValue < nextValue ? -currentValue : currentValue);
    }, 0);
  }

  const numberValue = Number(startValue.replace(",", "."));
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
};

export const getScraperBookmarkChapterNumber = (
  bookmark: ScraperBookmarkRecord,
  configsByScraperId: ScraperTitleAnalysisConfigs = new Map(),
): number | null => {
  const analysis = analyzeScraperTitle(
    bookmark.title,
    configsByScraperId.get(bookmark.scraperId),
  );
  const chapterMarker = analysis.sequenceMarkers.find((marker) => marker.kind === "chapter");
  return parseChapterNumber(chapterMarker?.value);
};

export const matchesScraperBookmarkSeriesFilter = (
  bookmark: ScraperBookmarkRecord,
  mode: ScraperBookmarkSeriesFilterMode,
  configsByScraperId: ScraperTitleAnalysisConfigs = new Map(),
): boolean => {
  if (mode !== "only" && mode !== "without") {
    return true;
  }

  const chapterNumber = getScraperBookmarkChapterNumber(bookmark, configsByScraperId);
  if (mode === "only") {
    return chapterNumber !== null;
  }

  return chapterNumber === null || chapterNumber <= 1;
};
