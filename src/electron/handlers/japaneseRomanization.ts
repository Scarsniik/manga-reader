import type {
  JapaneseRomanizationRequest,
  JapaneseRomanizationResult,
} from "@/shared/japaneseRomanization";
import {
  createJapaneseRomanizationVariants,
  type KanaToRomaji,
  type KuroshiroInstance,
  type KuroshiroModule,
} from "./japaneseRomanizationTextVariants";

type KuroshiroConstructor = new () => KuroshiroInstance;
type KuromojiAnalyzerConstructor = new () => unknown;

const MAX_BATCH_TEXTS = 200;
const MAX_TEXT_LENGTH = 300;

let kuroshiroPromise: Promise<KuroshiroInstance> | null = null;
let kanaToRomaji: KanaToRomaji | null = null;

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

const getKuroshiro = async (): Promise<KuroshiroInstance> => {
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

const romanizeText = async (text: string): Promise<string[]> => {
  const kuroshiro = await getKuroshiro();

  return createJapaneseRomanizationVariants(text, kuroshiro, kanaToRomaji);
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
