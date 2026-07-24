import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import {
  detectLanguageCodesFromTitle,
  uniqueLanguageCodes,
} from "@/renderer/utils/languageDetection";

export const normalizeMultiSearchTitleLanguagePriority = (
  values: unknown,
): string[] => {
  if (!Array.isArray(values)) return [];

  const seen = new Set<string>();
  return values.reduce<string[]>((result, value) => {
    const code = uniqueLanguageCodes([String(value ?? "")])[0];
    if (!code || seen.has(code)) return result;
    seen.add(code);
    result.push(code);
    return result;
  }, []);
};

const getSourceTitleLanguageCodes = (
  source: MultiSearchSourceResult,
): string[] => {
  const titleCodes = uniqueLanguageCodes(detectLanguageCodesFromTitle(source.result.title));
  if (titleCodes.length) return titleCodes;

  return uniqueLanguageCodes([
    ...source.sourceLanguageCodes,
    ...source.detectedLanguageCodes,
  ]);
};

export const selectPreferredMultiSearchTitleSource = (
  sources: MultiSearchSourceResult[],
  languagePriority: unknown,
): MultiSearchSourceResult | undefined => {
  const priority = normalizeMultiSearchTitleLanguagePriority(languagePriority);

  for (const languageCode of priority) {
    const source = sources.find((candidate) => (
      getSourceTitleLanguageCodes(candidate).includes(languageCode)
    ));
    if (source) return source;
  }

  return sources[0];
};

export const selectPreferredMultiSearchTitle = (
  sources: MultiSearchSourceResult[],
  languagePriority: unknown,
  fallback = "",
): string => (
  selectPreferredMultiSearchTitleSource(sources, languagePriority)?.result.title
  || fallback
);
