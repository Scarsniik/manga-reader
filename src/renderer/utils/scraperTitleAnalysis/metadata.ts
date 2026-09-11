import { normalizeTitleAnalysisText } from "@/renderer/utils/scraperTitleAnalysis/text";

const TRAILING_TRANSLATION_METHOD_PATTERN = /(?:^|\s)(?:mtl|machine[\s-]*(?:translated?|translation)|ai[\s-]*translated?|机翻)\s*$/iu;
const LEADING_ORPHANED_BRACKET_BLOCK_PATTERN = /^\s*([^\[\]]{2,100})\]\s+(?=\S)/u;

export type OrphanedTitleBracketBlock = {
  value: string;
  remaining: string;
};

export const extractLeadingOrphanedTitleBracketBlock = (
  value: string,
): OrphanedTitleBracketBlock | null => {
  const normalized = normalizeTitleAnalysisText(value);
  const match = normalized.match(LEADING_ORPHANED_BRACKET_BLOCK_PATTERN);
  if (!match?.[1]) return null;

  return {
    value: normalizeTitleAnalysisText(match[1]),
    remaining: normalizeTitleAnalysisText(normalized.slice(match[0].length)),
  };
};

export const stripLeadingOrphanedTitleBracketBlock = (value: string): string => (
  extractLeadingOrphanedTitleBracketBlock(value)?.remaining ?? normalizeTitleAnalysisText(value)
);

export const stripTrailingTitleTranslationMethod = (value: string): string => {
  let remaining = normalizeTitleAnalysisText(value);

  for (let guard = 0; guard < 4; guard += 1) {
    const stripped = normalizeTitleAnalysisText(
      remaining.replace(TRAILING_TRANSLATION_METHOD_PATTERN, " "),
    );
    if (stripped === remaining) break;
    remaining = stripped;
  }

  return remaining;
};
