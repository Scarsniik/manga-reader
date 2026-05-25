import type { JapaneseInflectionFormKey } from "@/shared/japaneseInflection";
import type { JapaneseAnalyzerToken } from "./japaneseRomanizationTextVariants";

export type JapaneseInflectionWordInfoForForm = {
  kind: "verb" | "iAdjective" | "naAdjective";
  mainIndex: number;
};

type FormPolarity = "affirmative" | "negative";

type FormInfo = {
  formKey: JapaneseInflectionFormKey;
  formName: string;
  polarity: FormPolarity;
  isPolite: boolean;
  label?: string;
};

type BaseFormKey =
  | "present"
  | "past"
  | "passive"
  | "passive-past"
  | "passive-te-form"
  | "te-form"
  | "tari-form"
  | "tara-conditional"
  | "tai-form"
  | "tai-form-past"
  | "volitional"
  | "progressive-present"
  | "progressive-past";

const getTokenSurface = (token: JapaneseAnalyzerToken): string => token.surface_form ?? "";

const getTokenBaseForm = (token: JapaneseAnalyzerToken): string => token.basic_form ?? getTokenSurface(token);

const hasBasicForm = (tokens: JapaneseAnalyzerToken[], basicForms: string[]): boolean => (
  tokens.some((token) => basicForms.includes(getTokenBaseForm(token)))
);

const hasNegativeAuxiliary = (tokens: JapaneseAnalyzerToken[]): boolean => (
  hasBasicForm(tokens, ["ない", "まい"])
  || tokens.some((token, index) => (
    getTokenSurface(token) === "ん" && getTokenBaseForm(tokens[index - 1] ?? {}) === "ます"
  ))
);

const hasContractedNegativeAuxiliary = (tokens: JapaneseAnalyzerToken[]): boolean => (
  tokens.some((token) => (
    getTokenBaseForm(token) === "ない"
    && ["ねえ", "ねぇ"].includes(getTokenSurface(token))
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

const hasTaiAuxiliary = (tokens: JapaneseAnalyzerToken[]): boolean => (
  tokens.some((token) => getTokenBaseForm(token) === "たい" && token.conjugated_type === "特殊・タイ")
);

const hasPassiveSuffix = (tokens: JapaneseAnalyzerToken[]): boolean => (
  tokens.some((token, index) => (
    index > 0
    && token.pos === "動詞"
    && token.pos_detail_1 === "接尾"
    && ["れる", "られる"].includes(getTokenBaseForm(token))
  ))
);

const hasTariEnding = (tokens: JapaneseAnalyzerToken[]): boolean => {
  const lastToken = tokens[tokens.length - 1];
  if (!lastToken) {
    return false;
  }

  return ["たり", "だり"].includes(getTokenBaseForm(lastToken));
};

const hasTaraConditionalEnding = (tokens: JapaneseAnalyzerToken[]): boolean => {
  const lastToken = tokens[tokens.length - 1];
  if (!lastToken) {
    return false;
  }

  const surface = getTokenSurface(lastToken);
  return (
    lastToken.conjugated_type === "特殊・タ"
    && lastToken.conjugated_form === "仮定形"
    && ["たら", "だら"].includes(surface)
  );
};

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
  polarity: FormPolarity,
  isPolite: boolean,
): JapaneseInflectionFormKey => {
  const polaritySuffix = polarity === "negative" ? "negative" : "affirmative";

  if (
    baseFormKey === "te-form"
    || baseFormKey === "passive"
    || baseFormKey === "passive-past"
    || baseFormKey === "passive-te-form"
    || baseFormKey === "tari-form"
    || baseFormKey === "tara-conditional"
    || baseFormKey === "tai-form"
    || baseFormKey === "tai-form-past"
  ) {
    return `${baseFormKey}-${polaritySuffix}` as JapaneseInflectionFormKey;
  }

  if (baseFormKey === "volitional" && polarity === "negative") {
    return "volitional-negative";
  }

  return `${baseFormKey}-${polaritySuffix}${isPolite ? "-polite" : ""}` as JapaneseInflectionFormKey;
};

export const getFormInfo = (
  tokens: JapaneseAnalyzerToken[],
  wordInfo: JapaneseInflectionWordInfoForForm,
): FormInfo => {
  const scopedTokens = tokens.slice(wordInfo.mainIndex);
  const mainToken = tokens[wordInfo.mainIndex];
  const isNegative = hasNegativeAuxiliary(scopedTokens);
  const isPast = hasPastAuxiliary(scopedTokens);
  const isPolite = hasPoliteAuxiliary(scopedTokens);
  const isVolitional = hasVolitionalAuxiliary(scopedTokens) || mainToken.conjugated_form === "未然ウ接続";
  const isProgressive = wordInfo.kind === "verb" && hasProgressiveAuxiliary(scopedTokens);
  const isTeForm = !isProgressive && hasTeEnding(scopedTokens);
  const isPassive = wordInfo.kind === "verb" && hasPassiveSuffix(scopedTokens);
  const polarity = isNegative ? "negative" : "affirmative";

  if (hasTaraConditionalEnding(scopedTokens)) {
    return {
      formKey: getPreciseFormKey("tara-conditional", polarity, false),
      formName: "Conditionnel en たら",
      polarity,
      isPolite: false,
    };
  }

  if (hasTariEnding(scopedTokens)) {
    return {
      formKey: getPreciseFormKey("tari-form", polarity, false),
      formName: "Forme en たり",
      polarity,
      isPolite: false,
    };
  }

  if (hasTaiAuxiliary(scopedTokens)) {
    const baseFormKey = isPast ? "tai-form-past" : "tai-form";

    return {
      formKey: getPreciseFormKey(baseFormKey, polarity, false),
      formName: isPast ? "Forme en たい passée" : "Forme en たい",
      polarity,
      isPolite: false,
    };
  }

  if (isPassive) {
    const baseFormKey = isTeForm
      ? "passive-te-form"
      : isPast
        ? "passive-past"
        : "passive";

    return {
      formKey: getPreciseFormKey(baseFormKey, polarity, false),
      formName: isTeForm
        ? "Passif en て"
        : isPast
          ? "Passif passé"
          : "Passif",
      polarity,
      isPolite: false,
    };
  }

  if (hasContractedNegativeAuxiliary(scopedTokens)) {
    return {
      formKey: "present-negative-contracted",
      formName: "Présent négatif contracté",
      polarity: "negative",
      isPolite: false,
      label: "Présent négatif contracté",
    };
  }

  if (hasBasicForm(scopedTokens, ["まい"])) {
    return {
      formKey: getPreciseFormKey("volitional", "negative", isPolite),
      formName: "Volitionnel",
      polarity: "negative",
      isPolite,
    };
  }

  if (isVolitional) {
    return {
      formKey: getPreciseFormKey("volitional", polarity, isPolite),
      formName: "Volitionnel",
      polarity,
      isPolite,
    };
  }

  if (isProgressive) {
    const baseFormKey = isPast ? "progressive-past" : "progressive-present";

    return {
      formKey: getPreciseFormKey(baseFormKey, polarity, isPolite),
      formName: isPast ? "Progressif passé" : "Progressif présent",
      polarity,
      isPolite,
    };
  }

  if (isTeForm) {
    return {
      formKey: getPreciseFormKey("te-form", polarity, isPolite),
      formName: "Forme en て",
      polarity,
      isPolite,
    };
  }

  const baseFormKey = isPast ? "past" : "present";

  return {
    formKey: getPreciseFormKey(baseFormKey, polarity, isPolite),
    formName: isPast ? "Passé" : "Présent",
    polarity,
    isPolite,
  };
};

export const getFormLabel = (formInfo: FormInfo): string => {
  if (formInfo.label) {
    return formInfo.label;
  }

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
