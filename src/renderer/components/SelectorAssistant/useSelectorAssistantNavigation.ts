import { useCallback, useEffect, useState } from "react";
import buildConfirmActionModal from "@/renderer/components/Modal/modales/ConfirmActionModal";
import type { SelectorAssistantApi } from "@/renderer/components/SelectorAssistant/selectorAssistantApi";
import { useModal } from "@/renderer/hooks/useModal";
import type {
  SelectorAssistantNavigationCommand,
  SelectorAssistantNavigationState,
  SelectorAssistantSessionSnapshot,
} from "@/shared/selectorAssistant";

const EMPTY_NAVIGATION_STATE: SelectorAssistantNavigationState = {
  currentUrl: "",
  canGoBack: false,
  canGoForward: false,
  loading: false,
};

export default function useSelectorAssistantNavigation(
  api: SelectorAssistantApi,
  snapshot: SelectorAssistantSessionSnapshot | null,
) {
  const { openModal } = useModal();
  const [state, setState] = useState(EMPTY_NAVIGATION_STATE);
  const [url, setUrl] = useState("");
  const [urlPattern, setUrlPattern] = useState("");
  const [patternApplied, setPatternApplied] = useState(false);

  useEffect(() => {
    let disposed = false;
    const unsubscribeState = api.onSelectorAssistantNavigationState((nextState) => {
      setState(nextState);
      setUrl(nextState.currentUrl);
    });
    void api.getSelectorAssistantNavigationState().then((nextState) => {
      if (!disposed && nextState) {
        setState(nextState);
        setUrl(nextState.currentUrl);
      }
    });
    const unsubscribeRequest = api.onSelectorAssistantNavigationRequest((request) => {
      let responded = false;
      const respond = (allowed: boolean, denyFutureRedirects: boolean) => {
        if (responded) return;
        responded = true;
        void api.respondSelectorAssistantNavigation({
          requestId: request.requestId,
          allowed,
          denyFutureRedirects,
        });
      };
      openModal(buildConfirmActionModal({
        title: "Navigation vers un autre domaine",
        message: `Le site tente d'ouvrir le domaine ${request.hostname}.`,
        details: `Domaines actuellement autorises : ${request.currentHostnames.join(", ")}.`,
        cancelLabel: "Refuser",
        confirmLabel: "Autoriser ce domaine",
        checkbox: {
          label: "Refuser automatiquement toutes les autres redirections vers un autre domaine pour cette session.",
        },
        onCancel: (denyFutureRedirects) => respond(false, denyFutureRedirects),
        onConfirm: (denyFutureRedirects) => respond(true, denyFutureRedirects),
      }));
    });
    return () => {
      disposed = true;
      unsubscribeState?.();
      unsubscribeRequest?.();
    };
  }, [api, openModal]);

  useEffect(() => {
    setUrlPattern(snapshot?.urlPattern?.value ?? "");
    setPatternApplied(false);
  }, [snapshot?.id, snapshot?.urlPattern?.fieldName, snapshot?.urlPattern?.value]);

  const navigate = useCallback((command: SelectorAssistantNavigationCommand) => {
    void api.navigateSelectorAssistant(command);
  }, [api]);

  const applyUrlPattern = useCallback(async () => {
    if (!snapshot?.urlPattern) return;
    const applied = await api.applySelectorAssistantValue({
      formSessionId: snapshot.formSessionId,
      fieldName: snapshot.urlPattern.fieldName,
      selector: urlPattern,
    });
    setPatternApplied(applied);
  }, [api, snapshot, urlPattern]);

  return {
    state,
    url,
    setUrl,
    urlPattern,
    setUrlPattern: (value: string) => {
      setUrlPattern(value);
      setPatternApplied(false);
    },
    patternApplied,
    back: () => navigate({ type: "back" }),
    forward: () => navigate({ type: "forward" }),
    reload: () => navigate({ type: "reload" }),
    openUrl: () => navigate({ type: "navigate", url }),
    applyUrlPattern,
  };
}
