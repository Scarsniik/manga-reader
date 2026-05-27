import {
  type ScraperTitleAnalysisBlockConfig,
  type ScraperTitleAnalysisConfig,
  type ScraperTitleAnalysisField,
  type ScraperTitleAnalysisResult,
  type ScraperTitleAnalysisVariantConfig,
  type ScraperTitleSequenceMarker,
} from "@/shared/scraper";
import {
  detectLanguageCodesFromTextValues,
  getLanguageLabel,
} from "@/renderer/utils/languageDetection";
import { normalizeScraperTitleAnalysisConfig } from "@/renderer/utils/scraperTitleAnalysis/normalization";
import {
  appendUniqueTitleAnalysisValue,
  normalizeTitleAnalysisText,
  splitTitleAnalysisAlternatives,
  splitTitleAnalysisListValue,
} from "@/renderer/utils/scraperTitleAnalysis/text";
import {
  appendTitleSequenceMarkers,
  extractTitleSequenceMarkers,
} from "@/renderer/utils/scraperTitleAnalysis/sequence";
import {
  consumeTitleAnalysisSuffixes,
  type SuffixClassification,
} from "@/renderer/utils/scraperTitleAnalysis/suffixes";

type TitleAnalysisState = {
  title: string;
  alternativeTitles: string[];
  circle?: string;
  authors: string[];
  parody?: string;
  languageCode?: string;
  languageLabel?: string;
  suffixTags: string[];
  unmatchedParts: string[];
  sequenceMarkers: ScraperTitleSequenceMarker[];
};

type BlockConsumption = {
  value?: string;
  innerValue?: string;
  remaining: string;
  suffixClassifications?: SuffixClassification[];
};

type VariantAnalysisMatch = {
  remaining: string;
  state: TitleAnalysisState;
};

const createEmptyState = (): TitleAnalysisState => ({
  title: "",
  alternativeTitles: [],
  authors: [],
  suffixTags: [],
  unmatchedParts: [],
  sequenceMarkers: [],
});

const applyFieldValue = (
  state: TitleAnalysisState,
  field: ScraperTitleAnalysisField | undefined,
  value: string,
): TitleAnalysisState => {
  const normalizedValue = normalizeTitleAnalysisText(value);
  if (!field || !normalizedValue) {
    return state;
  }

  if (field === "title") {
    const titleAlternatives = splitTitleAnalysisAlternatives(normalizedValue)
      .map((alternative) => extractTitleSequenceMarkers(alternative));
    const primaryAlternative = titleAlternatives[0] ?? extractTitleSequenceMarkers(normalizedValue);

    return {
      ...state,
      title: primaryAlternative.title,
      alternativeTitles: titleAlternatives
        .slice(1)
        .map((alternative) => alternative.title)
        .filter(Boolean),
      sequenceMarkers: titleAlternatives.reduce(
        (markers, alternative) => appendTitleSequenceMarkers(markers, alternative.sequenceMarkers),
        state.sequenceMarkers,
      ),
    };
  }

  if (field === "circle") {
    return { ...state, circle: normalizedValue };
  }

  if (field === "authors") {
    return {
      ...state,
      authors: splitTitleAnalysisListValue(normalizedValue).reduce(
        appendUniqueTitleAnalysisValue,
        state.authors,
      ),
    };
  }

  if (field === "parody") {
    return { ...state, parody: normalizedValue };
  }

  return {
    ...state,
    unmatchedParts: appendUniqueTitleAnalysisValue(state.unmatchedParts, normalizedValue),
  };
};

const consumeBracket = (value: string): BlockConsumption | null => {
  const match = value.match(/^\s*\[([^\]]*)]\s*/);
  if (!match) {
    return null;
  }

  return {
    value: normalizeTitleAnalysisText(match[1]),
    remaining: value.slice(match[0].length),
  };
};

const consumeBracketWithParentheses = (value: string): BlockConsumption | null => {
  const bracket = consumeBracket(value);
  if (!bracket?.value) {
    return null;
  }

  const split = bracket.value.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (!split) {
    return null;
  }

  return {
    value: normalizeTitleAnalysisText(split[1]),
    innerValue: normalizeTitleAnalysisText(split[2]),
    remaining: bracket.remaining,
  };
};

const consumeParentheses = (value: string): BlockConsumption | null => {
  const match = value.match(/^\s*\(([^)]*)\)\s*/);
  if (!match) {
    return null;
  }

  return {
    value: normalizeTitleAnalysisText(match[1]),
    remaining: value.slice(match[0].length),
  };
};

const getTrailingSuffixStartIndex = (value: string): number => {
  const match = value.match(/(?:\s*\[[^\]]+])+\s*$/);
  return typeof match?.index === "number" ? match.index : -1;
};

const getNextBlockStartIndex = (
  value: string,
  followingBlocks: ScraperTitleAnalysisBlockConfig[],
): number => {
  const candidateIndexes = followingBlocks.flatMap((block) => {
    if (!block.enabled || block.kind === "title") {
      return [];
    }

    if (block.kind === "parentheses") {
      const index = value.indexOf("(");
      return index >= 0 ? [index] : [];
    }

    if (block.kind === "suffixes") {
      const index = getTrailingSuffixStartIndex(value);
      return index >= 0 ? [index] : [];
    }

    const index = value.indexOf("[");
    return index >= 0 ? [index] : [];
  });

  return candidateIndexes.length ? Math.min(...candidateIndexes) : -1;
};

const consumeTitle = (
  value: string,
  followingBlocks: ScraperTitleAnalysisBlockConfig[],
): BlockConsumption | null => {
  const start = value.match(/^\s*/)?.[0].length ?? 0;
  const content = value.slice(start);
  const nextStartIndex = getNextBlockStartIndex(content, followingBlocks);
  const title = nextStartIndex >= 0 ? content.slice(0, nextStartIndex) : content;
  const normalizedTitle = normalizeTitleAnalysisText(title);

  if (!normalizedTitle) {
    return null;
  }

  return {
    value: normalizedTitle,
    remaining: nextStartIndex >= 0 ? content.slice(nextStartIndex) : "",
  };
};

const applySuffixClassifications = (
  state: TitleAnalysisState,
  classifications: SuffixClassification[],
): TitleAnalysisState => (
  classifications.reduce<TitleAnalysisState>((nextState, classification) => {
    if (classification.kind === "language") {
      return {
        ...nextState,
        languageCode: nextState.languageCode ?? classification.languageCode,
        languageLabel: nextState.languageLabel ?? getLanguageLabel(classification.languageCode),
      };
    }

    if (classification.kind === "tag") {
      return {
        ...nextState,
        suffixTags: appendUniqueTitleAnalysisValue(nextState.suffixTags, classification.value),
      };
    }

    if (classification.kind === "sequence") {
      return {
        ...nextState,
        sequenceMarkers: appendTitleSequenceMarkers(nextState.sequenceMarkers, classification.sequenceMarkers),
      };
    }

    return {
      ...nextState,
      unmatchedParts: appendUniqueTitleAnalysisValue(nextState.unmatchedParts, classification.value),
    };
  }, state)
);

const validateBlockValue = (
  block: ScraperTitleAnalysisBlockConfig,
  value: string | undefined,
): boolean => (
  block.validation !== "language"
  || Boolean(value && detectLanguageCodesFromTextValues([value]).length > 0)
);

const consumeBlock = (
  block: ScraperTitleAnalysisBlockConfig,
  remaining: string,
  followingBlocks: ScraperTitleAnalysisBlockConfig[],
  config: ScraperTitleAnalysisConfig,
): BlockConsumption | null => {
  if (block.kind === "title") {
    return consumeTitle(remaining, followingBlocks);
  }

  if (block.kind === "bracket") {
    return consumeBracket(remaining);
  }

  if (block.kind === "bracketWithParentheses") {
    return consumeBracketWithParentheses(remaining);
  }

  if (block.kind === "parentheses") {
    return consumeParentheses(remaining);
  }

  const suffixConsumption = consumeTitleAnalysisSuffixes(remaining, config);
  if (!suffixConsumption) {
    return null;
  }

  return {
    remaining: suffixConsumption.remaining,
    suffixClassifications: suffixConsumption.classifications,
  };
};

const applyBlockConsumption = (
  state: TitleAnalysisState,
  block: ScraperTitleAnalysisBlockConfig,
  consumption: BlockConsumption,
  isValid: boolean,
): TitleAnalysisState => {
  if (consumption.suffixClassifications) {
    return applySuffixClassifications(state, consumption.suffixClassifications);
  }

  return isValid
    ? applyFieldValue(applyFieldValue(state, block.field, consumption.value ?? ""), block.innerField, consumption.innerValue ?? "")
    : applyFieldValue(state, "extra", consumption.value ?? "");
};

const validateBlockConsumption = (
  block: ScraperTitleAnalysisBlockConfig,
  consumption: BlockConsumption,
): boolean => {
  if (!consumption.suffixClassifications) {
    return validateBlockValue(block, consumption.value);
  }

  return (
    block.validation !== "language"
    || consumption.suffixClassifications.some((classification) => classification.kind === "language")
  );
};

const analyzeBlockSequence = (
  blocks: ScraperTitleAnalysisBlockConfig[],
  config: ScraperTitleAnalysisConfig,
  index: number,
  state: TitleAnalysisState,
  remaining: string,
): VariantAnalysisMatch | null => {
  if (index >= blocks.length) {
    return normalizeTitleAnalysisText(remaining) || !state.title
      ? null
      : { state, remaining };
  }

  const block = blocks[index];
  const canSkipBlock = block.optional || block.onValidationFailure === "continue";
  const analyzeNext = (nextState: TitleAnalysisState, nextRemaining: string) => (
    analyzeBlockSequence(blocks, config, index + 1, nextState, nextRemaining)
  );
  const consumption = consumeBlock(block, remaining, blocks.slice(index + 1), config);

  if (!consumption) {
    return canSkipBlock ? analyzeNext(state, remaining) : null;
  }

  const isValid = validateBlockConsumption(block, consumption);
  if (!isValid && block.onValidationFailure !== "continue") {
    return canSkipBlock ? analyzeNext(state, remaining) : null;
  }

  const consumedState = applyBlockConsumption(state, block, consumption, isValid);
  const consumedResult = analyzeNext(consumedState, consumption.remaining);
  if (consumedResult) {
    return consumedResult;
  }

  return canSkipBlock ? analyzeNext(state, remaining) : null;
};

const buildResult = (
  rawTitle: string,
  state: TitleAnalysisState,
  variant: ScraperTitleAnalysisVariantConfig | null,
  matched: boolean,
): ScraperTitleAnalysisResult => ({
  rawTitle,
  matched,
  variantId: variant?.id,
  variantName: variant?.name,
  title: state.title || normalizeTitleAnalysisText(rawTitle),
  alternativeTitles: state.alternativeTitles,
  circle: state.circle,
  authors: state.authors,
  parody: state.parody,
  languageCode: state.languageCode,
  languageLabel: state.languageLabel,
  suffixTags: state.suffixTags,
  unmatchedParts: state.unmatchedParts,
  sequenceMarkers: state.sequenceMarkers,
});

const analyzeWithVariant = (
  rawTitle: string,
  variant: ScraperTitleAnalysisVariantConfig,
  config: ScraperTitleAnalysisConfig,
): ScraperTitleAnalysisResult | null => {
  const blocks = variant.blocks.filter((block) => block.enabled);
  const result = analyzeBlockSequence(blocks, config, 0, createEmptyState(), rawTitle);

  return result ? buildResult(rawTitle, result.state, variant, true) : null;
};

const buildFallbackResult = (
  rawTitle: string,
  matched: boolean,
): ScraperTitleAnalysisResult => {
  const sequenceExtraction = extractTitleSequenceMarkers(rawTitle);
  return buildResult(rawTitle, {
    ...createEmptyState(),
    title: sequenceExtraction.title,
    alternativeTitles: [],
    sequenceMarkers: sequenceExtraction.sequenceMarkers,
  }, null, matched);
};

export const analyzeScraperTitle = (
  rawTitle: string,
  configInput: unknown,
): ScraperTitleAnalysisResult => {
  const title = normalizeTitleAnalysisText(rawTitle);
  const config = normalizeScraperTitleAnalysisConfig(configInput);

  if (!title || !config.enabled) {
    return buildFallbackResult(title, false);
  }

  const result = config.variants
    .filter((variant) => variant.enabled)
    .map((variant) => analyzeWithVariant(title, variant, config))
    .find((variantResult): variantResult is ScraperTitleAnalysisResult => Boolean(variantResult));

  return result ?? buildFallbackResult(title, false);
};

export const getScraperTitleAnalysisSearchTitle = (
  rawTitle: string,
  configInput: unknown,
): string => {
  const result = analyzeScraperTitle(rawTitle, configInput);
  return [
    result.title,
    ...result.alternativeTitles,
  ]
    .map(normalizeTitleAnalysisText)
    .filter(Boolean)
    .join(", ");
};
