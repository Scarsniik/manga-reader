import { getMultiSearchTitleRomanizationTargets } from "@/renderer/components/MultiSearch/multiSearchTitleMerge";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import { loadAdvancedJapaneseRomanizationVariants } from "@/renderer/utils/advancedJapaneseRomanization";

const uniqueValues = (values: string[]): string[] => {
  const seen = new Set<string>();

  return values.filter((value) => {
    const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const getTitleRomanizationTargets = (title: string): string[] => (
  getMultiSearchTitleRomanizationTargets(title)
);

const getAdvancedRomanizedVariantsForTargets = (
  targets: string[],
  variantsByText: Map<string, string[]>,
): string[] => (
  uniqueValues(targets.flatMap((target) => variantsByText.get(target.trim().replace(/\s+/g, " ")) ?? []))
);

export const enrichSourceResultsWithJapaneseRomanization = async (
  sources: MultiSearchSourceResult[],
): Promise<MultiSearchSourceResult[]> => {
  if (!sources.length) {
    return sources;
  }

  const titleTargetsBySource = new Map<MultiSearchSourceResult, string[]>();
  const authorTargetsBySource = new Map<MultiSearchSourceResult, string[]>();
  const targets = sources.flatMap((source) => {
    const titleTargets = getTitleRomanizationTargets(source.result.title);
    const authorTargets = source.tentativeAuthorNames;

    titleTargetsBySource.set(source, titleTargets);
    authorTargetsBySource.set(source, authorTargets);

    return [
      ...titleTargets,
      ...authorTargets,
    ];
  });
  const variantsByText = await loadAdvancedJapaneseRomanizationVariants(targets);
  if (!variantsByText.size) {
    return sources;
  }

  return sources.map((source) => ({
    ...source,
    advancedRomanizedTitleVariants: getAdvancedRomanizedVariantsForTargets(
      titleTargetsBySource.get(source) ?? [],
      variantsByText,
    ),
    advancedRomanizedTentativeAuthorNameVariants: getAdvancedRomanizedVariantsForTargets(
      authorTargetsBySource.get(source) ?? [],
      variantsByText,
    ),
  }));
};
