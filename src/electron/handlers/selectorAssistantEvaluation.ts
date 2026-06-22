import type { WebContentsView } from "electron";
import type {
  SelectorAssistantEvaluationRequest,
  SelectorAssistantEvaluationResult,
  SelectorAssistantPageCommand,
} from "../../shared/selectorAssistant";

const buildEvaluationScript = (request: SelectorAssistantEvaluationRequest): string => {
  const payload = JSON.stringify(request).replace(/</g, "\\u003c");
  return `(() => {
    const request = ${payload};
    const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
    const pathFor = (element) => {
      if (element.id && document.querySelectorAll("#" + CSS.escape(element.id)).length === 1) {
        return "#" + CSS.escape(element.id);
      }
      const segments = [];
      let current = element;
      while (current && current !== document.documentElement) {
        const tag = current.tagName.toLowerCase();
        const siblings = current.parentElement
          ? Array.from(current.parentElement.children).filter((item) => item.tagName === current.tagName)
          : [];
        const suffix = siblings.length > 1 ? ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")" : "";
        segments.unshift(tag + suffix);
        current = current.parentElement;
      }
      return "html > " + segments.join(" > ");
    };
    const labelFor = (element) => {
      const text = normalize(element.innerText || element.textContent).slice(0, 80);
      return "<" + element.tagName.toLowerCase() + ">" + (text ? " — " + text : "");
    };
    const valueFor = (element) => {
      if (request.attribute) return normalize(element.getAttribute(request.attribute));
      if (request.valueMode === "url" && element.tagName === "A") return normalize(element.getAttribute("href"));
      if (element.tagName === "IMG") return normalize(element.getAttribute("src"));
      return normalize(element.textContent);
    };
    let matches;
    try {
      const roots = request.scopeSelector
        ? Array.from(document.querySelectorAll(request.scopeSelector))
        : [document];
      matches = Array.from(new Set(roots.flatMap((root) => Array.from(root.querySelectorAll(request.selector)))));
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Selecteur CSS invalide.", matchedCount: 0,
        positiveCount: request.positiveSamples.length, coveredPositiveCount: 0, negativeMatchCount: 0,
        values: [], elements: [], rejectedElements: [] };
    }
    const matchSet = new Set(matches);
    const expectedByElement = new Map();
    const positiveElements = request.positiveSamples.map((sample) => {
      const element = document.querySelector(sample.path);
      if (element && sample.expectedValue) expectedByElement.set(element, normalize(sample.expectedValue));
      return element;
    }).filter(Boolean);
    const negativeElements = request.negativePaths.map((path) => document.querySelector(path)).filter(Boolean);
    const negativeSet = new Set(negativeElements);
    const elements = matches.map((element) => {
      const value = valueFor(element);
      let rejectedReason;
      if (negativeSet.has(element)) rejectedReason = "Cet element est marque comme negatif.";
      else if (request.valueRequired && !value) rejectedReason = "La valeur extraite est vide.";
      else if (expectedByElement.has(element) && expectedByElement.get(element) !== value) {
        rejectedReason = "La valeur extraite ne correspond pas a la valeur attendue.";
      }
      return { path: pathFor(element), label: labelFor(element), value, rejectedReason };
    });
    positiveElements.forEach((element) => {
      if (!matchSet.has(element)) {
        elements.push({ path: pathFor(element), label: labelFor(element), value: valueFor(element),
          rejectedReason: "Cet echantillon positif n'est pas couvert." });
      }
    });
    const rejectedElements = elements.filter((element) => element.rejectedReason);
    return {
      ok: true,
      matchedCount: matches.length,
      positiveCount: positiveElements.length,
      coveredPositiveCount: positiveElements.filter((element) => matchSet.has(element)).length,
      negativeMatchCount: negativeElements.filter((element) => matchSet.has(element)).length,
      values: matches.map(valueFor).filter(Boolean),
      elements,
      rejectedElements,
    };
  })()`;
};

const createErrorResult = (
  request: SelectorAssistantEvaluationRequest,
  error: unknown,
): SelectorAssistantEvaluationResult => ({
  ok: false,
  error: error instanceof Error ? error.message : "Impossible de tester le selecteur.",
  matchedCount: 0,
  positiveCount: request.positiveSamples.length,
  coveredPositiveCount: 0,
  negativeMatchCount: 0,
  values: [],
  elements: [],
  rejectedElements: [],
});

export const evaluateSelectorInView = async (
  view: WebContentsView,
  request: SelectorAssistantEvaluationRequest,
): Promise<SelectorAssistantEvaluationResult> => {
  try {
    const result = await view.webContents.executeJavaScript(
      buildEvaluationScript(request),
      true,
    ) as SelectorAssistantEvaluationResult;
    if (request.highlight && result.ok) {
      view.webContents.send("selector-assistant-page-command", {
        type: "highlight-selector",
        selector: request.selector,
        rejectedPaths: result.rejectedElements.map((element) => element.path),
      } satisfies SelectorAssistantPageCommand);
    }
    return result;
  } catch (error) {
    return createErrorResult(request, error);
  }
};
