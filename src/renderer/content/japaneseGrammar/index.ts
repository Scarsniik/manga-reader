import type {
  JapaneseInflectionFormKey,
  JapaneseInflectionWordTypeKey,
} from "@/shared/japaneseInflection";
import verbMarkdown from "@/renderer/content/japaneseGrammar/types/verb.md?raw";
import verbGodanMarkdown from "@/renderer/content/japaneseGrammar/types/verb-godan.md?raw";
import verbIchidanMarkdown from "@/renderer/content/japaneseGrammar/types/verb-ichidan.md?raw";
import verbSuruMarkdown from "@/renderer/content/japaneseGrammar/types/verb-suru.md?raw";
import verbKuruMarkdown from "@/renderer/content/japaneseGrammar/types/verb-kuru.md?raw";
import iAdjectiveMarkdown from "@/renderer/content/japaneseGrammar/types/i-adjective.md?raw";
import naAdjectiveMarkdown from "@/renderer/content/japaneseGrammar/types/na-adjective.md?raw";
import presentAffirmativeMarkdown from "@/renderer/content/japaneseGrammar/forms/present-affirmative.md?raw";
import presentNegativeMarkdown from "@/renderer/content/japaneseGrammar/forms/present-negative.md?raw";
import presentAffirmativePoliteMarkdown from "@/renderer/content/japaneseGrammar/forms/present-affirmative-polite.md?raw";
import presentNegativePoliteMarkdown from "@/renderer/content/japaneseGrammar/forms/present-negative-polite.md?raw";
import pastAffirmativeMarkdown from "@/renderer/content/japaneseGrammar/forms/past-affirmative.md?raw";
import pastNegativeMarkdown from "@/renderer/content/japaneseGrammar/forms/past-negative.md?raw";
import pastAffirmativePoliteMarkdown from "@/renderer/content/japaneseGrammar/forms/past-affirmative-polite.md?raw";
import pastNegativePoliteMarkdown from "@/renderer/content/japaneseGrammar/forms/past-negative-polite.md?raw";
import teFormAffirmativeMarkdown from "@/renderer/content/japaneseGrammar/forms/te-form-affirmative.md?raw";
import teFormNegativeMarkdown from "@/renderer/content/japaneseGrammar/forms/te-form-negative.md?raw";
import volitionalAffirmativeMarkdown from "@/renderer/content/japaneseGrammar/forms/volitional-affirmative.md?raw";
import volitionalNegativeMarkdown from "@/renderer/content/japaneseGrammar/forms/volitional-negative.md?raw";
import volitionalAffirmativePoliteMarkdown from "@/renderer/content/japaneseGrammar/forms/volitional-affirmative-polite.md?raw";
import progressivePresentAffirmativeMarkdown from "@/renderer/content/japaneseGrammar/forms/progressive-present-affirmative.md?raw";
import progressivePresentNegativeMarkdown from "@/renderer/content/japaneseGrammar/forms/progressive-present-negative.md?raw";
import progressivePresentAffirmativePoliteMarkdown from "@/renderer/content/japaneseGrammar/forms/progressive-present-affirmative-polite.md?raw";
import progressivePresentNegativePoliteMarkdown from "@/renderer/content/japaneseGrammar/forms/progressive-present-negative-polite.md?raw";
import progressivePastAffirmativeMarkdown from "@/renderer/content/japaneseGrammar/forms/progressive-past-affirmative.md?raw";
import progressivePastNegativeMarkdown from "@/renderer/content/japaneseGrammar/forms/progressive-past-negative.md?raw";
import progressivePastAffirmativePoliteMarkdown from "@/renderer/content/japaneseGrammar/forms/progressive-past-affirmative-polite.md?raw";
import progressivePastNegativePoliteMarkdown from "@/renderer/content/japaneseGrammar/forms/progressive-past-negative-polite.md?raw";

export type JapaneseGrammarReference = {
  title: string;
  markdown: string;
};

export const japaneseWordTypeReferences: Record<JapaneseInflectionWordTypeKey, JapaneseGrammarReference> = {
  "verb": {
    title: "Verbe",
    markdown: verbMarkdown,
  },
  "verb-godan": {
    title: "Verbe godan",
    markdown: verbGodanMarkdown,
  },
  "verb-ichidan": {
    title: "Verbe ichidan",
    markdown: verbIchidanMarkdown,
  },
  "verb-suru": {
    title: "Verbe suru",
    markdown: verbSuruMarkdown,
  },
  "verb-kuru": {
    title: "Verbe kuru",
    markdown: verbKuruMarkdown,
  },
  "i-adjective": {
    title: "Adjectif en い",
    markdown: iAdjectiveMarkdown,
  },
  "na-adjective": {
    title: "Adjectif en な",
    markdown: naAdjectiveMarkdown,
  },
};

export const japaneseFormReferences: Record<JapaneseInflectionFormKey, JapaneseGrammarReference> = {
  "present-affirmative": {
    title: "Présent affirmatif",
    markdown: presentAffirmativeMarkdown,
  },
  "present-negative": {
    title: "Présent négatif",
    markdown: presentNegativeMarkdown,
  },
  "present-affirmative-polite": {
    title: "Présent affirmatif poli",
    markdown: presentAffirmativePoliteMarkdown,
  },
  "present-negative-polite": {
    title: "Présent négatif poli",
    markdown: presentNegativePoliteMarkdown,
  },
  "past-affirmative": {
    title: "Passé affirmatif",
    markdown: pastAffirmativeMarkdown,
  },
  "past-negative": {
    title: "Passé négatif",
    markdown: pastNegativeMarkdown,
  },
  "past-affirmative-polite": {
    title: "Passé affirmatif poli",
    markdown: pastAffirmativePoliteMarkdown,
  },
  "past-negative-polite": {
    title: "Passé négatif poli",
    markdown: pastNegativePoliteMarkdown,
  },
  "te-form-affirmative": {
    title: "Forme en て affirmative",
    markdown: teFormAffirmativeMarkdown,
  },
  "te-form-negative": {
    title: "Forme en て négative",
    markdown: teFormNegativeMarkdown,
  },
  "volitional-affirmative": {
    title: "Volitionnel affirmatif",
    markdown: volitionalAffirmativeMarkdown,
  },
  "volitional-negative": {
    title: "Volitionnel négatif",
    markdown: volitionalNegativeMarkdown,
  },
  "volitional-affirmative-polite": {
    title: "Volitionnel affirmatif poli",
    markdown: volitionalAffirmativePoliteMarkdown,
  },
  "progressive-present-affirmative": {
    title: "Progressif présent affirmatif",
    markdown: progressivePresentAffirmativeMarkdown,
  },
  "progressive-present-negative": {
    title: "Progressif présent négatif",
    markdown: progressivePresentNegativeMarkdown,
  },
  "progressive-present-affirmative-polite": {
    title: "Progressif présent affirmatif poli",
    markdown: progressivePresentAffirmativePoliteMarkdown,
  },
  "progressive-present-negative-polite": {
    title: "Progressif présent négatif poli",
    markdown: progressivePresentNegativePoliteMarkdown,
  },
  "progressive-past-affirmative": {
    title: "Progressif passé affirmatif",
    markdown: progressivePastAffirmativeMarkdown,
  },
  "progressive-past-negative": {
    title: "Progressif passé négatif",
    markdown: progressivePastNegativeMarkdown,
  },
  "progressive-past-affirmative-polite": {
    title: "Progressif passé affirmatif poli",
    markdown: progressivePastAffirmativePoliteMarkdown,
  },
  "progressive-past-negative-polite": {
    title: "Progressif passé négatif poli",
    markdown: progressivePastNegativePoliteMarkdown,
  },
};

export const getJapaneseWordTypeReference = (
  key: JapaneseInflectionWordTypeKey,
): JapaneseGrammarReference => japaneseWordTypeReferences[key];

export const getJapaneseFormReference = (
  key: JapaneseInflectionFormKey,
): JapaneseGrammarReference => japaneseFormReferences[key];

export const getJapaneseGrammarReferenceByLink = (
  target: string,
): JapaneseGrammarReference | null => {
  const [scheme, kind, key] = String(target || "").split(":");
  if (scheme !== "grammar" || !key) {
    return null;
  }

  if (kind === "type" && key in japaneseWordTypeReferences) {
    return japaneseWordTypeReferences[key as JapaneseInflectionWordTypeKey];
  }

  if (kind === "form" && key in japaneseFormReferences) {
    return japaneseFormReferences[key as JapaneseInflectionFormKey];
  }

  return null;
};
