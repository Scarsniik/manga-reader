import type {
  JapaneseInflectionAnalysis,
  JapaneseInflectionFormKey,
  JapaneseInflectionInput,
  JapaneseInflectionRequest,
  JapaneseInflectionResult,
  JapaneseInflectionWordTypeKey,
} from "@/shared/japaneseInflection";
import type { JapaneseAnalyzerToken } from "./japaneseRomanizationTextVariants";
import { parseJapaneseText } from "./japaneseAnalyzer";

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

type FormInfo = {
  formKey: JapaneseInflectionFormKey;
  formName: string;
  polarity: "affirmative" | "negative";
  isPolite: boolean;
};

type BaseFormKey =
  | "present"
  | "past"
  | "te-form"
  | "volitional"
  | "progressive-present"
  | "progressive-past";

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

const hasBasicForm = (tokens: JapaneseAnalyzerToken[], basicForms: string[]): boolean => (
  tokens.some((token) => basicForms.includes(getTokenBaseForm(token)))
);

const hasNegativeAuxiliary = (tokens: JapaneseAnalyzerToken[]): boolean => (
  hasBasicForm(tokens, ["ない", "まい"])
  || tokens.some((token, index) => (
    getTokenSurface(token) === "ん" && getTokenBaseForm(tokens[index - 1] ?? {}) === "ます"
  ))
);

const hasPastAuxiliary = (tokens: JapaneseAnalyzerToken[]): boolean => (
  tokens.some((token) => token.conjugated_type === "特殊・タ")
);

const hasPoliteAuxiliary = (tokens: JapaneseAnalyzerToken[]): boolean => (
  hasBasicForm(tokens, ["ます", "です"])
);

const hasVolitionalAuxiliary = (tokens: JapaneseAnalyzerToken[]): boolean => (
  hasBasicForm(tokens, ["う", "まい"])
);

const hasProgressiveAuxiliary = (tokens: JapaneseAnalyzerToken[]): boolean => (
  hasBasicForm(tokens, ["いる", "てる"])
);

const hasTeEnding = (tokens: JapaneseAnalyzerToken[]): boolean => {
  const lastToken = tokens[tokens.length - 1];
  if (!lastToken) {
    return false;
  }

  const surface = getTokenSurface(lastToken);
  return (
    (lastToken.pos === "助詞" && lastToken.pos_detail_1 === "接続助詞" && ["て", "で"].includes(surface))
    || (getTokenBaseForm(lastToken) === "だ" && lastToken.conjugated_form === "連用形" && surface === "で")
  );
};

const getPreciseFormKey = (
  baseFormKey: BaseFormKey,
  polarity: FormInfo["polarity"],
  isPolite: boolean,
): JapaneseInflectionFormKey => {
  const polaritySuffix = polarity === "negative" ? "negative" : "affirmative";

  if (baseFormKey === "te-form") {
    return `te-form-${polaritySuffix}` as JapaneseInflectionFormKey;
  }

  if (baseFormKey === "volitional" && polarity === "negative") {
    return "volitional-negative";
  }

  return `${baseFormKey}-${polaritySuffix}${isPolite ? "-polite" : ""}` as JapaneseInflectionFormKey;
};

const getFormInfo = (
  tokens: JapaneseAnalyzerToken[],
  wordInfo: WordInfo,
): FormInfo => {
  const scopedTokens = tokens.slice(wordInfo.mainIndex);
  const mainToken = tokens[wordInfo.mainIndex];
  const isNegative = hasNegativeAuxiliary(scopedTokens);
  const isPast = hasPastAuxiliary(scopedTokens);
  const isPolite = hasPoliteAuxiliary(scopedTokens);
  const isVolitional = hasVolitionalAuxiliary(scopedTokens) || mainToken.conjugated_form === "未然ウ接続";
  const isProgressive = wordInfo.kind === "verb" && hasProgressiveAuxiliary(scopedTokens);
  const isTeForm = !isProgressive && hasTeEnding(scopedTokens);

  if (hasBasicForm(scopedTokens, ["まい"])) {
    return {
      formKey: getPreciseFormKey("volitional", "negative", isPolite),
      formName: "Volitionnel",
      polarity: "negative",
      isPolite,
    };
  }

  if (isVolitional) {
    const polarity = isNegative ? "negative" : "affirmative";

    return {
      formKey: getPreciseFormKey("volitional", polarity, isPolite),
      formName: "Volitionnel",
      polarity,
      isPolite,
    };
  }

  if (isProgressive) {
    const baseFormKey = isPast ? "progressive-past" : "progressive-present";
    const polarity = isNegative ? "negative" : "affirmative";

    return {
      formKey: getPreciseFormKey(baseFormKey, polarity, isPolite),
      formName: isPast ? "Progressif passé" : "Progressif présent",
      polarity,
      isPolite,
    };
  }

  if (isTeForm) {
    const polarity = isNegative ? "negative" : "affirmative";

    return {
      formKey: getPreciseFormKey("te-form", polarity, isPolite),
      formName: "Forme en て",
      polarity,
      isPolite,
    };
  }

  const baseFormKey = isPast ? "past" : "present";
  const polarity = isNegative ? "negative" : "affirmative";

  return {
    formKey: getPreciseFormKey(baseFormKey, polarity, isPolite),
    formName: isPast ? "Passé" : "Présent",
    polarity,
    isPolite,
  };
};

const getFormLabel = (formInfo: FormInfo): string => {
  const isFeminineForm = formInfo.formName.startsWith("Forme ");
  const polarityLabel = formInfo.polarity === "negative"
    ? (isFeminineForm ? "négative" : "négatif")
    : (isFeminineForm ? "affirmative" : "affirmatif");

  return [
    formInfo.formName,
    polarityLabel,
    formInfo.isPolite ? "poli" : null,
  ].filter((value): value is string => Boolean(value)).join(" ");
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
