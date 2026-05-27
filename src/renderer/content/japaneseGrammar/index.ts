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
import presentNegativeContractedMarkdown from "@/renderer/content/japaneseGrammar/forms/present-negative-contracted.md?raw";
import presentAffirmativePoliteMarkdown from "@/renderer/content/japaneseGrammar/forms/present-affirmative-polite.md?raw";
import presentNegativePoliteMarkdown from "@/renderer/content/japaneseGrammar/forms/present-negative-polite.md?raw";
import pastAffirmativeMarkdown from "@/renderer/content/japaneseGrammar/forms/past-affirmative.md?raw";
import pastNegativeMarkdown from "@/renderer/content/japaneseGrammar/forms/past-negative.md?raw";
import pastAffirmativePoliteMarkdown from "@/renderer/content/japaneseGrammar/forms/past-affirmative-polite.md?raw";
import pastNegativePoliteMarkdown from "@/renderer/content/japaneseGrammar/forms/past-negative-polite.md?raw";
import passiveAffirmativeMarkdown from "@/renderer/content/japaneseGrammar/forms/passive-affirmative.md?raw";
import passiveNegativeMarkdown from "@/renderer/content/japaneseGrammar/forms/passive-negative.md?raw";
import passivePastAffirmativeMarkdown from "@/renderer/content/japaneseGrammar/forms/passive-past-affirmative.md?raw";
import passivePastNegativeMarkdown from "@/renderer/content/japaneseGrammar/forms/passive-past-negative.md?raw";
import passiveTeFormAffirmativeMarkdown from "@/renderer/content/japaneseGrammar/forms/passive-te-form-affirmative.md?raw";
import passiveTeFormNegativeMarkdown from "@/renderer/content/japaneseGrammar/forms/passive-te-form-negative.md?raw";
import teFormAffirmativeMarkdown from "@/renderer/content/japaneseGrammar/forms/te-form-affirmative.md?raw";
import teFormNegativeMarkdown from "@/renderer/content/japaneseGrammar/forms/te-form-negative.md?raw";
import tariFormAffirmativeMarkdown from "@/renderer/content/japaneseGrammar/forms/tari-form-affirmative.md?raw";
import tariFormNegativeMarkdown from "@/renderer/content/japaneseGrammar/forms/tari-form-negative.md?raw";
import taraConditionalAffirmativeMarkdown from "@/renderer/content/japaneseGrammar/forms/tara-conditional-affirmative.md?raw";
import taraConditionalNegativeMarkdown from "@/renderer/content/japaneseGrammar/forms/tara-conditional-negative.md?raw";
import taiFormAffirmativeMarkdown from "@/renderer/content/japaneseGrammar/forms/tai-form-affirmative.md?raw";
import taiFormNegativeMarkdown from "@/renderer/content/japaneseGrammar/forms/tai-form-negative.md?raw";
import taiFormPastAffirmativeMarkdown from "@/renderer/content/japaneseGrammar/forms/tai-form-past-affirmative.md?raw";
import taiFormPastNegativeMarkdown from "@/renderer/content/japaneseGrammar/forms/tai-form-past-negative.md?raw";
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
import potentialAffirmativeMarkdown from "@/renderer/content/japaneseGrammar/forms/potential-affirmative.md?raw";
import potentialNegativeMarkdown from "@/renderer/content/japaneseGrammar/forms/potential-negative.md?raw";
import potentialPastAffirmativeMarkdown from "@/renderer/content/japaneseGrammar/forms/potential-past-affirmative.md?raw";
import potentialPastNegativeMarkdown from "@/renderer/content/japaneseGrammar/forms/potential-past-negative.md?raw";
import potentialTeFormAffirmativeMarkdown from "@/renderer/content/japaneseGrammar/forms/potential-te-form-affirmative.md?raw";
import potentialTeFormNegativeMarkdown from "@/renderer/content/japaneseGrammar/forms/potential-te-form-negative.md?raw";
import causativeAffirmativeMarkdown from "@/renderer/content/japaneseGrammar/forms/causative-affirmative.md?raw";
import causativeNegativeMarkdown from "@/renderer/content/japaneseGrammar/forms/causative-negative.md?raw";
import causativeTeFormAffirmativeMarkdown from "@/renderer/content/japaneseGrammar/forms/causative-te-form-affirmative.md?raw";
import causativeTeFormNegativeMarkdown from "@/renderer/content/japaneseGrammar/forms/causative-te-form-negative.md?raw";

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
  "present-negative-contracted": {
    title: "Présent négatif contracté",
    markdown: presentNegativeContractedMarkdown,
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
  "passive-affirmative": {
    title: "Passif affirmatif",
    markdown: passiveAffirmativeMarkdown,
  },
  "passive-negative": {
    title: "Passif négatif",
    markdown: passiveNegativeMarkdown,
  },
  "passive-past-affirmative": {
    title: "Passif passé affirmatif",
    markdown: passivePastAffirmativeMarkdown,
  },
  "passive-past-negative": {
    title: "Passif passé négatif",
    markdown: passivePastNegativeMarkdown,
  },
  "passive-te-form-affirmative": {
    title: "Passif en て affirmatif",
    markdown: passiveTeFormAffirmativeMarkdown,
  },
  "passive-te-form-negative": {
    title: "Passif en て négatif",
    markdown: passiveTeFormNegativeMarkdown,
  },
  "te-form-affirmative": {
    title: "Forme en て affirmative",
    markdown: teFormAffirmativeMarkdown,
  },
  "te-form-negative": {
    title: "Forme en て négative",
    markdown: teFormNegativeMarkdown,
  },
  "tari-form-affirmative": {
    title: "Forme en たり affirmative",
    markdown: tariFormAffirmativeMarkdown,
  },
  "tari-form-negative": {
    title: "Forme en たり négative",
    markdown: tariFormNegativeMarkdown,
  },
  "tara-conditional-affirmative": {
    title: "Conditionnel en たら affirmatif",
    markdown: taraConditionalAffirmativeMarkdown,
  },
  "tara-conditional-negative": {
    title: "Conditionnel en たら négatif",
    markdown: taraConditionalNegativeMarkdown,
  },
  "tai-form-affirmative": {
    title: "Forme en たい affirmative",
    markdown: taiFormAffirmativeMarkdown,
  },
  "tai-form-negative": {
    title: "Forme en たい négative",
    markdown: taiFormNegativeMarkdown,
  },
  "tai-form-past-affirmative": {
    title: "Forme en たい passée affirmative",
    markdown: taiFormPastAffirmativeMarkdown,
  },
  "tai-form-past-negative": {
    title: "Forme en たい passée négative",
    markdown: taiFormPastNegativeMarkdown,
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
  "potential-affirmative": {
    title: "Potentiel affirmatif",
    markdown: potentialAffirmativeMarkdown,
  },
  "potential-negative": {
    title: "Potentiel négatif",
    markdown: potentialNegativeMarkdown,
  },
  "potential-past-affirmative": {
    title: "Potentiel passé affirmatif",
    markdown: potentialPastAffirmativeMarkdown,
  },
  "potential-past-negative": {
    title: "Potentiel passé négatif",
    markdown: potentialPastNegativeMarkdown,
  },
  "potential-te-form-affirmative": {
    title: "Potentiel en て affirmatif",
    markdown: potentialTeFormAffirmativeMarkdown,
  },
  "potential-te-form-negative": {
    title: "Potentiel en て négatif",
    markdown: potentialTeFormNegativeMarkdown,
  },
  "causative-affirmative": {
    title: "Causatif affirmatif",
    markdown: causativeAffirmativeMarkdown,
  },
  "causative-negative": {
    title: "Causatif négatif",
    markdown: causativeNegativeMarkdown,
  },
  "causative-te-form-affirmative": {
    title: "Causatif en て affirmatif",
    markdown: causativeTeFormAffirmativeMarkdown,
  },
  "causative-te-form-negative": {
    title: "Causatif en て négatif",
    markdown: causativeTeFormNegativeMarkdown,
  },
  "causative-past-affirmative": {
    title: "Causatif passé affirmatif",
    markdown: causativeAffirmativeMarkdown,
  },
  "causative-past-negative": {
    title: "Causatif passé négatif",
    markdown: causativeNegativeMarkdown,
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
