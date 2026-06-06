import type {
  JapaneseRomanizationRequest,
  JapaneseRomanizationResult,
} from "@/shared/japaneseRomanization";
import { hasJapaneseKanji } from "@/renderer/utils/japaneseRomanization";

type JapaneseRomanizationApi = {
  romanizeJapaneseTexts?: (request: JapaneseRomanizationRequest) => Promise<JapaneseRomanizationResult>;
};

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

const normalizeRomanizationText = (value: string): string => (
  String(value ?? "").trim().replace(/\s+/g, " ")
);

const getRomanizationCacheKey = (value: string): string => (
  normalizeRomanizationText(value).toLowerCase()
);

const romanizationVariantCache = new Map<string, string[]>();
const romanizationInFlightCache = new Map<string, Promise<string[]>>();

export const shouldUseAdvancedJapaneseRomanization = (value: string): boolean => (
  hasJapaneseKanji(value)
);

const readRomanizationBatch = async (
  targets: string[],
): Promise<Map<string, string[]>> => {
  const api = (typeof window === "undefined" ? null : (window as any).api) as JapaneseRomanizationApi | null;
  if (typeof api?.romanizeJapaneseTexts !== "function") {
    return new Map<string, string[]>();
  }

  let response: JapaneseRomanizationResult;
  try {
    response = await api.romanizeJapaneseTexts({
      texts: targets,
    });
  } catch {
    return new Map<string, string[]>();
  }

  if (response.error) {
    return new Map<string, string[]>();
  }

  const variantsByKey = new Map<string, string[]>();
  response.items.forEach((item) => {
    variantsByKey.set(getRomanizationCacheKey(item.text), uniqueValues(item.variants));
  });

  return variantsByKey;
};

export const loadAdvancedJapaneseRomanizationVariants = async (
  values: string[],
): Promise<Map<string, string[]>> => {
  const targets = uniqueValues(values)
    .map(normalizeRomanizationText)
    .filter(shouldUseAdvancedJapaneseRomanization);
  if (!targets.length) {
    return new Map<string, string[]>();
  }

  const missingTargets = targets.filter((target) => {
    const key = getRomanizationCacheKey(target);
    return !romanizationVariantCache.has(key) && !romanizationInFlightCache.has(key);
  });

  if (missingTargets.length) {
    const batchPromise = readRomanizationBatch(missingTargets);
    missingTargets.forEach((target) => {
      const key = getRomanizationCacheKey(target);
      const targetPromise = batchPromise
        .then((variantsByKey) => {
          const variants = variantsByKey.get(key) ?? [];
          romanizationVariantCache.set(key, variants);
          return variants;
        })
        .catch(() => {
          romanizationVariantCache.set(key, []);
          return [];
        })
        .finally(() => {
          romanizationInFlightCache.delete(key);
        });
      romanizationInFlightCache.set(key, targetPromise);
    });
  }

  const variantsByText = new Map<string, string[]>();
  await Promise.all(targets.map(async (target) => {
    const key = getRomanizationCacheKey(target);
    const cachedVariants = romanizationVariantCache.get(key);
    const variants = cachedVariants ?? await romanizationInFlightCache.get(key) ?? [];
    variantsByText.set(target, variants);
  }));

  return variantsByText;
};
