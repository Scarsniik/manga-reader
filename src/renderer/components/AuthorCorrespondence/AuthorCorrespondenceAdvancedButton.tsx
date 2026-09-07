import React from "react";
import type { AuthorCorrespondenceBackgroundResult } from "@/renderer/backgroundSearch/types";
import { MagnifyingGlassIcon } from "@/renderer/components/icons";
import ScraperPageAppendControl from "@/renderer/components/ScraperPageAppendControl/ScraperPageAppendControl";
import type { AuthorCorrespondenceBackgroundInput } from "@/shared/backgroundSearch";
import { DEFAULT_AUTHOR_CORRESPONDENCE_ADVANCED_BATCH_SIZE } from "@/shared/backgroundSearch";
import {
  buildAuthorCorrespondenceReplayInput,
  buildInitialAuthorCorrespondenceDiscoveries,
} from "@/renderer/backgroundSearch/authorCorrespondenceDiscoveries";

type Props = {
  active: boolean;
  backgroundSearchJobId?: string;
  input?: AuthorCorrespondenceBackgroundInput;
  result?: AuthorCorrespondenceBackgroundResult;
  invalidatedMatchKeys: Set<string>;
  reload: () => Promise<void>;
};

export default function AuthorCorrespondenceAdvancedButton({
  active,
  backgroundSearchJobId,
  input,
  result,
  invalidatedMatchKeys,
  reload,
}: Props) {
  const [pending, setPending] = React.useState(false);
  const [launchError, setLaunchError] = React.useState<string | null>(null);
  const completedBatchCount = result?.advancedSearch?.completedBatchCount ?? 0;
  const processedMangaCount = result?.advancedSearch?.processedMangaCount ?? 0;
  const hasNoRemainingCandidate = Boolean(
    completedBatchCount
    && result?.advancedSearch?.remainingCandidateCount === 0,
  );
  const configuredBatchSize = input?.advancedSearch?.batchSize
    ?? DEFAULT_AUTHOR_CORRESPONDENCE_ADVANCED_BATCH_SIZE;
  const batchSize = Number.isFinite(configuredBatchSize)
    ? Math.max(0, Math.floor(configuredBatchSize))
    : DEFAULT_AUTHOR_CORRESPONDENCE_ADVANCED_BATCH_SIZE;

  const startAdvancedSearch = async (requestedMangaCount: number) => {
    if (!backgroundSearchJobId || !input || !result || active || pending) return;
    setPending(true);
    setLaunchError(null);
    try {
      const revisedInput = buildAuthorCorrespondenceReplayInput(
        input,
        buildInitialAuthorCorrespondenceDiscoveries(input, result),
      );
      const requestedBatchCount = Math.max(
        completedBatchCount,
        input.advancedSearch?.requestedBatchCount ?? 0,
      ) + 1;
      const replayed = await window.api?.replayBackgroundSearch?.({
        jobId: backgroundSearchJobId,
        input: {
          ...revisedInput,
          replay: undefined,
          advancedSearch: {
            enabled: true,
            batchSize: requestedMangaCount,
            requestedBatchCount,
            requestedProcessedMangaCount: (
              result.advancedSearch?.processedMangaCount ?? 0
            ) + requestedMangaCount,
            continueFromResult: true,
            invalidatedAuthorMatchKeys: Array.from(invalidatedMatchKeys),
            enableRomajiPhoneticMerge: revisedInput.advancedSearch?.enableRomajiPhoneticMerge === true,
          },
        },
      });
      if (!replayed) {
        throw new Error("La recherche poussée n’a pas pu être lancée.");
      }
      await reload();
    } catch (error) {
      setLaunchError(error instanceof Error
        ? error.message
        : "La recherche poussée n’a pas pu être lancée.");
    } finally {
      setPending(false);
    }
  };

  if (!input || !result) return null;

  return (
    <>
      <ScraperPageAppendControl
        loading={active || pending}
        disabled={active || pending || hasNoRemainingCandidate}
        disabledTitle={hasNoRemainingCandidate
          ? "Tous les mangas disponibles ont déjà été analysés"
          : undefined}
        initialCount={batchSize}
        label="Analyser"
        unitSingular="manga"
        unitPlural="mangas"
        formAriaLabel="Choisir le nombre de mangas à analyser en recherche poussée"
        inputAriaLabel="Nombre de mangas à analyser, zéro pour tous les mangas restants"
        allowZero
        zeroUnitLabel="= tous"
        submitLabel={hasNoRemainingCandidate
            ? "Aucun manga suivant"
          : completedBatchCount || processedMangaCount
            ? "Approfondir les suivants"
            : "Lancer la recherche poussée"}
        loadingLabel="Recherche en cours…"
        submitTitle="Analyser les prochains mangas les plus présents ; zéro analyse tous les mangas restants"
        submitIcon={<MagnifyingGlassIcon aria-hidden="true" focusable="false" />}
        onAppendPages={(mangaCount) => void startAdvancedSearch(mangaCount)}
      />
      {launchError ? (
        <small className="author-correspondence-view__advanced-error" role="alert">
          {launchError}
        </small>
      ) : null}
    </>
  );
}
