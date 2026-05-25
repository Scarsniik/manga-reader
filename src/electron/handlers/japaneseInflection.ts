import type {
  JapaneseInflectionAnalysis,
  JapaneseInflectionInput,
  JapaneseInflectionRequest,
  JapaneseInflectionResult,
  JapaneseInflectionWordTypeKey,
} from "@/shared/japaneseInflection";
import type { JapaneseAnalyzerToken } from "./japaneseRomanizationTextVariants";
import { parseJapaneseText } from "./japaneseAnalyzer";
import { getFormInfo, getFormLabel } from "./japaneseInflectionForms";

const MAX_BATCH_ITEMS = 100;
const MAX_SURFACE_LENGTH = 80;
const MAX_BASE_FORM_LENGTH = 80;

type WordKind = "verb" | "iAdjective" | "naAdjective";

type WordInfo = {
  kind: WordKind;
  mainIndex: number;
  wordTypeKey: JapaneseInflectionWordTypeKey;
  wordTypeLabel: string;
};

type WordCandidate = {
  kind: WordKind;
  mainIndex: number;
  matchesBaseForm: boolean;
};

const EMPTY_ANALYSIS: JapaneseInflectionAnalysis = {
  surface: "",
  baseForm: null,
  wordTypeKey: null,
  wordTypeLabel: null,
  formKey: null,
  formLabel: null,
};

const normalizeValue = (value: unknown, maxLength: number): string => (
  String(value ?? "").trim().slice(0, maxLength)
);

const getTokenSurface = (token: JapaneseAnalyzerToken): string => token.surface_form ?? "";

const getTokenBaseForm = (token: JapaneseAnalyzerToken): string => token.basic_form ?? getTokenSurface(token);

const getNormalizedInput = (input: JapaneseInflectionInput): JapaneseInflectionInput => ({
  surface: normalizeValue(input?.surface, MAX_SURFACE_LENGTH),
  baseForm: normalizeValue(input?.baseForm, MAX_BASE_FORM_LENGTH) || null,
});

const getVerbType = (
  token: JapaneseAnalyzerToken,
  baseForm: string | null,
): Pick<WordInfo, "wordTypeKey" | "wordTypeLabel"> => {
  const conjugatedType = token.conjugated_type ?? "";
  const resolvedBaseForm = baseForm ?? getTokenBaseForm(token);

  if (conjugatedType.includes("一段")) {
    return {
      wordTypeKey: "verb-ichidan",
      wordTypeLabel: "Verbe ichidan",
    };
  }

  if (conjugatedType.includes("サ変") || resolvedBaseForm.endsWith("する")) {
    return {
      wordTypeKey: "verb-suru",
      wordTypeLabel: "Verbe suru",
    };
  }

  if (conjugatedType.includes("カ変") || resolvedBaseForm === "来る" || resolvedBaseForm === "くる") {
    return {
      wordTypeKey: "verb-kuru",
      wordTypeLabel: "Verbe kuru",
    };
  }

  if (conjugatedType.includes("五段")) {
    return {
      wordTypeKey: "verb-godan",
      wordTypeLabel: "Verbe godan",
    };
  }

  return {
    wordTypeKey: "verb",
    wordTypeLabel: "Verbe",
  };
};

const matchesBaseForm = (
  token: JapaneseAnalyzerToken,
  tokenIndex: number,
  tokens: JapaneseAnalyzerToken[],
  baseForm: string | null,
): boolean => {
  if (!baseForm) {
    return false;
  }

  const tokenBaseForm = getTokenBaseForm(token);
  if (tokenBaseForm === baseForm) {
    return true;
  }

  if (baseForm.endsWith("する") && tokenBaseForm === "する") {
    const prefixSurface = tokens.slice(0, tokenIndex).map(getTokenSurface).join("");
    return `${prefixSurface}する` === baseForm;
  }

  return false;
};

const findCandidateIndex = (
  tokens: JapaneseAnalyzerToken[],
  predicate: (token: JapaneseAnalyzerToken) => boolean,
): number => {
  return tokens.findIndex(predicate);
};

const getWordInfo = (tokens: JapaneseAnalyzerToken[], baseForm: string | null): WordInfo | null => {
  const candidateConfigs: Array<{
    kind: WordKind;
    predicate: (token: JapaneseAnalyzerToken) => boolean;
  }> = [
    {
      kind: "verb",
      predicate: (token) => token.pos === "動詞" && token.pos_detail_1 !== "非自立",
    },
    {
      kind: "iAdjective",
      predicate: (token) => token.pos === "形容詞",
    },
    {
      kind: "naAdjective",
      predicate: (token) => token.pos === "名詞" && token.pos_detail_1 === "形容動詞語幹",
    },
  ];
  const candidates = candidateConfigs
    .map((config): WordCandidate | null => {
      const mainIndex = findCandidateIndex(tokens, config.predicate);
      if (mainIndex < 0) {
        return null;
      }

      return {
        kind: config.kind,
        mainIndex,
        matchesBaseForm: matchesBaseForm(tokens[mainIndex], mainIndex, tokens, baseForm),
      };
    })
    .filter((candidate): candidate is WordCandidate => candidate !== null);
  const selectedCandidate = candidates.find((candidate) => candidate.matchesBaseForm)
    ?? candidates.sort((a, b) => a.mainIndex - b.mainIndex)[0]
    ?? null;

  if (!selectedCandidate) {
    return null;
  }

  if (selectedCandidate.kind === "verb") {
    const verbType = getVerbType(tokens[selectedCandidate.mainIndex], baseForm);

    return {
      kind: "verb",
      mainIndex: selectedCandidate.mainIndex,
      ...verbType,
    };
  }

  if (selectedCandidate.kind === "iAdjective") {
    return {
      kind: "iAdjective",
      mainIndex: selectedCandidate.mainIndex,
      wordTypeKey: "i-adjective",
      wordTypeLabel: "Adjectif en い",
    };
  }

  return {
    kind: "naAdjective",
    mainIndex: selectedCandidate.mainIndex,
    wordTypeKey: "na-adjective",
    wordTypeLabel: "Adjectif en な",
  };
};

const analyzeInput = async (input: JapaneseInflectionInput): Promise<JapaneseInflectionAnalysis> => {
  const normalizedInput = getNormalizedInput(input);
  if (!normalizedInput.surface) {
    return EMPTY_ANALYSIS;
  }

  const tokens = await parseJapaneseText(normalizedInput.surface);
  const wordInfo = getWordInfo(tokens, normalizedInput.baseForm ?? null);
  if (!wordInfo) {
    return {
      surface: normalizedInput.surface,
      baseForm: normalizedInput.baseForm ?? null,
      wordTypeKey: null,
      wordTypeLabel: null,
      formKey: null,
      formLabel: null,
    };
  }

  const formInfo = getFormInfo(tokens, wordInfo);

  return {
    surface: normalizedInput.surface,
    baseForm: normalizedInput.baseForm ?? getTokenBaseForm(tokens[wordInfo.mainIndex]),
    wordTypeKey: wordInfo.wordTypeKey,
    wordTypeLabel: wordInfo.wordTypeLabel,
    formKey: formInfo.formKey,
    formLabel: getFormLabel(formInfo),
  };
};

export const analyzeJapaneseInflections = async (
  request: JapaneseInflectionRequest,
): Promise<JapaneseInflectionResult> => {
  const items = (Array.isArray(request?.items) ? request.items : [])
    .map(getNormalizedInput)
    .filter((item) => item.surface.length > 0)
    .slice(0, MAX_BATCH_ITEMS);

  if (items.length === 0) {
    return {
      items: [],
    };
  }

  try {
    return {
      items: await Promise.all(items.map(analyzeInput)),
    };
  } catch (error) {
    return {
      items: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
