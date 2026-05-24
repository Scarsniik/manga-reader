import type {
  JapaneseAnalyzerToken,
  KanaToRomaji,
  KuroshiroInstance,
  KuroshiroModule,
} from "./japaneseRomanizationTextVariants";

type KuroshiroConstructor = new () => KuroshiroInstance;
type KuromojiAnalyzerConstructor = new () => unknown;

let kuroshiroPromise: Promise<KuroshiroInstance> | null = null;
let kanaToRomaji: KanaToRomaji | null = null;

export const getKuroshiro = async (): Promise<KuroshiroInstance> => {
  if (kuroshiroPromise) {
    return kuroshiroPromise;
  }

  kuroshiroPromise = (async () => {
    // Kuroshiro does not publish TypeScript types.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const KuroshiroModule = require("kuroshiro") as KuroshiroModule;
    const KuroshiroDefault = KuroshiroModule.default;
    const Kuroshiro = KuroshiroDefault ?? (KuroshiroModule as unknown as KuroshiroConstructor);
    kanaToRomaji = KuroshiroModule.Util?.kanaToRomaji
      ?? KuroshiroDefault?.Util?.kanaToRomaji
      ?? null;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const KuromojiAnalyzer = require("kuroshiro-analyzer-kuromoji") as KuromojiAnalyzerConstructor;
    const kuroshiro = new Kuroshiro();

    await kuroshiro.init(new KuromojiAnalyzer());
    return kuroshiro;
  })();

  return kuroshiroPromise;
};

export const getKanaToRomaji = (): KanaToRomaji | null => kanaToRomaji;

export const parseJapaneseText = async (text: string): Promise<JapaneseAnalyzerToken[]> => {
  const kuroshiro = await getKuroshiro();

  return kuroshiro._analyzer?.parse(text) ?? [];
};
