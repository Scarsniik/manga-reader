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
  | "present-negative-contracted"
  | "present-affirmative-polite"
  | "present-negative-polite"
  | "past-affirmative"
  | "past-negative"
  | "past-affirmative-polite"
  | "past-negative-polite"
  | "passive-affirmative"
  | "passive-negative"
  | "passive-past-affirmative"
  | "passive-past-negative"
  | "passive-te-form-affirmative"
  | "passive-te-form-negative"
  | "te-form-affirmative"
  | "te-form-negative"
  | "tari-form-affirmative"
  | "tari-form-negative"
  | "tara-conditional-affirmative"
  | "tara-conditional-negative"
  | "tai-form-affirmative"
  | "tai-form-negative"
  | "tai-form-past-affirmative"
  | "tai-form-past-negative"
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
  | "progressive-past-negative-polite"
  | "potential-affirmative"
  | "potential-negative"
  | "potential-past-affirmative"
  | "potential-past-negative"
  | "potential-te-form-affirmative"
  | "potential-te-form-negative"
  | "causative-affirmative"
  | "causative-negative"
  | "causative-past-affirmative"
  | "causative-past-negative"
  | "causative-te-form-affirmative"
  | "causative-te-form-negative";

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
