import React from "react";
import useParams from "@/renderer/hooks/useParams";
import {
  doesKeyboardEventMatchShortcutAction,
  type ShortcutActionId,
  type ShortcutBindingsByAction,
  type ShortcutPressType,
} from "@/renderer/utils/shortcutBindings";
import { normalizeShortcutLongPressDelay } from "@/shared/shortcutSettings";

type Props = {
  bookmarking: boolean;
  closeModal: () => void;
  goNext: () => void;
  goPrevious: () => void;
  handleBookmark: () => Promise<void>;
  isComplete: boolean;
  onClosePreview: () => void;
  previewOpen: boolean;
  scrollThumbnails: (direction: -1 | 1) => void;
  shortcuts: ShortcutBindingsByAction;
  thumbnailsVisible: boolean;
};

type PendingLongPress = {
  fired: boolean;
  longAction: () => void | Promise<void>;
  shortAction: (() => void | Promise<void>) | null;
  timerId: number;
};

const consumeKeyboardEvent = (event: KeyboardEvent) => {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
};

export default function useQuickReviewShortcuts(props: Props) {
  const { params } = useParams();
  const latestRef = React.useRef({
    ...props,
    longPressDelay: normalizeShortcutLongPressDelay(params?.shortcutLongPressDelayMs),
  });
  latestRef.current = {
    ...props,
    longPressDelay: normalizeShortcutLongPressDelay(params?.shortcutLongPressDelayMs),
  };

  React.useEffect(() => {
    const pendingPresses = new Map<string, PendingLongPress>();
    const getKeyId = (event: KeyboardEvent) => event.code || event.key;
    const clearPendingPresses = () => {
      pendingPresses.forEach((pending) => window.clearTimeout(pending.timerId));
      pendingPresses.clear();
    };
    const getAction = (
      event: KeyboardEvent,
      pressType: ShortcutPressType,
    ): (() => void | Promise<void>) | null => {
      const current = latestRef.current;
      const matches = (actionId: ShortcutActionId) => (
        doesKeyboardEventMatchShortcutAction(event, current.shortcuts, actionId, pressType)
      );

      if (current.isComplete) {
        return matches("quickReviewPrevious") ? () => current.goPrevious() : null;
      }
      if (current.thumbnailsVisible && matches("quickReviewThumbnailsPrevious")) {
        return () => current.scrollThumbnails(-1);
      }
      if (current.thumbnailsVisible && matches("quickReviewThumbnailsNext")) {
        return () => current.scrollThumbnails(1);
      }
      if (matches("quickReviewBookmark")) return () => current.handleBookmark();
      if (matches("quickReviewPrevious")) return () => current.goPrevious();
      if (matches("quickReviewNext")) return () => current.goNext();
      return null;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const current = latestRef.current;
      if (event.key === "Escape") {
        consumeKeyboardEvent(event);
        clearPendingPresses();
        if (current.previewOpen) current.onClosePreview();
        else current.closeModal();
        return;
      }
      if (current.bookmarking) return;

      const keyId = getKeyId(event);
      if (event.repeat) {
        const matchesReviewAction = pendingPresses.has(keyId)
          || Boolean(getAction(event, "long"))
          || Boolean(getAction(event, "short"));
        if (matchesReviewAction) consumeKeyboardEvent(event);
        return;
      }

      const longAction = getAction(event, "long");
      const shortAction = getAction(event, "short");
      if (longAction) {
        consumeKeyboardEvent(event);
        const pending: PendingLongPress = {
          fired: false,
          longAction,
          shortAction,
          timerId: 0,
        };
        pending.timerId = window.setTimeout(() => {
          pending.fired = true;
          void pending.longAction();
        }, current.longPressDelay);
        pendingPresses.set(keyId, pending);
        return;
      }

      if (shortAction) {
        consumeKeyboardEvent(event);
        void shortAction();
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      const keyId = getKeyId(event);
      const pending = pendingPresses.get(keyId);
      if (!pending) return;

      consumeKeyboardEvent(event);
      window.clearTimeout(pending.timerId);
      pendingPresses.delete(keyId);
      if (!pending.fired && pending.shortAction) {
        void pending.shortAction();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", clearPendingPresses);
    return () => {
      clearPendingPresses();
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", clearPendingPresses);
    };
  }, []);
}
