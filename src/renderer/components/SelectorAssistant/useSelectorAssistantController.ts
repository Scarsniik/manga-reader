import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateSelectorCandidates } from "@/renderer/components/SelectorAssistant/selectorGenerator";
import buildConfirmActionModal from "@/renderer/components/Modal/modales/ConfirmActionModal";
import {
  getSelectorAssistantApi,
} from "@/renderer/components/SelectorAssistant/selectorAssistantApi";
import useSelectorAssistantNavigation from "@/renderer/components/SelectorAssistant/useSelectorAssistantNavigation";
import { useModal } from "@/renderer/hooks/useModal";
import type { SelectorAssistantFieldDraft, SelectorAssistantSample } from "@/renderer/components/SelectorAssistant/types";
import type {
  SelectorAssistantElement,
  SelectorAssistantEvaluationResult,
  SelectorAssistantPreviewMode,
  SelectorAssistantSelectionMode,
  SelectorAssistantSessionSnapshot,
} from "@/shared/selectorAssistant";

type PendingSample = {
  mode: SelectorAssistantPreviewMode;
  role: "positive" | "negative";
  element: SelectorAssistantElement;
};

const parseCurrentSelector = (value: string, isValueField: boolean): { selector: string; attribute?: string } => {
  const atIndex = value.lastIndexOf("@");
  return isValueField && atIndex > 0 && atIndex < value.length - 1
    ? { selector: value.slice(0, atIndex), attribute: value.slice(atIndex + 1) }
    : { selector: value };
};

const createDrafts = (snapshot: SelectorAssistantSessionSnapshot): Record<string, SelectorAssistantFieldDraft> => (
  Object.fromEntries(snapshot.fields.map((field) => {
    const current = parseCurrentSelector(field.currentSelector ?? "", field.kind === "value");
    return [field.name, {
      selector: current.selector,
      attribute: current.attribute,
      samples: [],
      accepted: false,
      results: {},
    } satisfies SelectorAssistantFieldDraft];
  }))
);

const normalizeValue = (value: string): string => value.replace(/\s+/g, " ").trim();
const createSampleId = (): string => `sample-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
export default function useSelectorAssistantController() {
  const api = useMemo(getSelectorAssistantApi, []);
  const { openModal } = useModal();
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [snapshot, setSnapshot] = useState<SelectorAssistantSessionSnapshot | null>(null);
  const [drafts, setDrafts] = useState<Record<string, SelectorAssistantFieldDraft>>({});
  const [activeFieldName, setActiveFieldName] = useState("");
  const [activeMode, setActiveMode] = useState<SelectorAssistantPreviewMode>("runtime");
  const [selectionMode, setSelectionMode] = useState<SelectorAssistantSelectionMode>("navigate");
  const [pending, setPending] = useState<PendingSample | null>(null);
  const [expectedValue, setExpectedValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pageRevision, setPageRevision] = useState(0);

  const initializeSnapshot = useCallback((nextSnapshot: SelectorAssistantSessionSnapshot) => {
    setSnapshot(nextSnapshot);
    setActiveMode(nextSnapshot.activeMode);
    setDrafts((previous) => Object.keys(previous).length ? previous : createDrafts(nextSnapshot));
    setActiveFieldName((previous) => previous || nextSnapshot.fields[0]?.name || "");
  }, []);

  useEffect(() => {
    let disposed = false;
    void api.getSelectorAssistantSession().then((session) => {
      if (!disposed && session) initializeSnapshot(session);
    });
    const unsubscribeSession = api.onSelectorAssistantSessionUpdated(initializeSnapshot);
    const unsubscribePage = api.onSelectorAssistantPageEvent((event) => {
      if (event.type === "page-loaded") {
        setPageRevision((previous) => previous + 1);
      } else if (event.element && event.selectionRole) {
        setPending({ mode: event.mode, role: event.selectionRole, element: event.element });
        setExpectedValue("");
      }
    });
    return () => {
      disposed = true;
      unsubscribeSession?.();
      unsubscribePage?.();
    };
  }, [api, initializeSnapshot]);

  const navigation = useSelectorAssistantNavigation(api, snapshot);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    const updateBounds = () => {
      const bounds = preview.getBoundingClientRect();
      void api.setSelectorAssistantBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
    };
    const observer = new ResizeObserver(updateBounds);
    observer.observe(preview);
    window.addEventListener("resize", updateBounds);
    updateBounds();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateBounds);
    };
  }, [api, snapshot?.id]);

  const activeField = snapshot?.fields.find((field) => field.name === activeFieldName);
  const activeDraft = activeFieldName ? drafts[activeFieldName] : undefined;
  const scopeSelector = activeField?.scopeFieldName
    ? drafts[activeField.scopeFieldName]?.selector
      || snapshot?.fields.find((field) => field.name === activeField.scopeFieldName)?.currentSelector
      || ""
    : "";

  useEffect(() => {
    if (!activeField) return;
    setPending(null);
    setExpectedValue("");
    void api.sendSelectorAssistantPageCommand(activeMode, {
      type: "set-selection-mode",
      mode: selectionMode,
      scopeSelector,
    });
  }, [activeField, activeMode, api, pageRevision, scopeSelector, selectionMode]);

  const changePreviewMode = useCallback((mode: SelectorAssistantPreviewMode) => {
    setActiveMode(mode);
    setPending(null);
    void api.setSelectorAssistantMode(mode);
  }, [api]);

  const confirmPending = useCallback(() => {
    if (!pending || !activeField || !activeDraft) return;
    let attribute: string | undefined;
    let rejectedReason: string | undefined;
    if (pending.role === "positive" && activeField.kind === "value") {
      const normalizedExpected = normalizeValue(expectedValue);
      const candidates = pending.element.valueCandidates.filter((candidate) => normalizeValue(candidate.value) === normalizedExpected);
      const preferred = candidates.find((candidate) => (
        activeField.valueMode === "url" && ["href", "src"].includes(candidate.attribute ?? "")
      )) ?? candidates[0];
      if (!preferred) {
        rejectedReason = "Cette valeur n'existe ni dans le texte ni dans les attributs de l'element.";
      } else {
        attribute = preferred.attribute;
        if (activeDraft.attribute !== undefined && activeDraft.attribute !== attribute) {
          rejectedReason = `La source de valeur differe des autres exemples (${activeDraft.attribute || "texte"}).`;
        }
      }
    }
    const sample: SelectorAssistantSample = {
      id: createSampleId(),
      role: pending.role,
      mode: pending.mode,
      element: pending.element,
      expectedValue: pending.role === "positive" && activeField.kind === "value" ? normalizeValue(expectedValue) : undefined,
      attribute,
      rejectedReason,
    };
    setDrafts((previous) => ({
      ...previous,
      [activeField.name]: {
        ...previous[activeField.name],
        attribute: previous[activeField.name].attribute ?? (rejectedReason ? undefined : attribute),
        samples: [...previous[activeField.name].samples, sample],
        accepted: false,
        results: {},
      },
    }));
    setPending(null);
    setExpectedValue("");
    setMessage(rejectedReason ? "L'exemple a ete conserve mais sa valeur est refusee." : null);
  }, [activeDraft, activeField, expectedValue, pending]);

  const removeSample = useCallback((sampleId: string) => {
    if (!activeField) return;
    setDrafts((previous) => {
      const samples = previous[activeField.name].samples.filter((sample) => sample.id !== sampleId);
      const attribute = samples.find((sample) => sample.role === "positive" && !sample.rejectedReason)?.attribute;
      return {
        ...previous,
        [activeField.name]: { ...previous[activeField.name], samples, attribute, accepted: false, results: {} },
      };
    });
  }, [activeField]);

  const evaluate = useCallback(async (
    selector: string,
    mode: SelectorAssistantPreviewMode,
    highlight: boolean,
  ): Promise<SelectorAssistantEvaluationResult> => {
    if (!activeField || !activeDraft) throw new Error("Aucun selecteur actif.");
    const samples = activeDraft.samples.filter((sample) => sample.mode === mode);
    return api.evaluateSelectorAssistant({
      mode,
      selector,
      scopeSelector: scopeSelector || undefined,
      valueMode: activeField.valueMode ?? "text",
      valueRequired: activeField.kind === "value",
      attribute: activeDraft.attribute,
      positiveSamples: samples.filter((sample) => sample.role === "positive")
        .map((sample) => ({ path: sample.element.path, expectedValue: sample.expectedValue })),
      negativePaths: samples.filter((sample) => sample.role === "negative").map((sample) => sample.element.path),
      highlight,
    });
  }, [activeDraft, activeField, api, scopeSelector]);

  const generate = useCallback(async () => {
    if (!activeField || !activeDraft) return;
    const positives = activeDraft.samples.filter((sample) => sample.role === "positive");
    if (!positives.length) {
      setMessage("Ajoute au moins un exemple positif avant de generer le selecteur.");
      return;
    }
    const negatives = activeDraft.samples.filter((sample) => sample.role === "negative");
    const candidates = generateSelectorCandidates(
      positives.map((sample) => sample.element),
      negatives.map((sample) => sample.element),
    );
    if (!candidates.length) {
      setMessage("Aucun selecteur suffisamment general n'a pu etre construit.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const modes = (["runtime", "interactive"] as SelectorAssistantPreviewMode[])
        .filter((mode) => activeDraft.samples.some((sample) => sample.mode === mode));
      const evaluations = await Promise.all(candidates.map(async (candidate) => {
        const results = await Promise.all(modes.map((mode) => evaluate(candidate, mode, false)));
        const covered = results.reduce((total, result) => total + result.coveredPositiveCount, 0);
        const positiveCount = results.reduce((total, result) => total + result.positiveCount, 0);
        const negatives = results.reduce((total, result) => total + result.negativeMatchCount, 0);
        const matches = results.reduce((total, result) => total + result.matchedCount, 0);
        return {
          candidate,
          exact: results.every((result) => result.ok) && covered === positiveCount && negatives === 0,
          fallbackScore: (covered * 1000) - (negatives * 1500) - Math.max(0, matches - covered),
          matches,
        };
      }));
      const robustness = (item: typeof evaluations[number]): number => {
        const selector = item.candidate;
        return selector.length
          + (/^[a-z][a-z0-9-]*$/i.test(selector) ? 45 : 0)
          + ((selector.match(/,/g)?.length ?? 0) * 18)
          + ((selector.match(/\s/g)?.length ?? 0) * 5)
          + ((selector.match(/\[/g)?.length ?? 0) * 8)
          + (20 / Math.max(1, item.matches));
      };
      const best = evaluations.filter((item) => item.exact).sort((a, b) => robustness(a) - robustness(b))[0]
        ?? evaluations.sort((a, b) => b.fallbackScore - a.fallbackScore || a.candidate.length - b.candidate.length)[0];
      const warning = !best.exact
        ? "Le meilleur selecteur ne couvre pas encore parfaitement les exemples. Ajoute des positifs ou des negatifs."
        : positives.length < 2
          ? "Un seul exemple donne un selecteur moins fiable. Ajoute un second positif pour eviter un resultat trop specifique."
          : undefined;
      setDrafts((previous) => ({
        ...previous,
        [activeField.name]: {
          ...previous[activeField.name], selector: best.candidate, generationWarning: warning, accepted: false, results: {},
        },
      }));
      setMessage(warning ?? "Selecteur genere. Lance le test pour verifier les valeurs.");
    } finally {
      setBusy(false);
    }
  }, [activeDraft, activeField, evaluate]);

  const test = useCallback(async () => {
    if (!activeField || !activeDraft?.selector.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const [runtime, interactive] = await Promise.all([
        evaluate(activeDraft.selector, "runtime", true),
        evaluate(activeDraft.selector, "interactive", true),
      ]);
      setDrafts((previous) => ({
        ...previous,
        [activeField.name]: { ...previous[activeField.name], results: { runtime, interactive }, accepted: false },
      }));
    } finally {
      setBusy(false);
    }
  }, [activeDraft, activeField, evaluate]);

  const canApply = Boolean(activeField && activeDraft?.selector.trim())
    && Object.keys(activeDraft?.results ?? {}).length === 2
    && Object.values(activeDraft?.results ?? {}).every((result) => (
      result?.ok && result.matchedCount > 0 && result.coveredPositiveCount === result.positiveCount
      && result.negativeMatchCount === 0 && result.rejectedElements.length === 0
    ));

  const commitApply = useCallback(async () => {
    if (!snapshot || !activeField || !activeDraft?.selector.trim()) return;
    const selector = activeField.kind === "value" && activeDraft.attribute
      ? `${activeDraft.selector}@${activeDraft.attribute}`
      : activeDraft.selector;
    const applied = await api.applySelectorAssistantValue({
      formSessionId: snapshot.formSessionId,
      fieldName: activeField.name,
      selector,
    });
    if (applied) {
      setDrafts((previous) => ({
        ...previous,
        [activeField.name]: { ...previous[activeField.name], accepted: true },
      }));
      setMessage("Selecteur envoye dans le formulaire du module.");
    }
  }, [activeDraft, activeField, api, snapshot]);

  const apply = useCallback(() => {
    if (!activeDraft?.selector.trim()) return;
    if (canApply) {
      void commitApply();
      return;
    }
    openModal(buildConfirmActionModal({
      title: "Valider malgré les erreurs ?",
      message: "Ce sélecteur ne satisfait pas toutes les vérifications de l'assistant.",
      details: "Il peut manquer des exemples positifs, inclure des éléments négatifs ou retourner des valeurs refusées.",
      cancelLabel: "Continuer les réglages",
      confirmLabel: "Valider quand même",
      confirmVariant: "danger",
      onConfirm: () => void commitApply(),
    }));
  }, [activeDraft?.selector, canApply, commitApply, openModal]);

  const updateSelector = useCallback((selector: string) => {
    if (!activeField) return;
    setDrafts((previous) => ({
      ...previous,
      [activeField.name]: { ...previous[activeField.name], selector, accepted: false, results: {} },
    }));
  }, [activeField]);

  const focusRejected = useCallback((mode: SelectorAssistantPreviewMode, elementPath: string) => {
    changePreviewMode(mode);
    void api.sendSelectorAssistantPageCommand(mode, { type: "focus-element", path: elementPath });
  }, [api, changePreviewMode]);

  return {
    snapshot, drafts, activeField, activeDraft, activeFieldName, setActiveFieldName,
    activeMode, changePreviewMode, selectionMode, setSelectionMode,
    pending, expectedValue, setExpectedValue, busy, message, previewRef, scopeSelector, navigation,
    confirmPending, removeSample, generate, test, canApply, apply, updateSelector, focusRejected,
    runtimeError: snapshot?.runtimeDocument && !snapshot.runtimeDocument.ok
      ? snapshot.runtimeDocument.error || "Le HTML du scraper n'a pas pu etre charge."
      : null,
  };
}
