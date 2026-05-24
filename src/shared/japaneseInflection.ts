export type JapaneseInflectionInput = {
  surface: string;
  baseForm?: string | null;
};

export type JapaneseInflectionRequest = {
  items: JapaneseInflectionInput[];
};

export type JapaneseInflectionWordTypeKey =
  | "verb"
  | "verb-godan"
  | "verb-ichidan"
  | "verb-suru"
  | "verb-kuru"
  | "i-adjective"
  | "na-adjective";

export type JapaneseInflectionFormKey =
  | "present-affirmative"
  | "present-negative"
  | "present-affirmative-polite"
  | "present-negative-polite"
  | "past-affirmative"
  | "past-negative"
  | "past-affirmative-polite"
  | "past-negative-polite"
  | "te-form-affirmative"
  | "te-form-negative"
  | "volitional-affirmative"
  | "volitional-negative"
  | "volitional-affirmative-polite"
  | "progressive-present-affirmative"
  | "progressive-present-negative"
  | "progressive-present-affirmative-polite"
  | "progressive-present-negative-polite"
  | "progressive-past-affirmative"
  | "progressive-past-negative"
  | "progressive-past-affirmative-polite"
  | "progressive-past-negative-polite";

export type JapaneseInflectionAnalysis = {
  surface: string;
  baseForm: string | null;
  wordTypeKey: JapaneseInflectionWordTypeKey | null;
  wordTypeLabel: string | null;
  formKey: JapaneseInflectionFormKey | null;
  formLabel: string | null;
};

export type JapaneseInflectionResult = {
  items: JapaneseInflectionAnalysis[];
  error?: string;
};
