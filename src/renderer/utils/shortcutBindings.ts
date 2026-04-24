export const SHORTCUT_BINDING_SLOT_COUNT = 3;

export type ShortcutActionId =
  | "readerScrollUp"
  | "readerScrollDown"
  | "readerPageNext"
  | "readerPagePrevious"
  | "readerOcrNavigateUp"
  | "readerOcrNavigateDown"
  | "readerOcrNavigateLeft"
  | "readerOcrNavigateRight"
  | "readerOcrManualSelection"
  | "readerOcrTogglePanel"
  | "readerOcrTokenNavigation";

export type ShortcutBindingsByAction = Record<ShortcutActionId, string[]>;

type ShortcutActionDefinition = {
  id: ShortcutActionId;
  label: string;
};

type ShortcutActionGroup = {
  id: string;
  label: string;
  actions: ShortcutActionDefinition[];
};

export const SHORTCUT_ACTION_GROUPS: ShortcutActionGroup[] = [
  {
    id: "reader-navigation",
    label: "Lecteur",
    actions: [
      {
        id: "readerScrollUp",
        label: "Scroll haut",
      },
      {
        id: "readerScrollDown",
        label: "Scroll bas",
      },
      {
        id: "readerPageNext",
        label: "Page suivante",
      },
      {
        id: "readerPagePrevious",
        label: "Page précédente",
      },
    ],
  },
  {
    id: "reader-ocr",
    label: "OCR du lecteur",
    actions: [
      {
        id: "readerOcrNavigateUp",
        label: "Direction haut",
      },
      {
        id: "readerOcrNavigateDown",
        label: "Direction bas",
      },
      {
        id: "readerOcrNavigateLeft",
        label: "Direction gauche",
      },
      {
        id: "readerOcrNavigateRight",
        label: "Direction droite",
      },
      {
        id: "readerOcrManualSelection",
        label: "Sélection OCR manuelle",
      },
      {
        id: "readerOcrTogglePanel",
        label: "Ouverture panneau OCR",
      },
      {
        id: "readerOcrTokenNavigation",
        label: "Navigation dans les tokens",
      },
    ],
  },
];

export const DEFAULT_SHORTCUT_BINDINGS: ShortcutBindingsByAction = {
  readerScrollUp: ["Z", "ArrowUp", "U"],
  readerScrollDown: ["S", "ArrowDown", "J"],
  readerPageNext: ["D", "ArrowRight", "P"],
  readerPagePrevious: ["Q", "ArrowLeft", "I"],
  readerOcrNavigateUp: ["O", "", ""],
  readerOcrNavigateDown: ["L", "", ""],
  readerOcrNavigateLeft: ["K", "", ""],
  readerOcrNavigateRight: ["M", "", ""],
  readerOcrManualSelection: ["*", "", ""],
  readerOcrTogglePanel: ["$", "", ""],
  readerOcrTokenNavigation: [":", "", ""],
};

const LEGACY_SHORTCUT_SETTING_BY_ACTION: Partial<Record<ShortcutActionId, string>> = {
  readerOcrNavigateUp: "readerOcrShortcutUp",
  readerOcrNavigateLeft: "readerOcrShortcutLeft",
  readerOcrNavigateDown: "readerOcrShortcutDown",
  readerOcrNavigateRight: "readerOcrShortcutRight",
};

const MODIFIER_KEY_LABELS = new Map<string, string>([
  ["control", "Ctrl"],
  ["ctrl", "Ctrl"],
  ["alt", "Alt"],
  ["shift", "Shift"],
  ["meta", "Meta"],
  ["command", "Meta"],
  ["cmd", "Meta"],
]);

const KEY_LABELS = new Map<string, string>([
  [" ", "Space"],
  ["arrowup", "ArrowUp"],
  ["arrowright", "ArrowRight"],
  ["arrowdown", "ArrowDown"],
  ["arrowleft", "ArrowLeft"],
  ["escape", "Escape"],
  ["esc", "Escape"],
  ["delete", "Delete"],
  ["backspace", "Backspace"],
  ["enter", "Enter"],
  ["tab", "Tab"],
  ["+", "Plus"],
]);

const MODIFIER_DISPLAY_ORDER = ["Ctrl", "Alt", "Shift", "Meta"];

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);

const normalizeKeyLabel = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const lowerValue = trimmed.toLowerCase();
  const mappedValue = KEY_LABELS.get(lowerValue) ?? KEY_LABELS.get(trimmed);
  if (mappedValue) {
    return mappedValue;
  }

  if (trimmed.length === 1) {
    return trimmed.toUpperCase();
  }

  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
};

export const normalizeShortcutBinding = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const parts = trimmed.split("+").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    return normalizeKeyLabel(trimmed);
  }

  const modifiers = new Set<string>();
  const keyParts: string[] = [];

  parts.forEach((part) => {
    const modifier = MODIFIER_KEY_LABELS.get(part.toLowerCase());
    if (modifier) {
      modifiers.add(modifier);
      return;
    }

    keyParts.push(part);
  });

  const keyLabel = normalizeKeyLabel(keyParts[keyParts.length - 1] ?? "");
  if (!keyLabel) {
    return "";
  }

  return [
    ...MODIFIER_DISPLAY_ORDER.filter((modifier) => modifiers.has(modifier)),
    keyLabel,
  ].join("+");
};

export const formatShortcutBinding = (binding: string): string => {
  const normalizedBinding = normalizeShortcutBinding(binding);
  return normalizedBinding ? normalizedBinding.replace(/\+/g, " + ") : "Vide";
};

const normalizeShortcutSlots = (value: unknown, fallbackSlots: string[]): string[] => {
  const sourceSlots = Array.isArray(value)
    ? value
    : (typeof value === "string" ? [value] : fallbackSlots);

  const normalizedSlots = sourceSlots
    .slice(0, SHORTCUT_BINDING_SLOT_COUNT)
    .map((slot) => normalizeShortcutBinding(slot));

  while (normalizedSlots.length < SHORTCUT_BINDING_SLOT_COUNT) {
    normalizedSlots.push("");
  }

  return normalizedSlots;
};

export const normalizeShortcutSettings = (settings: unknown): ShortcutBindingsByAction => {
  const settingsRecord = isRecord(settings) ? settings : {};
  const shortcutRecord = isRecord(settingsRecord.shortcuts) ? settingsRecord.shortcuts : {};

  return SHORTCUT_ACTION_GROUPS.flatMap((group) => group.actions).reduce((result, action) => {
    const legacySettingKey = LEGACY_SHORTCUT_SETTING_BY_ACTION[action.id];
    const rawSlots = shortcutRecord[action.id] ?? (legacySettingKey ? settingsRecord[legacySettingKey] : undefined);
    result[action.id] = normalizeShortcutSlots(rawSlots, DEFAULT_SHORTCUT_BINDINGS[action.id]);
    return result;
  }, {} as ShortcutBindingsByAction);
};

export const getShortcutBindingFromKeyboardEvent = (event: KeyboardEvent): string | null => {
  if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) {
    return null;
  }

  const keyLabel = normalizeKeyLabel(event.key);
  if (!keyLabel) {
    return null;
  }

  const shouldIncludeShift = event.shiftKey && (
    event.key.length !== 1 || /^[a-z0-9]$/i.test(event.key)
  );

  return [
    event.ctrlKey ? "Ctrl" : "",
    event.altKey ? "Alt" : "",
    shouldIncludeShift ? "Shift" : "",
    event.metaKey ? "Meta" : "",
    keyLabel,
  ].filter(Boolean).join("+");
};

export const doesKeyboardEventMatchShortcutBinding = (
  event: KeyboardEvent,
  binding: string,
): boolean => {
  const normalizedBinding = normalizeShortcutBinding(binding);
  if (!normalizedBinding) {
    return false;
  }

  return getShortcutBindingFromKeyboardEvent(event) === normalizedBinding;
};

export const doesKeyboardEventMatchShortcutAction = (
  event: KeyboardEvent,
  shortcuts: ShortcutBindingsByAction,
  actionId: ShortcutActionId,
): boolean => (
  shortcuts[actionId].some((binding) => doesKeyboardEventMatchShortcutBinding(event, binding))
);

export const setShortcutBindingSlot = (
  shortcuts: ShortcutBindingsByAction,
  actionId: ShortcutActionId,
  slotIndex: number,
  binding: string,
): ShortcutBindingsByAction => {
  const slots = [...shortcuts[actionId]];
  slots[slotIndex] = normalizeShortcutBinding(binding);

  return {
    ...shortcuts,
    [actionId]: normalizeShortcutSlots(slots, DEFAULT_SHORTCUT_BINDINGS[actionId]),
  };
};
