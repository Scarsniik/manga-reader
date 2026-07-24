import type {
  ScraperTitleAnalysisConfig,
  ScraperTitleAnalysisResult,
  ScraperTitleSequenceMarker,
} from "@/shared/scraper";
import {
  analyzeScraperTitle,
  createDefaultScraperTitleAnalysisConfig,
} from "@/renderer/utils/scraperTitleAnalysis";
import { getLanguageLabel } from "@/renderer/utils/languageDetection";
import { extractTitleSequenceMarkers } from "@/renderer/utils/scraperTitleAnalysis/sequence";
import {
  consumeTitleAnalysisSuffixes,
  type SuffixClassification,
} from "@/renderer/utils/scraperTitleAnalysis/suffixes";
import {
  normalizeTitleAnalysisText,
  splitTitleAnalysisAlternatives,
} from "@/renderer/utils/scraperTitleAnalysis/text";

export type MangaCorrespondenceTitleAnalysis = ScraperTitleAnalysisResult & {
  chapter?: string;
};

const TRAILING_BARE_CHAPTER_PATTERN = /^(?<title>.*\S)\s+(?<chapter>[0-9０-９]+(?:[.,][0-9０-９]+)?(?:\s*-\s*[0-9０-９]+(?:[.,][0-9０-９]+)?)?)\s*[!！]?$/u;
const TRAILING_SUFFIX_PATTERN = /\s*\[([^\]]*)\]\s*$/u;
const LEADING_EVENT_PATTERN = /^\s*\((?:(?:c\d+|20\d{2}[^)]*)|(?:[^)]*(?:akihabara|comiket|comic|doujin)[^)]*))\)\s*/iu;
const LEADING_AUTHOR_PATTERN = /^\s*\[([^\]]*)\]\s*/u;
const TRAILING_PARENTHESES_PATTERN = /\s*\(([^()]*)\)\s*$/u;

const normalizeChapter = (value: string): string => {
  const normalized = value
    .normalize("NFKC")
    .replace(",", ".")
    .replace(/\s*-\s*/g, "-");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? String(numeric) : normalized;
};

const stripTrailingBareChapter = (
  value: string,
): { title: string; chapter?: string } => {
  const match = value.match(TRAILING_BARE_CHAPTER_PATTERN);
  if (!match?.groups?.title || !match.groups.chapter) {
    return { title: value };
  }

  return {
    title: match.groups.title.trim(),
    chapter: normalizeChapter(match.groups.chapter),
  };
};

const uniqueText = (values: string[]): string[] => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim().replace(/\s+/g, " ");
    const key = normalized.toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const resolveAnalysisConfig = (
  config: ScraperTitleAnalysisConfig | null | undefined,
): ScraperTitleAnalysisConfig => {
  if (config?.enabled) return config;
  return {
    ...createDefaultScraperTitleAnalysisConfig(),
    enabled: true,
  };
};

const buildBareChapterMarker = (chapter: string): ScraperTitleSequenceMarker => ({
  kind: "chapter",
  label: "number",
  value: chapter,
});

type HeuristicCorrespondenceAnalysis = {
  title: string;
  alternativeTitles: string[];
  authors: string[];
  circle?: string;
  parody?: string;
  languageCode?: string;
  languageLabel?: string;
  suffixTags: string[];
  unmatchedParts: string[];
  sequenceMarkers: ScraperTitleSequenceMarker[];
  chapter?: string;
};

const extractTrailingSuffixValues = (
  value: string,
): { remaining: string; suffixValues: string[] } => {
  let remaining = value;
  const suffixValues: string[] = [];

  for (let guard = 0; guard < 30; guard += 1) {
    const match = remaining.match(TRAILING_SUFFIX_PATTERN);
    if (!match?.[1] || typeof match.index !== "number") break;
    suffixValues.unshift(normalizeTitleAnalysisText(match[1]));
    remaining = remaining.slice(0, match.index);
  }

  return { remaining: normalizeTitleAnalysisText(remaining), suffixValues };
};

const stripTrailingParentheses = (
  value: string,
): { title: string; values: string[] } => {
  let title = normalizeTitleAnalysisText(value);
  const values: string[] = [];

  for (let guard = 0; guard < 8; guard += 1) {
    const match = title.match(TRAILING_PARENTHESES_PATTERN);
    if (!match?.[1] || typeof match.index !== "number") break;
    values.unshift(normalizeTitleAnalysisText(match[1]));
    title = normalizeTitleAnalysisText(title.slice(0, match.index));
  }

  return { title, values };
};

const applySuffixClassifications = (
  classifications: SuffixClassification[],
): Pick<
  HeuristicCorrespondenceAnalysis,
  "languageCode" | "languageLabel" | "suffixTags" | "unmatchedParts" | "sequenceMarkers"
> => {
  let languageCode: string | undefined;
  const suffixTags: string[] = [];
  const unmatchedParts: string[] = [];
  const sequenceMarkers: ScraperTitleSequenceMarker[] = [];

  classifications.forEach((classification) => {
    if (classification.kind === "language") {
      languageCode ??= classification.languageCode;
    } else if (classification.kind === "tag") {
      suffixTags.push(classification.value);
    } else if (classification.kind === "sequence") {
      sequenceMarkers.push(...classification.sequenceMarkers);
    } else {
      unmatchedParts.push(classification.value);
    }
  });

  return {
    languageCode,
    languageLabel: languageCode ? getLanguageLabel(languageCode) : undefined,
    suffixTags: uniqueText(suffixTags),
    unmatchedParts: uniqueText(unmatchedParts),
    sequenceMarkers,
  };
};

const analyzeHeuristicCorrespondenceTitle = (
  rawTitle: string,
  config: ScraperTitleAnalysisConfig,
): HeuristicCorrespondenceAnalysis | null => {
  let remaining = normalizeTitleAnalysisText(rawTitle);
  while (LEADING_EVENT_PATTERN.test(remaining)) {
    remaining = normalizeTitleAnalysisText(remaining.replace(LEADING_EVENT_PATTERN, ""));
  }

  const { remaining: withoutSuffixes, suffixValues } = extractTrailingSuffixValues(remaining);
  remaining = withoutSuffixes;

  let circle: string | undefined;
  let authors: string[] = [];
  const authorMatch = remaining.match(LEADING_AUTHOR_PATTERN);
  if (authorMatch?.[1]) {
    const prefix = normalizeTitleAnalysisText(authorMatch[1]);
    const circleAuthorMatch = prefix.match(/^(.*?)\s*\(([^()]*)\)\s*$/u);
    if (circleAuthorMatch) {
      circle = normalizeTitleAnalysisText(circleAuthorMatch[1]);
      authors = uniqueText([normalizeTitleAnalysisText(circleAuthorMatch[2])]);
    } else {
      authors = uniqueText(prefix.split(/\s*(?:,|&|\/)\s*/u));
    }
    remaining = normalizeTitleAnalysisText(remaining.slice(authorMatch[0].length));
  }

  const globalParentheses = stripTrailingParentheses(remaining);
  let parody = globalParentheses.values[globalParentheses.values.length - 1];
  const analyzedTitles = splitTitleAnalysisAlternatives(globalParentheses.title)
    .map((value) => {
      const parentheses = stripTrailingParentheses(value);
      parody ??= parentheses.values[parentheses.values.length - 1];
      const explicitSequence = extractTitleSequenceMarkers(parentheses.title);
      const bareSequence = stripTrailingBareChapter(explicitSequence.title);
      const explicitChapter = explicitSequence.sequenceMarkers.find((marker) => marker.kind === "chapter")?.value;
      return {
        title: normalizeTitleAnalysisText(bareSequence.title),
        chapter: explicitChapter ? normalizeChapter(explicitChapter) : bareSequence.chapter,
        sequenceMarkers: explicitSequence.sequenceMarkers,
      };
    })
    .filter((entry) => Boolean(entry.title));

  const primary = analyzedTitles[0];
  if (!primary?.title) return null;

  const suffixConsumption = suffixValues.length
    ? consumeTitleAnalysisSuffixes(
      suffixValues.map((value) => `[${value}]`).join(" "),
      config,
    )
    : null;
  const suffixState = applySuffixClassifications(suffixConsumption?.classifications ?? []);
  const chapter = analyzedTitles.find((entry) => entry.chapter)?.chapter
    ?? suffixState.sequenceMarkers.find((marker) => marker.kind === "chapter")?.value;
  const sequenceMarkers = [
    ...analyzedTitles.flatMap((entry) => entry.sequenceMarkers),
    ...suffixState.sequenceMarkers,
  ];

  return {
    title: primary.title,
    alternativeTitles: uniqueText(
      analyzedTitles
        .slice(1)
        .map((entry) => entry.title)
        .filter((title) => title.toLocaleLowerCase() !== primary.title.toLocaleLowerCase()),
    ),
    authors,
    circle,
    parody,
    ...suffixState,
    sequenceMarkers: chapter && !sequenceMarkers.some((marker) => marker.kind === "chapter")
      ? [...sequenceMarkers, buildBareChapterMarker(chapter)]
      : sequenceMarkers,
    chapter: chapter ? normalizeChapter(chapter) : undefined,
  };
};

export const analyzeMangaCorrespondenceTitle = (
  rawTitle: string,
  config: ScraperTitleAnalysisConfig | null | undefined,
): MangaCorrespondenceTitleAnalysis => {
  const resolvedConfig = resolveAnalysisConfig(config);
  const analysis = analyzeScraperTitle(rawTitle, resolvedConfig);
  const heuristicAnalysis = analyzeHeuristicCorrespondenceTitle(rawTitle, resolvedConfig);
  const analyzedTitles = [analysis.title, ...analysis.alternativeTitles]
    .map(stripTrailingBareChapter);
  const explicitChapter = analysis.sequenceMarkers.find((marker) => marker.kind === "chapter")?.value;
  const bareChapter = analyzedTitles.find((entry) => entry.chapter)?.chapter;
  const chapter = explicitChapter ? normalizeChapter(explicitChapter) : bareChapter;
  const title = analyzedTitles[0]?.title || analysis.title;
  const alternativeTitles = uniqueText(
    analyzedTitles
      .slice(1)
      .map((entry) => entry.title)
      .filter((entry) => entry.toLocaleLowerCase() !== title.toLocaleLowerCase()),
  );

  const parserOnlyResult: MangaCorrespondenceTitleAnalysis = {
    ...analysis,
    title,
    alternativeTitles,
    sequenceMarkers: chapter && !explicitChapter
      ? [...analysis.sequenceMarkers, buildBareChapterMarker(chapter)]
      : analysis.sequenceMarkers,
    chapter,
  };
  if (!heuristicAnalysis) return parserOnlyResult;

  const normalizedRawTitle = normalizeTitleAnalysisText(rawTitle);
  const parserKeptRawTitle = normalizeTitleAnalysisText(analysis.title) === normalizedRawTitle;
  const shouldUseHeuristicStructure = analysis.variantId === "raw-title"
    || !analysis.matched
    || parserKeptRawTitle;
  const finalChapter = parserOnlyResult.chapter ?? heuristicAnalysis.chapter;

  return {
    ...parserOnlyResult,
    matched: shouldUseHeuristicStructure ? true : parserOnlyResult.matched,
    variantId: shouldUseHeuristicStructure
      ? "manga-correspondence-heuristic"
      : parserOnlyResult.variantId,
    variantName: shouldUseHeuristicStructure
      ? "Analyse tolérante des correspondances"
      : parserOnlyResult.variantName,
    title: shouldUseHeuristicStructure ? heuristicAnalysis.title : parserOnlyResult.title,
    alternativeTitles: shouldUseHeuristicStructure
      ? heuristicAnalysis.alternativeTitles
      : parserOnlyResult.alternativeTitles,
    authors: parserOnlyResult.authors.length
      ? parserOnlyResult.authors
      : heuristicAnalysis.authors,
    circle: parserOnlyResult.circle ?? heuristicAnalysis.circle,
    parody: parserOnlyResult.parody ?? heuristicAnalysis.parody,
    languageCode: parserOnlyResult.languageCode ?? heuristicAnalysis.languageCode,
    languageLabel: parserOnlyResult.languageLabel ?? heuristicAnalysis.languageLabel,
    suffixTags: uniqueText([
      ...parserOnlyResult.suffixTags,
      ...heuristicAnalysis.suffixTags,
    ]),
    unmatchedParts: uniqueText([
      ...parserOnlyResult.unmatchedParts,
      ...heuristicAnalysis.unmatchedParts,
    ]),
    sequenceMarkers: finalChapter
      && !parserOnlyResult.sequenceMarkers.some((marker) => marker.kind === "chapter")
      ? [...parserOnlyResult.sequenceMarkers, buildBareChapterMarker(finalChapter)]
      : parserOnlyResult.sequenceMarkers,
    chapter: finalChapter,
  };
};
