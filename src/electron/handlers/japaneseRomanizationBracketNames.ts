import type { KuroshiroInstance } from "./japaneseRomanizationTextVariants";
import {
  addLongVowelShapeVariants,
  applyCommonReadingAlternatives,
  capitalizeRomanWord,
  JAPANESE_ROMAJI_SYSTEMS,
  romanizeKana,
  uniqueValues,
  type KanaToRomaji,
} from "./japaneseRomanizationStringVariants";

type JapaneseNameRunKind = "kanji" | "kana" | "latin";

type BracketedJapaneseNameReplacement = {
  opening: string;
  closing: string;
  romanizedContents: string[];
};

const JAPANESE_BRACKET_PATTERN = /(\[([^\]]+)\]|［([^］]+)］|【([^】]+)】)/gu;

const getJapaneseNameRunKind = (character: string): JapaneseNameRunKind | null => {
  if (/[\u3040-\u30ff\uff66-\uff9fー]/u.test(character)) {
    return "kana";
  }

  if (/[\u3400-\u9fff々〆ヵヶ]/u.test(character)) {
    return "kanji";
  }

  if (/[\p{L}\p{N}]/u.test(character)) {
    return "latin";
  }

  return null;
};

const hasJapaneseNameRun = (content: string): boolean => (
  Array.from(content).some((character) => {
    const kind = getJapaneseNameRunKind(character);

    return kind === "kanji" || kind === "kana";
  })
);

const getJapaneseNameRuns = (content: string): string[] => {
  const runs: string[] = [];
  let currentRun = "";
  let currentKind: JapaneseNameRunKind | null = null;

  Array.from(content.normalize("NFKC")).forEach((character) => {
    const kind = getJapaneseNameRunKind(character);
    if (!kind) {
      if (currentRun) {
        runs.push(currentRun);
      }

      currentRun = "";
      currentKind = null;
      return;
    }

    if (currentKind && currentKind !== kind) {
      runs.push(currentRun);
      currentRun = character;
      currentKind = kind;
      return;
    }

    currentRun += character;
    currentKind = kind;
  });

  if (currentRun) {
    runs.push(currentRun);
  }

  return runs;
};

const romanizeNameRun = async (
  kuroshiro: KuroshiroInstance,
  kanaToRomaji: KanaToRomaji | null,
  run: string,
): Promise<string[]> => {
  if (getJapaneseNameRuns(run).every((value) => getJapaneseNameRunKind(value[0]) === "latin")) {
    return [run];
  }

  const [hiragana, spacedHiragana] = await Promise.all([
    kuroshiro.convert(run, {
      to: "hiragana",
      mode: "normal",
      romajiSystem: "hepburn",
    }),
    kuroshiro.convert(run, {
      to: "hiragana",
      mode: "spaced",
      romajiSystem: "hepburn",
    }),
  ]);
  const romanizedValues = addLongVowelShapeVariants([
    ...JAPANESE_ROMAJI_SYSTEMS.map((system) => romanizeKana(hiragana, kanaToRomaji, system)),
    ...JAPANESE_ROMAJI_SYSTEMS.map((system) => romanizeKana(spacedHiragana, kanaToRomaji, system)),
  ]);

  return uniqueValues(romanizedValues.map((value) => (
    applyCommonReadingAlternatives(value).replace(/\s+/g, "")
  )));
};

const romanizeBracketedJapaneseName = async (
  kuroshiro: KuroshiroInstance,
  kanaToRomaji: KanaToRomaji | null,
  content: string,
): Promise<string[]> => {
  const runs = getJapaneseNameRuns(content);
  const runVariants = await Promise.all(
    runs.map((run) => romanizeNameRun(kuroshiro, kanaToRomaji, run)),
  );
  const defaultRuns = runVariants.map((variants) => variants[0] ?? "");
  const spacedName = defaultRuns.map(capitalizeRomanWord).join(" ");
  const compactName = capitalizeRomanWord(defaultRuns.join(""));
  const oneRunAlternatives = runVariants.flatMap((variants, index) => (
    variants.slice(1).map((variant) => {
      const nextRuns = [...defaultRuns];
      nextRuns[index] = variant;

      return nextRuns.map(capitalizeRomanWord).join(" ");
    })
  ));

  return uniqueValues([
    spacedName,
    compactName,
    ...oneRunAlternatives,
  ]);
};

const getBracketedJapaneseNameReplacements = async (
  kuroshiro: KuroshiroInstance,
  kanaToRomaji: KanaToRomaji | null,
  text: string,
): Promise<BracketedJapaneseNameReplacement[]> => {
  const matches = Array.from(text.matchAll(JAPANESE_BRACKET_PATTERN));
  const replacements = await Promise.all(matches.map(async (match) => {
    const [fullMatch] = match;
    const content = match[2] ?? match[3] ?? match[4] ?? "";
    if (!hasJapaneseNameRun(content)) {
      return null;
    }

    return {
      opening: fullMatch[0],
      closing: fullMatch[fullMatch.length - 1],
      romanizedContents: await romanizeBracketedJapaneseName(kuroshiro, kanaToRomaji, content),
    };
  }));

  return replacements.filter((
    replacement,
  ): replacement is BracketedJapaneseNameReplacement => replacement !== null);
};

const applyBracketedJapaneseNameReplacement = (
  value: string,
  replacements: BracketedJapaneseNameReplacement[],
  replacementValues: string[],
): string => {
  let replacementIndex = 0;

  return value.replace(JAPANESE_BRACKET_PATTERN, (fullMatch) => {
    const replacement = replacements[replacementIndex];
    const romanizedContent = replacementValues[replacementIndex];
    replacementIndex += 1;

    if (!replacement || !romanizedContent) {
      return fullMatch;
    }

    return `${replacement.opening}${romanizedContent}${replacement.closing}`;
  });
};

export const getBracketedJapaneseNameVariants = async (
  kuroshiro: KuroshiroInstance,
  kanaToRomaji: KanaToRomaji | null,
  text: string,
  values: string[],
): Promise<string[]> => {
  const replacements = await getBracketedJapaneseNameReplacements(kuroshiro, kanaToRomaji, text);
  if (!replacements.length) {
    return [];
  }

  return uniqueValues(values.flatMap((value) => (
    replacements.flatMap((replacement, replacementIndex) => (
      replacement.romanizedContents.map((romanizedContent) => {
        const replacementValues = replacements.map((_, index) => (
          index === replacementIndex ? romanizedContent : replacements[index].romanizedContents[0] ?? ""
        ));

        return applyBracketedJapaneseNameReplacement(value, replacements, replacementValues);
      })
    ))
  )));
};
