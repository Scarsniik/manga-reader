import { getJapaneseRomajiVariants } from "@/renderer/utils/japaneseRomanization";

const COMPACT_TITLE_MIN_CHARACTERS = 8;
const MIN_PHONETIC_SOURCE_LENGTH = 12;
const MIN_PHONETIC_KEY_LENGTH = 8;

export type TitleMergeVariantKind = "base" | "lightRomaji" | "heavyRomaji" | "katakanaPhonetic";
export type RomanizationMatchLevel = "light" | "heavy" | "katakana";

export type TitleMergeVariant = {
  value: string;
  kind: TitleMergeVariantKind;
};

const getCompactTitleVariant = (value: string): string => {
  const compactValue = value.replace(/\s+/g, "");

  return compactValue !== value && Array.from(compactValue).length >= COMPACT_TITLE_MIN_CHARACTERS
    ? compactValue
    : "";
};

const addCompactTitleVariants = (variants: TitleMergeVariant[]): TitleMergeVariant[] => ([
  ...variants,
  ...variants.map((variant) => ({
    value: getCompactTitleVariant(variant.value),
    kind: variant.kind,
  })),
]);

const uniqueTitleMergeVariants = (variants: TitleMergeVariant[]): TitleMergeVariant[] => {
  const seen = new Set<string>();

  return variants.filter((variant) => {
    const key = `${variant.kind}::${variant.value}`;
    if (!variant.value || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const isLooseRomajiCandidate = (value: string): boolean => (
  /^[a-z0-9 ]+$/u.test(value)
);

const normalizeLooseRomajiLetters = (value: string): string => (
  value
    .replace(/ch/g, "t")
    .replace(/ts/g, "t")
    .replace(/sh/g, "s")
    .replace(/ph/g, "f")
    .replace(/c(?=[aou])/g, "k")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/q/g, "k")
    .replace(/x/g, "ks")
    .replace(/l/g, "r")
    .replace(/v/g, "b")
);

export const getLooseRomajiPhoneticKey = (normalizedTitle: string): string => {
  if (!isLooseRomajiCandidate(normalizedTitle)) {
    return "";
  }

  const compactValue = normalizedTitle.replace(/\s+/g, "");
  if (compactValue.length < MIN_PHONETIC_SOURCE_LENGTH) {
    return "";
  }

  const phoneticKey = normalizeLooseRomajiLetters(compactValue)
    .replace(/[aeiou]+/g, "")
    .replace(/(.)\1+/g, "$1");

  return phoneticKey.length >= MIN_PHONETIC_KEY_LENGTH ? `romaji ${phoneticKey}` : "";
};

export const getMergeTitleVariants = (
  value: string,
  normalizeTitleVariant: (value: string, kind: TitleMergeVariantKind) => TitleMergeVariant[],
  advancedRomanizedVariants: string[] = [],
): TitleMergeVariant[] => {
  const lightRomanizedVariants = getJapaneseRomajiVariants(value);

  return uniqueTitleMergeVariants(addCompactTitleVariants([
    ...normalizeTitleVariant(value, "base"),
    ...lightRomanizedVariants.flatMap((variant) => normalizeTitleVariant(variant, "lightRomaji")),
    ...advancedRomanizedVariants.flatMap((variant) => normalizeTitleVariant(variant, "heavyRomaji")),
  ]));
};

export const buildVariantKindSets = (
  variants: TitleMergeVariant[],
): Map<string, Set<TitleMergeVariantKind>> => {
  const variantKindSets = new Map<string, Set<TitleMergeVariantKind>>();

  variants.forEach((variant) => {
    const kinds = variantKindSets.get(variant.value);
    if (kinds) {
      kinds.add(variant.kind);
      return;
    }

    variantKindSets.set(variant.value, new Set([variant.kind]));
  });

  return variantKindSets;
};

export const getRomanizationMatchLevel = (
  leftKinds: Set<TitleMergeVariantKind>,
  rightKinds: Set<TitleMergeVariantKind>,
): RomanizationMatchLevel | null => {
  const usesKatakanaPhoneticMerge = leftKinds.has("katakanaPhonetic") || rightKinds.has("katakanaPhonetic");
  const usesHeavyRomanization = leftKinds.has("heavyRomaji") || rightKinds.has("heavyRomaji");
  const usesLightRomanization = leftKinds.has("lightRomaji") || rightKinds.has("lightRomaji");

  if (usesKatakanaPhoneticMerge) {
    return "katakana";
  }

  if (usesHeavyRomanization) {
    return "heavy";
  }

  if (usesLightRomanization) {
    return "light";
  }

  return null;
};
