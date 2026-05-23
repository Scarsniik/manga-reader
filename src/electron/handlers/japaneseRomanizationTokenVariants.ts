import type {
  JapaneseAnalyzerToken,
  KuroshiroInstance,
} from "./japaneseRomanizationTextVariants";
import {
  addLongVowelShapeVariants,
  JAPANESE_ROMAJI_SYSTEMS,
  romanizeKana,
  uniqueValues,
  type KanaToRomaji,
} from "./japaneseRomanizationStringVariants";

const MAX_TOKEN_COMBINATIONS = 80;

const getTokenReadingValues = (
  token: JapaneseAnalyzerToken,
  kanaToRomaji: KanaToRomaji | null,
): string[] => {
  const surface = token.surface_form ?? "";
  const kanaValues = [
    token.pronunciation,
    token.reading,
    surface,
  ].filter((value): value is string => Boolean(value && value !== "*"));

  return addLongVowelShapeVariants(kanaValues.flatMap((value) => (
    JAPANESE_ROMAJI_SYSTEMS.map((system) => romanizeKana(value, kanaToRomaji, system))
  )));
};

const getParticleReadingValues = (token: JapaneseAnalyzerToken): string[] => {
  if (token.pos !== "助詞") {
    return [];
  }

  switch (token.surface_form) {
    case "は":
      return ["wa", "ha"];
    case "へ":
      return ["e", "he"];
    case "を":
      return ["o", "wo"];
    default:
      return [];
  }
};

const getTokenRomanizationAlternatives = (
  token: JapaneseAnalyzerToken,
  kanaToRomaji: KanaToRomaji | null,
): string[] => (
  uniqueValues([
    ...getParticleReadingValues(token),
    ...getTokenReadingValues(token, kanaToRomaji),
  ]).slice(0, 8)
);

const isAuxiliaryToken = (token: JapaneseAnalyzerToken): boolean => (
  token.pos === "助動詞"
);

const joinTokenValues = (
  tokens: JapaneseAnalyzerToken[],
  values: string[],
  mode: "compact" | "spaced" | "spacedMergedAuxiliary",
): string => {
  if (mode === "compact") {
    return values.join("");
  }

  const parts: string[] = [];
  values.forEach((value, index) => {
    if (mode === "spacedMergedAuxiliary" && isAuxiliaryToken(tokens[index]) && parts.length) {
      parts[parts.length - 1] += value;
      return;
    }

    parts.push(value);
  });

  return parts.join(" ");
};

const getTokenAlternativeCombinations = (alternativesByToken: string[][]): string[][] => {
  const defaultCombination = alternativesByToken.map((alternatives) => alternatives[0] ?? "");
  const oneTokenAlternativeCombinations = alternativesByToken.flatMap((alternatives, tokenIndex) => (
    alternatives.slice(1).map((alternative) => {
      const nextCombination = [...defaultCombination];
      nextCombination[tokenIndex] = alternative;

      return nextCombination;
    })
  ));
  const boundedCartesianCombinations = alternativesByToken.reduce<string[][]>((combinations, alternatives) => {
    const nextCombinations: string[][] = [];

    combinations.forEach((combination) => {
      alternatives.forEach((alternative) => {
        if (nextCombinations.length < MAX_TOKEN_COMBINATIONS) {
          nextCombinations.push([...combination, alternative]);
        }
      });
    });

    return nextCombinations;
  }, [[]]);

  return uniqueValues([
    defaultCombination.join("\u0000"),
    ...oneTokenAlternativeCombinations.map((combination) => combination.join("\u0000")),
    ...boundedCartesianCombinations.map((combination) => combination.join("\u0000")),
  ], MAX_TOKEN_COMBINATIONS).map((combination) => combination.split("\u0000"));
};

export const getTokenBasedRomanizationVariants = async (
  kuroshiro: KuroshiroInstance,
  kanaToRomaji: KanaToRomaji | null,
  text: string,
): Promise<string[]> => {
  const tokens = await kuroshiro._analyzer?.parse(text);
  if (!tokens?.length) {
    return [];
  }

  const alternativesByToken = tokens.map((token) => getTokenRomanizationAlternatives(token, kanaToRomaji));
  if (alternativesByToken.some((alternatives) => !alternatives.length)) {
    return [];
  }

  const combinations = getTokenAlternativeCombinations(alternativesByToken);

  return uniqueValues(combinations.flatMap((combination) => [
    joinTokenValues(tokens, combination, "compact"),
    joinTokenValues(tokens, combination, "spaced"),
    joinTokenValues(tokens, combination, "spacedMergedAuxiliary"),
  ]));
};
