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

export const shouldUseAdvancedJapaneseRomanization = (value: string): boolean => (
  hasJapaneseKanji(value)
);

export const loadAdvancedJapaneseRomanizationVariants = async (
  values: string[],
): Promise<Map<string, string[]>> => {
  const targets = uniqueValues(values).filter(shouldUseAdvancedJapaneseRomanization);
  if (!targets.length) {
    return new Map<string, string[]>();
  }

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

  const variantsByText = new Map<string, string[]>();
  response.items.forEach((item) => {
    const variants = uniqueValues(item.variants);
    variantsByText.set(item.text, variants);
  });

  return variantsByText;
};
