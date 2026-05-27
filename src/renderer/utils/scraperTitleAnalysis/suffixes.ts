import {
  type ScraperTitleAnalysisConfig,
  type ScraperTitleSequenceMarker,
  type ScraperTitleSuffixMapping,
} from "@/shared/scraper";
import {
  detectLanguageCodesFromTextValues,
  normalizeLanguageToken,
  uniqueLanguageCodes,
} from "@/renderer/utils/languageDetection";
import { extractTitleSequenceMarkers } from "@/renderer/utils/scraperTitleAnalysis/sequence";
import { normalizeTitleAnalysisText } from "@/renderer/utils/scraperTitleAnalysis/text";

export type SuffixClassification =
  | { kind: "language"; value: string; languageCode: string }
  | { kind: "tag"; value: string }
  | { kind: "sequence"; value: string; sequenceMarkers: ScraperTitleSequenceMarker[] }
  | { kind: "unknown"; value: string };

const consumeSuffixBracket = (
  value: string,
): {
  value: string;
  remaining: string;
} | null => {
  const match = value.match(/^\s*\[([^\]]*)]\s*/);
  if (!match) {
    return null;
  }

  return {
    value: normalizeTitleAnalysisText(match[1]),
    remaining: value.slice(match[0].length),
  };
};

const buildSuffixMappingIndex = (
  mappings: ScraperTitleSuffixMapping[],
): Map<string, ScraperTitleSuffixMapping> => {
  const index = new Map<string, ScraperTitleSuffixMapping>();
  mappings.forEach((mapping) => {
    const key = normalizeLanguageToken(mapping.value);
    if (key) {
      index.set(key, mapping);
    }
  });
  return index;
};

const classifySuffix = (
  value: string,
  mappingIndex: Map<string, ScraperTitleSuffixMapping>,
): SuffixClassification => {
  const normalizedValue = normalizeTitleAnalysisText(value);
  const mapping = mappingIndex.get(normalizeLanguageToken(normalizedValue));

  if (mapping?.kind === "language") {
    const languageCode = uniqueLanguageCodes([mapping.languageCode ?? "", mapping.value])[0];
    if (languageCode) {
      return { kind: "language", value: normalizedValue, languageCode };
    }
  }

  if (mapping?.kind === "tag") {
    return { kind: "tag", value: normalizedValue };
  }

  const languageCode = detectLanguageCodesFromTextValues([normalizedValue])[0];
  if (languageCode) {
    return { kind: "language", value: normalizedValue, languageCode };
  }

  const sequenceExtraction = extractTitleSequenceMarkers(normalizedValue);
  if (sequenceExtraction.sequenceMarkers.length > 0 && sequenceExtraction.title === normalizedValue) {
    return {
      kind: "sequence",
      value: normalizedValue,
      sequenceMarkers: sequenceExtraction.sequenceMarkers,
    };
  }

  return { kind: "unknown", value: normalizedValue };
};

export const consumeTitleAnalysisSuffixes = (
  value: string,
  config: ScraperTitleAnalysisConfig,
): {
  remaining: string;
  classifications: SuffixClassification[];
} | null => {
  let remaining = value;
  const suffixes: string[] = [];

  for (let guard = 0; guard < 30; guard += 1) {
    const bracket = consumeSuffixBracket(remaining);
    if (!bracket?.value) {
      break;
    }
    suffixes.push(bracket.value);
    remaining = bracket.remaining;
  }

  if (!suffixes.length) {
    return null;
  }

  const mappingIndex = buildSuffixMappingIndex(config.suffixMappings);
  return {
    remaining,
    classifications: suffixes
      .slice()
      .reverse()
      .map((suffix) => classifySuffix(suffix, mappingIndex))
      .reverse(),
  };
};

