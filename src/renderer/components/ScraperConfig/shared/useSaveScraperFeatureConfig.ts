import { Dispatch, SetStateAction, useCallback } from 'react';
import {
  ScraperFeatureKind,
  ScraperFeatureValidationResult,
  ScraperRecord,
} from '@/shared/scraper';

type SaveConfigSnapshot<TConfig> = {
  config: TConfig;
  errors: Record<string, string>;
  signature: string;
};

type Options<TConfig> = {
  scraperId: string;
  featureKind: ScraperFeatureKind;
  validationResult: ScraperFeatureValidationResult | null;
  lastValidatedSignature: string | null;
  onScraperChange: (scraper: ScraperRecord) => void;
  buildSaveConfig: () => SaveConfigSnapshot<TConfig>;
  setFieldErrors: Dispatch<SetStateAction<Record<string, string>>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
  setSaveError: Dispatch<SetStateAction<string | null>>;
  setSaveMessage: Dispatch<SetStateAction<string | null>>;
};

export default function useSaveScraperFeatureConfig<TConfig>({
  scraperId,
  featureKind,
  validationResult,
  lastValidatedSignature,
  onScraperChange,
  buildSaveConfig,
  setFieldErrors,
  setSaving,
  setSaveError,
  setSaveMessage,
}: Options<TConfig>) {
  return useCallback(async () => {
    const {
      config,
      errors,
      signature,
    } = buildSaveConfig();
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setSaveError('Complete les champs requis avant d\'enregistrer.');
      return;
    }

    const matchingValidation = validationResult?.ok && lastValidatedSignature === signature
      ? validationResult
      : null;

    if (!(window as any).api || typeof (window as any).api.saveScraperFeatureConfig !== 'function') {
      setSaveError('L\'enregistrement du composant n\'est pas disponible dans cette version.');
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const updatedScraper = await (window as any).api.saveScraperFeatureConfig({
        scraperId,
        featureKind,
        config,
        validation: matchingValidation,
      });

      onScraperChange(updatedScraper as ScraperRecord);
      setSaveMessage(
        matchingValidation?.ok
          ? 'Configuration enregistree et validee.'
          : 'Configuration enregistree. Le composant reste a valider.',
      );
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Echec de l\'enregistrement.');
    } finally {
      setSaving(false);
    }
  }, [
    buildSaveConfig,
    featureKind,
    lastValidatedSignature,
    onScraperChange,
    scraperId,
    setFieldErrors,
    setSaveError,
    setSaveMessage,
    setSaving,
    validationResult,
  ]);
}
