import React from "react";
import buildConfirmActionModal from "@/renderer/components/Modal/modales/ConfirmActionModal";
import type {
  ScraperPotentialMangaMatch,
  ScraperPotentialSeriesReadingWarning,
} from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchTypes";
import { useModal } from "@/renderer/hooks/useModal";

const POTENTIAL_MATCH_WARNING_DETAIL_LIMIT = 4;

type MatchGroups = {
  readingMatches: ScraperPotentialMangaMatch[];
  bookmarkMatches: ScraperPotentialMangaMatch[];
  readingListMatches: ScraperPotentialMangaMatch[];
  seriesReadingWarning?: ScraperPotentialSeriesReadingWarning | null;
};

const getMatchLabel = (match: ScraperPotentialMangaMatch): string => (
  `${match.title} - ${match.sourceLabel} (${match.detailLabel})`
);

const buildWarningDetails = ({
  readingMatches,
  bookmarkMatches,
  readingListMatches,
  seriesReadingWarning,
}: MatchGroups): React.ReactNode => {
  const matches = [
    ...readingMatches.map((match) => ({ label: getMatchLabel(match), kind: "Lecture" })),
    ...bookmarkMatches.map((match) => ({ label: getMatchLabel(match), kind: "Bookmark" })),
    ...readingListMatches.map((match) => ({ label: getMatchLabel(match), kind: "Liste" })),
  ];
  const visibleMatches = matches.slice(0, POTENTIAL_MATCH_WARNING_DETAIL_LIMIT);
  const hiddenCount = Math.max(0, matches.length - visibleMatches.length);

  return (
    <>
      {seriesReadingWarning ? (
        <p>
          <strong>Série</strong>
          {" - "}
          Cette fiche semble être le {seriesReadingWarning.sequenceLabel} de
          {" "}
          <strong>{seriesReadingWarning.seriesTitle}</strong>, mais aucune lecture terminée antérieure
          n&apos;a été détectée.
        </p>
      ) : null}
      {visibleMatches.length ? (
        <ul>
          {visibleMatches.map((match) => (
            <li key={`${match.kind}:${match.label}`}>
              <strong>{match.kind}</strong>
              {" - "}
              {match.label}
            </li>
          ))}
        </ul>
      ) : null}
      {hiddenCount > 0 ? (
        <p>{hiddenCount} autre{hiddenCount > 1 ? "s" : ""} correspondance{hiddenCount > 1 ? "s" : ""}.</p>
      ) : null}
    </>
  );
};

export default function usePotentialMangaMatchBookmarkGuard(groups: MatchGroups) {
  const { openModal } = useModal();
  const matchCount = groups.readingMatches.length
    + groups.bookmarkMatches.length
    + groups.readingListMatches.length
    + (groups.seriesReadingWarning ? 1 : 0);
  const warningDetails = React.useMemo(
    () => buildWarningDetails(groups),
    [
      groups.bookmarkMatches,
      groups.readingListMatches,
      groups.readingMatches,
      groups.seriesReadingWarning,
    ],
  );
  const confirmBookmark = React.useCallback((action: () => void) => {
    if (!matchCount) {
      action();
      return;
    }

    openModal(buildConfirmActionModal({
      title: "Correspondance potentielle",
      message: (
        <>
          Attention, cette fiche ressemble à un manga déjà suivi ou semble appartenir à une série commencée plus loin.
          {" "}
          Vérifie la correspondance avant de continuer.
        </>
      ),
      details: warningDetails,
      confirmLabel: "Bookmarker quand meme",
      onConfirm: action,
    }));
  }, [matchCount, openModal, warningDetails]);
  const handleBeforeToggle = React.useCallback((
    nextIsBookmarked: boolean,
    proceed: () => void,
  ) => {
    if (!nextIsBookmarked) {
      proceed();
      return;
    }

    confirmBookmark(proceed);
  }, [confirmBookmark]);

  return { confirmBookmark, handleBeforeToggle, matchCount };
}
