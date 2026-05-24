import { getBracketedJapaneseNameVariants } from "./japaneseRomanizationBracketNames";
import {
  addLongVowelShapeVariants,
  applyCommonReadingAlternatives,
  isRomanizedVariant,
  JAPANESE_ROMAJI_SYSTEMS,
  romanizeKana,
  toReadableTitleCase,
  uniqueValues,
  type KanaToRomaji,
  type JapaneseRomajiSystem,
} from "./japaneseRomanizationStringVariants";
import { getTokenBasedRomanizationVariants } from "./japaneseRomanizationTokenVariants";

export type JapaneseAnalyzerToken = {
  surface_form?: string;
  pos?: string;
  pos_detail_1?: string;
  pos_detail_2?: string;
  pos_detail_3?: string;
  conjugated_type?: string;
  conjugated_form?: string;
  basic_form?: string;
  reading?: string;
  pronunciation?: string;
};

export type KuroshiroInstance = {
  init: (analyzer: unknown) => Promise<void>;
  convert: (
    text: string,
    options: {
      to: "hiragana" | "romaji";
      mode: "normal" | "spaced";
      romajiSystem: JapaneseRomajiSystem;
    },
  ) => Promise<string>;
  _analyzer?: {
    parse: (text: string) => Promise<JapaneseAnalyzerToken[]>;
  };
};

export type KuroshiroModule = {
  default?: (new () => KuroshiroInstance) & {
    Util?: {
      kanaToRomaji?: KanaToRomaji;
    };
  };
  Util?: {
    kanaToRomaji?: KanaToRomaji;
  };
};

export type { KanaToRomaji };

const MAX_VARIANTS_PER_TEXT = 120;

export const createJapaneseRomanizationVariants = async (
  text: string,
  kuroshiro: KuroshiroInstance,
  kanaToRomaji: KanaToRomaji | null,
): Promise<string[]> => {
  const [
    hiraganaNormal,
    hiraganaSpaced,
    tokenBasedVariants,
  ] = await Promise.all([
    kuroshiro.convert(text, {
      to: "hiragana",
      mode: "normal",
      romajiSystem: "hepburn",
    }),
    kuroshiro.convert(text, {
      to: "hiragana",
      mode: "spaced",
      romajiSystem: "hepburn",
    }),
    getTokenBasedRomanizationVariants(kuroshiro, kanaToRomaji, text),
  ]);
  const kuroshiroRomajiVariants = await Promise.all(
    JAPANESE_ROMAJI_SYSTEMS.flatMap((system) => [
      kuroshiro.convert(text, {
        to: "romaji",
        mode: "normal",
        romajiSystem: system,
      }),
      kuroshiro.convert(text, {
        to: "romaji",
        mode: "spaced",
        romajiSystem: system,
      }),
    ]),
  );
  const kanaCharacterVariants = [
    ...JAPANESE_ROMAJI_SYSTEMS.map((system) => romanizeKana(hiraganaNormal, kanaToRomaji, system)),
    ...JAPANESE_ROMAJI_SYSTEMS.map((system) => romanizeKana(hiraganaSpaced, kanaToRomaji, system)),
  ];
  const baseVariants = addLongVowelShapeVariants([
    ...kuroshiroRomajiVariants,
    ...kanaCharacterVariants,
    ...tokenBasedVariants,
  ]);
  const commonReadingVariants = uniqueValues(baseVariants.map(applyCommonReadingAlternatives));
  const bracketedNameVariants = await getBracketedJapaneseNameVariants(
    kuroshiro,
    kanaToRomaji,
    text,
    commonReadingVariants,
  );
  const readableTitleCaseVariants = uniqueValues([
    ...commonReadingVariants,
    ...bracketedNameVariants,
  ].map(toReadableTitleCase));

  return uniqueValues([
    ...baseVariants,
    ...commonReadingVariants,
    ...readableTitleCaseVariants,
    ...bracketedNameVariants,
  ].filter(isRomanizedVariant), MAX_VARIANTS_PER_TEXT);
};
