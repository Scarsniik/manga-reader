import type { SelectorAssistantElement, SelectorAssistantElementNode } from "@/shared/selectorAssistant";

const MAX_ANCESTOR_DEPTH = 3;
const MAX_BRANCH_COUNT = 4;
const MIN_ATTRIBUTE_PREFIX_LENGTH = 4;
const DISCRIMINATING_ATTRIBUTES = new Set([
  "href",
  "src",
  "role",
  "itemprop",
  "itemtype",
  "name",
  "type",
  "rel",
]);

const escapeCssIdentifier = (value: string): string => (
  typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`)
);

const isStableClassName = (value: string): boolean => {
  if (!value || value.length > 48 || value.startsWith("mh-selector-assistant-")) {
    return false;
  }

  const digitCount = Array.from(value).filter((character) => /\d/.test(character)).length;
  const looksGenerated = /(?:^|[-_])[a-f0-9]{8,}(?:$|[-_])/i.test(value);
  return !looksGenerated && digitCount <= Math.max(2, Math.floor(value.length / 3));
};

const getNodeAtDepth = (element: SelectorAssistantElement, depth: number): SelectorAssistantElementNode | undefined => (
  element.nodes[element.nodes.length - 1 - depth]
);

const intersect = (values: string[][]): string[] => {
  if (!values.length) {
    return [];
  }

  return values[0].filter((value) => values.every((list) => list.includes(value)));
};

const escapeCssAttributeValue = (value: string): string => (
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
);

const getCommonPrefix = (values: string[]): string => {
  if (!values.length) return "";
  let prefix = values[0];
  for (const value of values.slice(1)) {
    while (prefix && !value.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
};

const getStableBoundaryPrefixes = (value: string): string[] => {
  const prefixes = new Set<string>();
  const boundaryPattern = /[\/_?&=:#.-]/;
  for (let index = 0; index < value.length; index += 1) {
    if (boundaryPattern.test(value[index])) {
      prefixes.add(value.slice(0, index + 1));
    }
  }
  if (boundaryPattern.test(value[value.length - 1] ?? "")) {
    prefixes.add(value);
  }
  return Array.from(prefixes)
    .filter((prefix) => (
      prefix.length >= MIN_ATTRIBUTE_PREFIX_LENGTH
      && /[a-z0-9]{2}/i.test(prefix)
      && !/^(?:https?:\/\/)?[^/]*\/$/i.test(prefix)
    ))
    .sort((left, right) => right.length - left.length);
};

const isDiscriminatingAttribute = (name: string): boolean => (
  DISCRIMINATING_ATTRIBUTES.has(name)
  || name.startsWith("data-")
  || name.startsWith("aria-")
);

const getDiscriminatingAttributeSelectors = (
  positiveNodes: SelectorAssistantElementNode[],
  negativeNodes: SelectorAssistantElementNode[],
): string[] => {
  if (positiveNodes.length < 2 || !negativeNodes.length) return [];
  const attributeNames = intersect(positiveNodes.map((node) => Object.keys(node.attributes)))
    .filter(isDiscriminatingAttribute);

  return attributeNames.flatMap((name) => {
    const positiveValues = positiveNodes.map((node) => node.attributes[name]?.trim() ?? "");
    if (positiveValues.some((value) => !value)) return [];
    const negativeValues = negativeNodes.map((node) => node.attributes[name]?.trim() ?? "");
    const commonPrefix = getCommonPrefix(positiveValues);
    const prefix = getStableBoundaryPrefixes(commonPrefix).find((candidate) => (
      positiveValues.every((value) => value.startsWith(candidate))
      && negativeValues.every((value) => !value.startsWith(candidate))
    ));
    return prefix ? [`[${name}^="${escapeCssAttributeValue(prefix)}"]`] : [];
  });
};

const buildDiscriminatingTargetSelectors = (
  positiveNodes: SelectorAssistantElementNode[],
  negativeNodes: SelectorAssistantElementNode[],
): string[] => {
  const attributeSelectors = getDiscriminatingAttributeSelectors(positiveNodes, negativeNodes);
  if (!attributeSelectors.length) return [];
  const commonTag = positiveNodes.every((node) => node.tagName === positiveNodes[0].tagName)
    ? positiveNodes[0].tagName
    : "";
  const commonClass = intersect(positiveNodes.map((node) => node.classes.filter(isStableClassName)))[0];

  return attributeSelectors.flatMap((attributeSelector) => {
    const candidates: string[] = [];
    if (commonTag) candidates.push(`${commonTag}${attributeSelector}`);
    if (commonClass) {
      const classSelector = `.${escapeCssIdentifier(commonClass)}`;
      candidates.push(`${commonTag}${classSelector}${attributeSelector}`);
    }
    return candidates;
  });
};

const getCommonAttributeSelectors = (nodes: SelectorAssistantElementNode[]): string[] => {
  const preferredNames = ["role", "itemprop", "itemtype", "name", "type", "rel"];
  const names = intersect(nodes.map((node) => Object.keys(node.attributes)))
    .filter((name) => (
      preferredNames.includes(name)
      || (nodes.length > 1 && name.startsWith("data-"))
    ));

  return names.flatMap((name) => {
    const values = nodes.map((node) => node.attributes[name]?.trim() ?? "");
    if (!values[0] || !values.every((value) => value === values[0]) || values[0].length > 80) {
      return [];
    }

    const escapedValue = values[0].replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return [`[${name}="${escapedValue}"]`];
  });
};

const buildCommonNodeSelectors = (nodes: SelectorAssistantElementNode[]): string[] => {
  if (!nodes.length) {
    return [];
  }

  const commonTag = nodes.every((node) => node.tagName === nodes[0].tagName)
    ? nodes[0].tagName
    : "";
  const commonClasses = intersect(nodes.map((node) => node.classes.filter(isStableClassName))).slice(0, 3);
  const attributeSelectors = getCommonAttributeSelectors(nodes);
  const candidates = new Set<string>();

  commonClasses.forEach((className) => {
    const classSelector = `.${escapeCssIdentifier(className)}`;
    candidates.add(classSelector);
    if (commonTag) {
      candidates.add(`${commonTag}${classSelector}`);
    }
  });

  if (commonClasses.length >= 2) {
    const combinedClasses = commonClasses.slice(0, 2)
      .map((className) => `.${escapeCssIdentifier(className)}`)
      .join("");
    candidates.add(combinedClasses);
    if (commonTag) {
      candidates.add(`${commonTag}${combinedClasses}`);
    }
  }

  attributeSelectors.forEach((attributeSelector) => {
    candidates.add(attributeSelector);
    if (commonTag) {
      candidates.add(`${commonTag}${attributeSelector}`);
    }
  });

  if (commonTag) {
    candidates.add(commonTag);
  }

  return Array.from(candidates);
};

const buildSingleElementSelector = (element: SelectorAssistantElement): string | null => {
  const node = getNodeAtDepth(element, 0);
  if (!node) {
    return null;
  }

  const stableClass = node.classes.find(isStableClassName);
  if (stableClass) {
    return `${node.tagName}.${escapeCssIdentifier(stableClass)}`;
  }

  const attributeSelector = getCommonAttributeSelectors([node])[0];
  return attributeSelector ? `${node.tagName}${attributeSelector}` : node.tagName;
};

const buildBranchCandidate = (elements: SelectorAssistantElement[]): string | null => {
  const branches = Array.from(new Set(elements.map(buildSingleElementSelector).filter(Boolean))) as string[];
  return branches.length > 1 && branches.length <= MAX_BRANCH_COUNT
    ? branches.join(", ")
    : null;
};

const getSpecificityPenalty = (selector: string): number => {
  const branchPenalty = (selector.match(/,/g)?.length ?? 0) * 30;
  const ancestorPenalty = (selector.match(/\s/g)?.length ?? 0) * 15;
  const attributePenalty = (selector.match(/\[/g)?.length ?? 0) * 5;
  return selector.length + branchPenalty + ancestorPenalty + attributePenalty;
};

export const generateSelectorCandidates = (
  positiveElements: SelectorAssistantElement[],
  negativeElements: SelectorAssistantElement[] = [],
): string[] => {
  if (!positiveElements.length) {
    return [];
  }

  const candidates = new Set<string>();
  const targetNodes = positiveElements
    .map((element) => getNodeAtDepth(element, 0))
    .filter((node): node is SelectorAssistantElementNode => Boolean(node));
  const targetSelectors = buildCommonNodeSelectors(targetNodes);
  targetSelectors.forEach((selector) => candidates.add(selector));
  const negativeTargetNodes = negativeElements
    .map((element) => getNodeAtDepth(element, 0))
    .filter((node): node is SelectorAssistantElementNode => Boolean(node));
  buildDiscriminatingTargetSelectors(targetNodes, negativeTargetNodes)
    .forEach((selector) => candidates.add(selector));

  for (let depth = 1; depth <= MAX_ANCESTOR_DEPTH; depth += 1) {
    const ancestorNodes = positiveElements.map((element) => getNodeAtDepth(element, depth));
    if (ancestorNodes.some((node) => !node)) {
      continue;
    }

    const ancestorSelectors = buildCommonNodeSelectors(ancestorNodes as SelectorAssistantElementNode[]).slice(0, 4);
    ancestorSelectors.forEach((ancestorSelector) => {
      targetSelectors.slice(0, 5).forEach((targetSelector) => {
        candidates.add(`${ancestorSelector} ${targetSelector}`);
      });
    });
  }

  const branchCandidate = buildBranchCandidate(positiveElements);
  if (branchCandidate) {
    candidates.add(branchCandidate);
  }

  return Array.from(candidates)
    .filter((selector) => !selector.includes(":nth-") && !selector.includes("#"))
    .sort((left, right) => getSpecificityPenalty(left) - getSpecificityPenalty(right))
    .slice(0, 40);
};
