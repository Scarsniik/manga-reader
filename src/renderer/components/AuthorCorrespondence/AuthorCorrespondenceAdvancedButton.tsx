import React from "react";
import type { AuthorCorrespondenceBackgroundResult } from "@/renderer/backgroundSearch/types";
import { MagnifyingGlassIcon } from "@/renderer/components/icons";
import type { AuthorCorrespondenceBackgroundInput } from "@/shared/backgroundSearch";
import { DEFAULT_AUTHOR_CORRESPONDENCE_ADVANCED_BATCH_SIZE } from "@/shared/backgroundSearch";

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
  const hasNoRemainingCandidate = Boolean(
    completedBatchCount
    && result?.advancedSearch?.remainingCandidateCount === 0,
  );
  const batchSize = Math.max(
    1,
    Math.floor(
      input?.advancedSearch?.batchSize
      ?? DEFAULT_AUTHOR_CORRESPONDENCE_ADVANCED_BATCH_SIZE,
    ),
  );

  const startAdvancedSearch = async () => {
    if (!backgroundSearchJobId || !input || !result || active || pending) return;
    setPending(true);
    setLaunchError(null);
    try {
      const requestedBatchCount = Math.max(
        completedBatchCount,
        input.advancedSearch?.requestedBatchCount ?? 0,
      ) + 1;
      const replayed = await window.api?.replayBackgroundSearch?.({
        jobId: backgroundSearchJobId,
        input: {
          ...input,
          replay: undefined,
          advancedSearch: {
            enabled: true,
            batchSize,
            requestedBatchCount,
            continueFromResult: true,
            invalidatedAuthorMatchKeys: Array.from(invalidatedMatchKeys),
            enableRomajiPhoneticMerge: input.advancedSearch?.enableRomajiPhoneticMerge === true,
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
      <button
        type="button"
        className="author-correspondence-view__open-combined"
        onClick={() => void startAdvancedSearch()}
        disabled={active || pending || hasNoRemainingCandidate}
        title={hasNoRemainingCandidate
          ? "Tous les mangas disponibles ont déjà été analysés"
          : `Analyser les ${batchSize} prochains mangas les plus présents`}
      >
        <MagnifyingGlassIcon aria-hidden="true" focusable="false" />
        <span>
          {pending || active
            ? "Recherche poussée en cours…"
            : hasNoRemainingCandidate
              ? "Aucun manga suivant"
              : completedBatchCount
                ? `Approfondir avec les ${batchSize} suivants`
                : "Lancer la recherche poussée"}
        </span>
      </button>
      {launchError ? (
        <small className="author-correspondence-view__advanced-error" role="alert">
          {launchError}
        </small>
      ) : null}
    </>
  );
}
