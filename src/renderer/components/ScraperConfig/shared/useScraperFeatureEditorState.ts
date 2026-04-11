import { ChangeEvent, useCallback, useState } from 'react';
import { ScraperFeatureValidationResult } from '@/shared/scraper';

type Options<TFormValues> = {
  initialFormValues: TFormValues;
  initialValidationResult: ScraperFeatureValidationResult | null;
  initialValidatedSignature: string | null;
};

export default function useScraperFeatureEditorState<TFormValues extends object>({
  initialFormValues,
  initialValidationResult,
  initialValidatedSignature,
}: Options<TFormValues>) {
  const [formValues, setFormValues] = useState<TFormValues>(initialFormValues);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [validationResult, setValidationResult] = useState<ScraperFeatureValidationResult | null>(
    initialValidationResult,
  );
  const [lastValidatedSignature, setLastValidatedSignature] = useState<string | null>(initialValidatedSignature);
  const [validationUiError, setValidationUiError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const clearFeedback = useCallback(() => {
    setValidationUiError(null);
    setSaveError(null);
    setSaveMessage(null);
  }, []);

  const clearFieldError = useCallback((fieldName: string) => {
    setFieldErrors((previous) => {
      if (!previous[fieldName]) {
        return previous;
      }

      const next = { ...previous };
      delete next[fieldName];
      return next;
    });
  }, []);

  const clearFieldErrorsWhere = useCallback((shouldClear: (fieldName: string) => boolean) => {
    setFieldErrors((previous) => {
      const next = { ...previous };
      Object.keys(next)
        .filter(shouldClear)
        .forEach((fieldName) => {
          delete next[fieldName];
        });
      return next;
    });
  }, []);

  const clearFieldErrorsByPrefix = useCallback((prefix: string) => {
    clearFieldErrorsWhere((fieldName) => fieldName.startsWith(prefix));
  }, [clearFieldErrorsWhere]);

  const clearFieldFeedback = useCallback((fieldName: string) => {
    clearFeedback();
    clearFieldError(fieldName);
  }, [clearFeedback, clearFieldError]);

  const createTextFieldChangeHandler = useCallback((fieldName: keyof TFormValues & string) => (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    setFormValues((previous) => ({
      ...previous,
      [fieldName]: event.target.value,
    }) as TFormValues);
    clearFieldFeedback(fieldName);
  }, [clearFieldFeedback]);

  const createCheckboxChangeHandler = useCallback((fieldName: keyof TFormValues & string) => (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    setFormValues((previous) => ({
      ...previous,
      [fieldName]: event.target.checked,
    }) as TFormValues);
    clearFieldFeedback(fieldName);
  }, [clearFieldFeedback]);

  const resetEditorState = useCallback(() => {
    setFormValues(initialFormValues);
    setFieldErrors({});
    setValidationResult(initialValidationResult);
    setLastValidatedSignature(initialValidatedSignature);
    setValidationUiError(null);
    setValidating(false);
    setSaving(false);
    setSaveError(null);
    setSaveMessage(null);
  }, [initialFormValues, initialValidatedSignature, initialValidationResult]);

  return {
    formValues,
    setFormValues,
    fieldErrors,
    setFieldErrors,
    validationResult,
    setValidationResult,
    lastValidatedSignature,
    setLastValidatedSignature,
    validationUiError,
    setValidationUiError,
    validating,
    setValidating,
    saving,
    setSaving,
    saveError,
    setSaveError,
    saveMessage,
    setSaveMessage,
    clearFeedback,
    clearFieldError,
    clearFieldErrorsWhere,
    clearFieldErrorsByPrefix,
    clearFieldFeedback,
    createTextFieldChangeHandler,
    createCheckboxChangeHandler,
    resetEditorState,
  };
}
