export type JapaneseRomanizationRequest = {
  texts: string[];
};

export type JapaneseRomanizationItem = {
  text: string;
  variants: string[];
};

export type JapaneseRomanizationResult = {
  items: JapaneseRomanizationItem[];
  error?: string;
};
