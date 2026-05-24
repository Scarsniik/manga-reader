import type {
  JapaneseRomanizationRequest,
  JapaneseRomanizationResult,
} from "@/shared/japaneseRomanization";
import {
  createJapaneseRomanizationVariants,
} from "./japaneseRomanizationTextVariants";
import { getKanaToRomaji, getKuroshiro } from "./japaneseAnalyzer";

const MAX_BATCH_TEXTS = 200;
const MAX_TEXT_LENGTH = 300;

const uniqueValues = (values: string[]): string[] => {
  const seen = new Set<string>();

  return values.filter((value) => {
    const normalized = value.trim().replace(/\s+/g, " ");
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const normalizeText = (value: unknown): string => (
  String(value ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_TEXT_LENGTH)
);

const romanizeText = async (text: string): Promise<string[]> => {
  const kuroshiro = await getKuroshiro();

  return createJapaneseRomanizationVariants(text, kuroshiro, getKanaToRomaji());
};

export const romanizeJapaneseTexts = async (
  request: JapaneseRomanizationRequest,
): Promise<JapaneseRomanizationResult> => {
  const texts = uniqueValues(
    (Array.isArray(request?.texts) ? request.texts : [])
      .map(normalizeText)
      .filter(Boolean),
  ).slice(0, MAX_BATCH_TEXTS);

  if (!texts.length) {
    return {
      items: [],
    };
  }

  try {
    const items = await Promise.all(texts.map(async (text) => ({
      text,
      variants: await romanizeText(text),
    })));

    return {
      items,
    };
  } catch (error) {
    return {
      items: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
