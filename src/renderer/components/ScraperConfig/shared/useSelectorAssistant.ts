import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  OpenSelectorAssistantRequest,
  SelectorAssistantAppliedValue,
} from "@/shared/selectorAssistant";

type SelectorAssistantOwnerApi = {
  openSelectorAssistant?: (request: OpenSelectorAssistantRequest) => Promise<string | null>;
  closeSelectorAssistant?: (formSessionId: string) => Promise<boolean>;
  onSelectorAssistantValueApplied?: (
    callback: (value: SelectorAssistantAppliedValue) => void,
  ) => () => void;
};

type Options = {
  request: Omit<OpenSelectorAssistantRequest, "formSessionId"> | null;
  onApply: (fieldName: string, selector: string) => void;
};

const createFormSessionId = (): string => (
  `scraper-form-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
);

export default function useSelectorAssistant({ request, onApply }: Options) {
  const api = useMemo(() => (window.api ?? {}) as SelectorAssistantOwnerApi, []);
  const formSessionIdRef = useRef(createFormSessionId());
  const onApplyRef = useRef(onApply);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onApplyRef.current = onApply;
  }, [onApply]);

  useEffect(() => {
    const unsubscribe = api.onSelectorAssistantValueApplied?.((value) => {
      if (value.formSessionId === formSessionIdRef.current) {
        onApplyRef.current(value.fieldName, value.selector);
      }
    });

    return () => {
      unsubscribe?.();
      void api.closeSelectorAssistant?.(formSessionIdRef.current);
    };
  }, [api]);

  const open = useCallback(async () => {
    if (!request) {
      setError("Complete les informations de test du module avant d'ouvrir l'assistant.");
      return;
    }
    if (typeof api.openSelectorAssistant !== "function") {
      setError("L'assistant de selecteurs n'est pas disponible dans cette version.");
      return;
    }

    setOpening(true);
    setError(null);
    try {
      const sessionId = await api.openSelectorAssistant({
        ...request,
        formSessionId: formSessionIdRef.current,
      });
      if (!sessionId) {
        setError("La fenetre de l'assistant n'a pas pu etre ouverte.");
      }
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Impossible d'ouvrir l'assistant.");
    } finally {
      setOpening(false);
    }
  }, [api, request]);

  return { open, opening, error };
}
