import { ipcRenderer } from "electron";
import type {
  SelectorAssistantElement,
  SelectorAssistantElementNode,
  SelectorAssistantPageCommand,
  SelectorAssistantSelectionMode,
  SelectorAssistantValueCandidate,
} from "../shared/selectorAssistant";

const HELPER_CLASS_PREFIX = "mh-selector-assistant-";
const CANDIDATE_CLASS = `${HELPER_CLASS_PREFIX}candidate`;
const MATCH_CLASS = `${HELPER_CLASS_PREFIX}match`;
const REJECTED_CLASS = `${HELPER_CLASS_PREFIX}rejected`;

let selectionMode: SelectorAssistantSelectionMode = "navigate";
let scopeSelector = "";
let activePath: Element[] = [];
let activePathIndex = -1;
let activeDeepestElement: Element | null = null;

const normalizeText = (value: string | null | undefined): string => (
  String(value ?? "").replace(/\s+/g, " ").trim()
);

const ensureHighlightStyle = (): void => {
  if (document.getElementById(`${HELPER_CLASS_PREFIX}styles`)) {
    return;
  }

  const style = document.createElement("style");
  style.id = `${HELPER_CLASS_PREFIX}styles`;
  style.textContent = `
    .${CANDIDATE_CLASS} { outline: 3px solid #4da3ff !important; outline-offset: 2px !important; }
    .${MATCH_CLASS} { outline: 3px solid #43c478 !important; outline-offset: 2px !important; }
    .${REJECTED_CLASS} { outline: 3px solid #ef5b5b !important; outline-offset: 2px !important; }
  `;
  document.documentElement.appendChild(style);
};

const clearClass = (className: string): void => {
  document.querySelectorAll(`.${className}`).forEach((element) => element.classList.remove(className));
};

const clearHighlights = (): void => {
  clearClass(CANDIDATE_CLASS);
  clearClass(MATCH_CLASS);
  clearClass(REJECTED_CLASS);
};

const escapeSelector = (value: string): string => (
  typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`)
);

const getElementPath = (element: Element): string => {
  const id = element.getAttribute("id")?.trim();
  if (id && document.querySelectorAll(`#${escapeSelector(id)}`).length === 1) {
    return `#${escapeSelector(id)}`;
  }

  const segments: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.documentElement) {
    const tagName = current.tagName.toLowerCase();
    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter((sibling) => sibling.tagName === current?.tagName)
      : [];
    const suffix = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : "";
    segments.unshift(`${tagName}${suffix}`);
    current = current.parentElement;
  }

  return `html > ${segments.join(" > ")}`;
};

const getAttributes = (element: Element): Record<string, string> => (
  Object.fromEntries(
    Array.from(element.attributes)
      .filter((attribute) => !attribute.name.startsWith("on"))
      .map((attribute) => [
        attribute.name,
        attribute.name === "class"
          ? attribute.value
            .split(/\s+/)
            .filter((className) => className && !className.startsWith(HELPER_CLASS_PREFIX))
            .join(" ")
          : attribute.value,
      ]),
  )
);

const getElementNode = (element: Element): SelectorAssistantElementNode => ({
  tagName: element.tagName.toLowerCase(),
  id: element.id || undefined,
  classes: Array.from(element.classList).filter((className) => !className.startsWith(HELPER_CLASS_PREFIX)),
  attributes: getAttributes(element),
});

const getValueCandidates = (element: Element): SelectorAssistantValueCandidate[] => {
  const candidates: SelectorAssistantValueCandidate[] = [];
  const displayedText = normalizeText((element as HTMLElement).innerText);
  const textContent = normalizeText(element.textContent);

  if (displayedText) {
    candidates.push({
      key: "displayed-text",
      label: "Texte affiche",
      value: displayedText,
    });
  }

  if (textContent && textContent !== displayedText) {
    candidates.push({
      key: "text-content",
      label: "Contenu texte complet",
      value: textContent,
    });
  }

  Array.from(element.attributes)
    .filter((attribute) => (
      !attribute.name.startsWith("on")
    ))
    .forEach((attribute) => {
      const value = normalizeText(
        attribute.name === "class"
          ? attribute.value
            .split(/\s+/)
            .filter((className) => className && !className.startsWith(HELPER_CLASS_PREFIX))
            .join(" ")
          : attribute.value,
      );
      if (!value) {
        return;
      }

      candidates.push({
        key: `attribute:${attribute.name}`,
        label: `Attribut ${attribute.name}`,
        value,
        attribute: attribute.name,
      });
    });

  return candidates;
};

const describeElement = (element: Element): SelectorAssistantElement => {
  const ancestry: Element[] = [];
  let current: Element | null = element;
  while (current && current !== document.documentElement) {
    ancestry.unshift(current);
    current = current.parentElement;
  }

  const text = normalizeText((element as HTMLElement).innerText || element.textContent);
  const labelText = text ? ` — ${text.slice(0, 70)}` : "";

  return {
    path: getElementPath(element),
    tagName: element.tagName.toLowerCase(),
    label: `<${element.tagName.toLowerCase()}>${labelText}`,
    text,
    html: element.outerHTML.slice(0, 1000),
    nodes: ancestry.map(getElementNode),
    valueCandidates: getValueCandidates(element),
  };
};

const findScopeRoot = (target: Element): Element | null => {
  if (!scopeSelector.trim()) {
    return null;
  }

  try {
    return target.closest(scopeSelector);
  } catch {
    return null;
  }
};

const buildSelectablePath = (target: Element): Element[] => {
  const reversed: Element[] = [];
  const scopeRoot = findScopeRoot(target);
  let current: Element | null = target;

  while (current && current !== document.body && current !== document.documentElement) {
    if (current === scopeRoot) {
      break;
    }
    reversed.push(current);
    current = current.parentElement;
  }

  return reversed.reverse();
};

const getInitialPathIndex = (path: Element[]): number => Math.max(0, path.length - 3);

const selectFromPointer = (event: MouseEvent, direction: "deeper" | "parent"): void => {
  const deepestElement = document.elementsFromPoint(event.clientX, event.clientY)[0] as Element | undefined;
  if (!deepestElement) {
    return;
  }

  const isSameTarget = deepestElement === activeDeepestElement && activePath.length > 0;
  if (!isSameTarget) {
    activeDeepestElement = deepestElement;
    activePath = buildSelectablePath(deepestElement);
    activePathIndex = getInitialPathIndex(activePath);
  } else if (direction === "deeper") {
    if (activePathIndex >= activePath.length - 1) {
      return;
    }
    activePathIndex += 1;
  } else {
    if (activePathIndex <= 0) {
      return;
    }
    activePathIndex -= 1;
  }

  const selectedElement = activePath[activePathIndex];
  if (!selectedElement) {
    return;
  }

  ensureHighlightStyle();
  clearClass(CANDIDATE_CLASS);
  selectedElement.classList.add(CANDIDATE_CLASS);
  selectedElement.scrollIntoView({ block: "nearest", inline: "nearest" });

  ipcRenderer.send("selector-assistant-page-event", {
    type: "element-selected",
    selectionRole: selectionMode === "negative" ? "negative" : "positive",
    element: describeElement(selectedElement),
  });
};

const suppressSiteInteraction = (event: Event): void => {
  if (selectionMode === "navigate") {
    return;
  }

  if (event.cancelable) {
    event.preventDefault();
  }
  event.stopImmediatePropagation();
};

[
  "pointerdown",
  "pointerup",
  "pointerover",
  "mousedown",
  "mouseup",
  "mouseover",
  "auxclick",
  "dblclick",
  "touchstart",
  "touchend",
  "dragstart",
  "drop",
  "submit",
  "keydown",
  "keyup",
].forEach((eventName) => {
  window.addEventListener(eventName, suppressSiteInteraction, {
    capture: true,
    passive: false,
  });
});

window.addEventListener("click", (event) => {
  if (selectionMode === "navigate") {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  selectFromPointer(event, "deeper");
}, true);

window.addEventListener("contextmenu", (event) => {
  if (selectionMode === "navigate") {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  selectFromPointer(event, "parent");
}, true);

ipcRenderer.on("selector-assistant-page-command", (_event, command: SelectorAssistantPageCommand) => {
  if (command.type === "set-selection-mode") {
    selectionMode = command.mode;
    scopeSelector = command.scopeSelector ?? "";
    activePath = [];
    activePathIndex = -1;
    activeDeepestElement = null;
    clearClass(CANDIDATE_CLASS);
    return;
  }

  if (command.type === "clear-highlights") {
    clearHighlights();
    return;
  }

  if (command.type === "focus-element") {
    try {
      const element = document.querySelector(command.path);
      if (element) {
        ensureHighlightStyle();
        element.classList.add(REJECTED_CLASS);
        element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      }
    } catch {
      // The toolbox already reports paths that disappeared after navigation.
    }
    return;
  }

  ensureHighlightStyle();
  clearHighlights();
  try {
    document.querySelectorAll(command.selector).forEach((element) => element.classList.add(MATCH_CLASS));
    (command.rejectedPaths ?? []).forEach((path) => {
      document.querySelector(path)?.classList.add(REJECTED_CLASS);
    });
  } catch {
    // Invalid selectors are reported by the trusted toolbox evaluation.
  }
});

window.addEventListener("DOMContentLoaded", () => {
  ensureHighlightStyle();
  ipcRenderer.send("selector-assistant-page-event", {
    type: "page-loaded",
    url: window.location.href,
  });
});
