import React from "react";
import type { AuthorCorrespondenceBackgroundResult } from "@/renderer/backgroundSearch/types";
import type {
  BackgroundSearchProgress,
  BackgroundSearchStatus,
} from "@/shared/backgroundSearch";

type Props = {
  enabled: boolean;
  status?: BackgroundSearchStatus;
  progress?: BackgroundSearchProgress;
  summary?: AuthorCorrespondenceBackgroundResult["advancedSearch"];
  newAuthorPageCount: number;
};

const formatCount = (count: number, singular: string, plural: string): string => (
  `${count} ${count === 1 ? singular : plural}`
);

export default function AuthorCorrespondenceAdvancedStatus({
  enabled,
  status,
  progress,
  summary,
  newAuthorPageCount,
}: Props) {
  const active = status === "queued" || status === "running";
  if ((!enabled || !active) && !summary) return null;

  const completedUnits = Math.max(0, progress?.completedUnits ?? 0);
  const totalUnits = Math.max(0, progress?.totalUnits ?? 0);
  const progressPercent = totalUnits > 0
    ? Math.min(100, Math.round((completedUnits / totalUnits) * 100))
    : 0;
  const activeProgressLabel = status === "queued"
    ? `${completedUnits}/${totalUnits} en attente`
    : completedUnits < totalUnits
      ? `Manga ${completedUnits + 1}/${totalUnits} en cours · ${completedUnits} terminé${completedUnits === 1 ? "" : "s"}`
      : `${completedUnits}/${totalUnits} terminés`;

  if (active) {
    return (
      <section className="author-correspondence-view__advanced-status" aria-live="polite">
        <div className="author-correspondence-view__advanced-status-head">
          <strong>{status === "queued" ? "Recherche poussée en attente" : "Recherche poussée en cours"}</strong>
          {newAuthorPageCount > 0 ? (
            <em>{formatCount(newAuthorPageCount, "nouvelle page trouvée", "nouvelles pages trouvées")}</em>
          ) : null}
        </div>
        <span>{progress?.currentLabel || "Préparation de la prochaine étape…"}</span>
        {summary?.automaticMangaReplayBlocked ? (
          <small className="author-correspondence-view__advanced-safety-warning">
            Une protection anti-emballement s’est déclenchée. Une recherche manga liée ne sera pas relancée automatiquement si son option de blocage est active.
          </small>
        ) : null}
        {totalUnits > 0 ? (
          <div className="author-correspondence-view__advanced-progress-row">
            <div
              className="author-correspondence-view__advanced-progress"
              role="progressbar"
              aria-label="Avancement de la recherche poussée"
              aria-valuemin={0}
              aria-valuemax={totalUnits}
              aria-valuenow={Math.min(completedUnits, totalUnits)}
            >
              <i style={{ width: `${progressPercent}%` }} />
            </div>
            <small>{activeProgressLabel}</small>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className={[
      "author-correspondence-view__advanced-status",
      status === "cancelled" ? "is-cancelled" : "is-complete",
    ].join(" ")}>
      <strong>
        {status === "cancelled"
          ? formatCount(
            summary?.lastBatchMangaCount ?? 0,
            "manga validé avant l’arrêt",
            "mangas validés avant l’arrêt",
          )
          : newAuthorPageCount > 0
          ? formatCount(newAuthorPageCount, "nouvelle page auteur trouvée", "nouvelles pages auteur trouvées")
          : "Recherche poussée terminée"}
      </strong>
      <span>
        {formatCount(summary?.processedMangaCount ?? 0, "manga analysé", "mangas analysés")}
        {" · "}{formatCount(summary?.discoveredMangaSourceCount ?? 0, "source ajoutée", "sources ajoutées")}
        {" · "}{formatCount(summary?.remainingCandidateCount ?? 0, "candidat restant", "candidats restants")}
      </span>
      {summary?.automaticMangaReplayBlocked ? (
        <small className="author-correspondence-view__advanced-safety-warning">
          {formatCount(summary.safetyWarnings?.length ?? 0, "alerte de sécurité", "alertes de sécurité")} · import manuel disponible depuis la recherche manga liée.
        </small>
      ) : null}
    </section>
  );
}
