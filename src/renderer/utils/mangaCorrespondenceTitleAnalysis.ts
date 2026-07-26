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

const CHAPTER_NUMBER_SOURCE = "[0-9０-９]{1,4}(?:[.,][0-9０-９]+)?";
const CHAPTER_VALUE_SOURCE = `${CHAPTER_NUMBER_SOURCE}(?:\\s*[-–—~〜～]\\s*${CHAPTER_NUMBER_SOURCE})?`;
const TRAILING_CHAPTER_MODIFIER_SOURCE = "(?:\\s*\\+\\s*(?:bonus|omake|extra|おまけ))?";
const TRAILING_BARE_CHAPTER_PATTERN = new RegExp(
  `^(?<title>.*?\\S)\\s+(?:\\(\\s*(?<parenthesizedChapter>${CHAPTER_VALUE_SOURCE})\\s*\\)|(?<bareChapter>${CHAPTER_VALUE_SOURCE}))${TRAILING_CHAPTER_MODIFIER_SOURCE}\\s*[!！]?$`,
  "iu",
);
const TRAILING_JAPANESE_CHAPTER_PATTERN = new RegExp(
  `^(?<title>.*[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}ー])(?<bareChapter>${CHAPTER_VALUE_SOURCE})${TRAILING_CHAPTER_MODIFIER_SOURCE}\\s*[!！]?$`,
  "iu",
);
const NUMBERED_TILDE_SUBTITLE_PATTERN = new RegExp(
  `^(?<title>.*\\S)\\s+(?<chapter>${CHAPTER_VALUE_SOURCE})\\s*[~〜～]\\s*.*$`,
  "iu",
);
const JAPANESE_NUMBERED_TILDE_SUBTITLE_PATTERN = new RegExp(
  `^(?<title>.*[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}ー])(?<chapter>${CHAPTER_VALUE_SOURCE})\\s*[~〜～]\\s*.*$`,
  "iu",
);
const NUMBERED_DASH_SUBTITLE_PATTERN = new RegExp(
  `^(?<title>.*\\S)\\s+[-–—]\\s*(?<chapter>${CHAPTER_VALUE_SOURCE})\\s*[-–—:]\\s*.+$`,
  "iu",
);
const NUMBERED_WRAPPED_SUBTITLE_PATTERN = new RegExp(
  `^(?<title>.*?\\S)\\s+(?<chapter>${CHAPTER_NUMBER_SOURCE})\\s*[-–—]\\s*(?!${CHAPTER_NUMBER_SOURCE}(?:\\s|$))(?<subtitle>.+?)\\s*[-–—]\\s*$`,
  "iu",
);
const NUMBERED_SUFFIX_SUBTITLE_PATTERN = new RegExp(
  `^(?<title>.*\\S)\\s+(?<chapter>${CHAPTER_VALUE_SOURCE})\\s*:\\s*.+$`,
  "iu",
);
const WRAPPED_SUBTITLE_PATTERN = /^(?<title>.+?\S)\s+[-–—]\s*.+?\s*[-–—]\s*$/iu;
const TILDE_SUBTITLE_PATTERN = /^(?<title>.+?\S)\s*[~〜～]\s*.*$/iu;
const INLINE_RELEASE_STATUS_PATTERN = /\s*\[(?:ongoing|complete|completed)\]\s*/giu;
const TRAILING_SUFFIX_PATTERN = /\s*(?:\[([^\]]*)\]|\{([^}]*)\}|=([^=]*)=)\s*$/u;
const TRAILING_METADATA_PARENTHESES_PATTERN = /\s*\((uncensored|censured|censored|decensored|digital|translated|colou?red|textless|hq|lq|high[\s-]*quality|low[\s-]*quality)\)\s*$/iu;
const LEADING_EVENT_PATTERN = /^\s*\((?:(?:c\d+|20\d{2}[^)]*)|(?:[^)]*(?:akihabara|comiket|comic|doujin)[^)]*))\)\s*/iu;
const LEADING_AUTHOR_PATTERN = /^\s*\[([^\]]*)\]\s*/u;
const LEADING_NESTED_CREATOR_PATTERN = /^\s*[\[(（]\s*([^()[\]（）]+?)\s*[（(]\s*([^()（）]+?)\s*[）)]\s*[\]）)]\s*/u;
const LEADING_SIMPLE_CREATOR_PATTERN = /^\s*\(([^()]*)\)\s*/u;
const TRAILING_PARENTHESES_PATTERN = /\s*\(([^()]*)\)\s*$/u;
const BARE_CHAPTER_VALUE_PATTERN = new RegExp(`^${CHAPTER_VALUE_SOURCE}$`, "u");
const COMPILATION_MARKER_SOURCE = "(?:compilation(?:\\s+story)?|soush(?:u+|ū)hen|[總总総]集編)";
const COMPILATION_RELEASE_PATTERN = new RegExp(
  `${COMPILATION_MARKER_SOURCE}[\\s~～〜:;,_\\-–—]*$`,
  "iu",
);
const TRAILING_COMPILATION_DESCRIPTOR_PATTERN = new RegExp(
  `^(?<title>.+?\\S)\\s*${COMPILATION_MARKER_SOURCE}(?:\\s*(?:【|\\[|~|〜|～)\\s*(?<coverage>${CHAPTER_VALUE_SOURCE})\\s*[+＋]?\\s*(?:】|\\])?)?\\s*$`,
  "iu",
);
const SPECIAL_RELEASE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "Bonus", pattern: /(?:bonus|omake|おまけ)[\s~～〜:;,_\-–—]*$/iu },
  { label: "Extra", pattern: /(?:extra|extras|side[\s-]*story|番外編)[\s~～〜:;,_\-–—]*$/iu },
  { label: "Spécial", pattern: /(?:special|特別編)[\s~～〜:;,_\-–—]*$/iu },
  { label: "Prologue", pattern: /prologue[\s~～〜:;,_\-–—]*$/iu },
  { label: "Épilogue", pattern: /(?:epilogue|afterword)[\s~～〜:;,_\-–—]*$/iu },
];

const normalizeChapter = (value: string): string => {
  const normalized = value
    .normalize("NFKC")
    .replace(",", ".")
    .replace(/\s*[-–—~〜～]\s*/g, "-");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? String(numeric) : normalized;
};

const stripTrailingBareChapter = (
  value: string,
): { title: string; chapter?: string } => {
  const match = value.match(TRAILING_BARE_CHAPTER_PATTERN)
    ?? value.match(TRAILING_JAPANESE_CHAPTER_PATTERN);
  const chapter = match?.groups?.parenthesizedChapter ?? match?.groups?.bareChapter;
  if (!match?.groups?.title || !chapter) {
    return { title: value };
  }

  return {
    title: match.groups.title.trim(),
    chapter: normalizeChapter(chapter),
  };
};

const stripDecoratedChapterSubtitle = (
  value: string,
): { title: string; chapter?: string } => {
  const labeledSequence = extractTitleSequenceMarkers(value);
  if (!labeledSequence.sequenceMarkers.some((marker) => marker.kind === "chapter")) {
    const trailingChapter = stripTrailingBareChapter(value);
    if (trailingChapter.chapter) {
      return trailingChapter;
    }
  }

  const numberedMatch = value.match(NUMBERED_DASH_SUBTITLE_PATTERN)
    ?? value.match(NUMBERED_WRAPPED_SUBTITLE_PATTERN)
    ?? value.match(NUMBERED_TILDE_SUBTITLE_PATTERN)
    ?? value.match(JAPANESE_NUMBERED_TILDE_SUBTITLE_PATTERN)
    ?? value.match(NUMBERED_SUFFIX_SUBTITLE_PATTERN);
  if (numberedMatch?.groups?.title && numberedMatch.groups.chapter) {
    return {
      title: normalizeTitleAnalysisText(numberedMatch.groups.title),
      chapter: normalizeChapter(numberedMatch.groups.chapter),
    };
  }

  const wrappedSubtitleMatch = value.match(WRAPPED_SUBTITLE_PATTERN);
  if (wrappedSubtitleMatch?.groups?.title) {
    return { title: normalizeTitleAnalysisText(wrappedSubtitleMatch.groups.title) };
  }

  const subtitleMatch = value.match(TILDE_SUBTITLE_PATTERN);
  if (subtitleMatch?.groups?.title) {
    return { title: normalizeTitleAnalysisText(subtitleMatch.groups.title) };
  }

  return { title: value };
};

const stripTrailingReleaseDescriptor = (
  value: string,
): { title: string; releaseChapter?: string } => {
  const compilationMatch = value.match(TRAILING_COMPILATION_DESCRIPTOR_PATTERN);
  if (compilationMatch?.groups?.title) {
    const coverage = compilationMatch.groups.coverage
      ? normalizeChapter(compilationMatch.groups.coverage)
      : undefined;
    return {
      title: normalizeTitleAnalysisText(compilationMatch.groups.title),
      releaseChapter: coverage ? `Compilation ${coverage}` : "Compilation",
    };
  }

  const specialRelease = SPECIAL_RELEASE_PATTERNS
    .map((entry) => ({ ...entry, match: value.match(entry.pattern) }))
    .find((entry) => Boolean(entry.match && typeof entry.match.index === "number" && entry.match.index > 0));
  if (specialRelease?.match && typeof specialRelease.match.index === "number") {
    const titlePrefix = value.slice(0, specialRelease.match.index);
    const isNumberedReleaseModifier = /\+\s*$/u.test(titlePrefix);
    return {
      title: normalizeTitleAnalysisText(
        titlePrefix.replace(/\s*(?:\+|[-–—:;,.])+\s*$/u, ""),
      ),
      releaseChapter: isNumberedReleaseModifier ? undefined : specialRelease.label,
    };
  }

  return { title: value };
};

type CorrespondenceTitleSegment = {
  title: string;
  chapter?: string;
  releaseChapter?: string;
  sequenceMarkers: ScraperTitleSequenceMarker[];
};

const analyzeCorrespondenceTitleSegment = (
  value: string,
): CorrespondenceTitleSegment => {
  const withoutInlineStatus = normalizeTitleAnalysisText(
    value.replace(INLINE_RELEASE_STATUS_PATTERN, " "),
  );
  const release = stripTrailingReleaseDescriptor(withoutInlineStatus);
  const decorated = stripDecoratedChapterSubtitle(release.title);
  const explicitSequence = extractTitleSequenceMarkers(decorated.title);
  const bareSequence = stripTrailingBareChapter(explicitSequence.title);
  const explicitChapter = explicitSequence.sequenceMarkers
    .find((marker) => marker.kind === "chapter")?.value;

  return {
    title: normalizeTitleAnalysisText(bareSequence.title),
    chapter: explicitChapter
      ? normalizeChapter(explicitChapter)
      : decorated.chapter ?? bareSequence.chapter,
    releaseChapter: release.releaseChapter,
    sequenceMarkers: explicitSequence.sequenceMarkers,
  };
};

const classifyCorrespondenceChapter = (
  titles: string[],
  chapter?: string,
): string | undefined => {
  const isCompilation = titles.some((title) => COMPILATION_RELEASE_PATTERN.test(title));
  if (isCompilation) {
    return chapter ? `Compilation ${chapter}` : "Compilation";
  }

  if (!chapter) {
    const specialRelease = SPECIAL_RELEASE_PATTERNS.find(({ pattern }) => (
      titles.some((title) => pattern.test(title))
    ));
    if (specialRelease) {
      return specialRelease.label;
    }
  }

  return chapter;
};

const isNumericChapterValue = (value: string): boolean => (
  BARE_CHAPTER_VALUE_PATTERN.test(value)
);

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
    const bracketMatch = remaining.match(TRAILING_SUFFIX_PATTERN);
    const metadataParenthesesMatch = remaining.match(TRAILING_METADATA_PARENTHESES_PATTERN);
    const match = bracketMatch ?? metadataParenthesesMatch;
    const suffixValue = bracketMatch
      ? bracketMatch[1] ?? bracketMatch[2] ?? bracketMatch[3]
      : metadataParenthesesMatch?.[1];
    if (!match || !suffixValue || typeof match.index !== "number") break;
    suffixValues.unshift(normalizeTitleAnalysisText(suffixValue));
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
    if (BARE_CHAPTER_VALUE_PATTERN.test(normalizeTitleAnalysisText(match[1]))) break;
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
  const nestedCreatorMatch = remaining.match(LEADING_NESTED_CREATOR_PATTERN);
  const authorMatch = remaining.match(LEADING_AUTHOR_PATTERN);
  const simpleCreatorMatch = remaining.match(LEADING_SIMPLE_CREATOR_PATTERN);
  if (nestedCreatorMatch?.[1] && nestedCreatorMatch[2]) {
    circle = normalizeTitleAnalysisText(nestedCreatorMatch[1]);
    authors = uniqueText([normalizeTitleAnalysisText(nestedCreatorMatch[2])]);
    remaining = normalizeTitleAnalysisText(remaining.slice(nestedCreatorMatch[0].length));
  } else if (authorMatch?.[1]) {
    const prefix = normalizeTitleAnalysisText(authorMatch[1]);
    const circleAuthorMatch = prefix.match(/^(.*?)\s*\(([^()]*)\)\s*$/u);
    if (circleAuthorMatch) {
      circle = normalizeTitleAnalysisText(circleAuthorMatch[1]);
      authors = uniqueText([normalizeTitleAnalysisText(circleAuthorMatch[2])]);
    } else {
      authors = uniqueText(prefix.split(/\s*(?:,|&|\/)\s*/u));
    }
    remaining = normalizeTitleAnalysisText(remaining.slice(authorMatch[0].length));
  } else if (simpleCreatorMatch?.[1]) {
    authors = uniqueText(
      normalizeTitleAnalysisText(simpleCreatorMatch[1]).split(/\s*(?:,|&|\/)\s*/u),
    );
    remaining = normalizeTitleAnalysisText(remaining.slice(simpleCreatorMatch[0].length));
  }

  const globalParentheses = stripTrailingParentheses(remaining);
  let parody = globalParentheses.values[globalParentheses.values.length - 1];
  const analyzedTitles = splitTitleAnalysisAlternatives(globalParentheses.title)
    .map((value) => {
      const parentheses = stripTrailingParentheses(value);
      parody ??= parentheses.values[parentheses.values.length - 1];
      return analyzeCorrespondenceTitleSegment(parentheses.title);
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
  const classifiedChapter = analyzedTitles.find((entry) => entry.releaseChapter)?.releaseChapter
    ?? classifyCorrespondenceChapter(
      analyzedTitles.map((entry) => entry.title),
      chapter ? normalizeChapter(chapter) : undefined,
    );
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
    chapter: classifiedChapter,
  };
};

export const analyzeMangaCorrespondenceTitle = (
  rawTitle: string,
  config: ScraperTitleAnalysisConfig | null | undefined,
): MangaCorrespondenceTitleAnalysis => {
  const usesBuiltInFallback = !config?.enabled;
  const resolvedConfig = resolveAnalysisConfig(config);
  const analysis = analyzeScraperTitle(rawTitle, resolvedConfig);
  const heuristicAnalysis = analyzeHeuristicCorrespondenceTitle(rawTitle, resolvedConfig);
  const analyzedTitles = [analysis.title, ...analysis.alternativeTitles]
    .map(analyzeCorrespondenceTitleSegment);
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
  const classifiedChapter = analyzedTitles.find((entry) => entry.releaseChapter)?.releaseChapter
    ?? classifyCorrespondenceChapter(
      [title, ...alternativeTitles],
      chapter,
    );
  const segmentSequenceMarkers = analyzedTitles.flatMap((entry) => entry.sequenceMarkers);
  const parserSequenceMarkers = [
    ...analysis.sequenceMarkers,
    ...segmentSequenceMarkers.filter((marker) => !analysis.sequenceMarkers.some((existing) => (
      existing.kind === marker.kind
      && existing.label === marker.label
      && existing.value === marker.value
    ))),
  ];

  const parserOnlyResult: MangaCorrespondenceTitleAnalysis = {
    ...analysis,
    title,
    alternativeTitles,
    sequenceMarkers: chapter && !parserSequenceMarkers.some((marker) => marker.kind === "chapter")
      ? [...parserSequenceMarkers, buildBareChapterMarker(chapter)]
      : parserSequenceMarkers,
    chapter: classifiedChapter,
  };
  if (!heuristicAnalysis) return parserOnlyResult;

  const normalizedRawTitle = normalizeTitleAnalysisText(rawTitle);
  const parserKeptRawTitle = normalizeTitleAnalysisText(analysis.title) === normalizedRawTitle;
  const parserTitleKey = normalizeTitleAnalysisText(parserOnlyResult.title).toLocaleLowerCase();
  const heuristicTitleKey = normalizeTitleAnalysisText(heuristicAnalysis.title).toLocaleLowerCase();
  const heuristicExtractedMoreStructure = usesBuiltInFallback && (
    (!parserOnlyResult.chapter && Boolean(heuristicAnalysis.chapter))
    || (
      Boolean(parserOnlyResult.chapter)
      && Boolean(heuristicAnalysis.chapter)
      && parserOnlyResult.chapter !== heuristicAnalysis.chapter
    )
    || (
      parserTitleKey !== heuristicTitleKey
      && parserTitleKey.includes(heuristicTitleKey)
    )
  );
  const shouldUseHeuristicStructure = analysis.variantId === "raw-title"
    || !analysis.matched
    || parserKeptRawTitle
    || heuristicExtractedMoreStructure;
  const finalChapter = shouldUseHeuristicStructure
    ? heuristicAnalysis.chapter ?? parserOnlyResult.chapter
    : parserOnlyResult.chapter ?? heuristicAnalysis.chapter;
  const selectedSequenceMarkers = shouldUseHeuristicStructure
    ? heuristicAnalysis.sequenceMarkers
    : parserOnlyResult.sequenceMarkers;

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
      && isNumericChapterValue(finalChapter)
      && !selectedSequenceMarkers.some((marker) => marker.kind === "chapter")
      ? [...selectedSequenceMarkers, buildBareChapterMarker(finalChapter)]
      : selectedSequenceMarkers,
    chapter: finalChapter,
  };
};
