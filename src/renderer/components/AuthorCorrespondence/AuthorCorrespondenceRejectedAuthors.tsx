import React from "react";
import type { AuthorCorrespondenceRejectedAuthorCandidate } from "@/renderer/backgroundSearch/types";
import { OpenBookIcon } from "@/renderer/components/icons";
import type { AuthorCorrespondenceRejectedOpenTarget } from "@/renderer/components/AuthorCorrespondence/authorCorrespondenceRejectedOpenTargets";

type Props = {
  candidates: AuthorCorrespondenceRejectedAuthorCandidate[];
  active: boolean;
  pendingCandidateName?: string | null;
  error?: string | null;
  openTargetsByCandidateKey: ReadonlyMap<string, AuthorCorrespondenceRejectedOpenTarget[]>;
  onAccept: (candidate: AuthorCorrespondenceRejectedAuthorCandidate) => void;
  onOpenReferenceSource: (
    candidate: AuthorCorrespondenceRejectedAuthorCandidate,
    source: AuthorCorrespondenceRejectedOpenTarget,
    inWorkspace: boolean,
  ) => void;
};

const describeReason = (candidate: AuthorCorrespondenceRejectedAuthorCandidate): string => {
  if (candidate.reason === "implausibleName") {
    return "Extraction probablement incomplète ou générique.";
  }
  if (candidate.reason === "multipleAuthorsOnly") {
    return "Trouvé uniquement parmi plusieurs auteurs d’un même manga.";
  }
  if (candidate.reason === "insufficientScraperEvidence") {
    return "Présent sur plusieurs mangas, mais confirmé par une seule source.";
  }
  return candidate.mangaCount === 1
    ? "Trouvé sur un seul manga : validation automatique trop risquée."
    : "Pas assez de mangas distincts pour une validation automatique.";
};

export default function AuthorCorrespondenceRejectedAuthors({
  candidates,
  active,
  pendingCandidateName,
  error,
  openTargetsByCandidateKey,
  onAccept,
  onOpenReferenceSource,
}: Props) {
  if (!candidates.length) return null;

  return (
    <details className="author-correspondence-view__rejected">
      <summary>
        <span>
          <strong>Auteurs rejetés · {candidates.length}</strong>
          <small>À ouvrir seulement si tu veux examiner ou forcer une piste.</small>
        </span>
        <span className="author-correspondence-view__rejected-toggle">Afficher</span>
      </summary>
      <div className="author-correspondence-view__rejected-content">
        <p>
          Ces noms ont été vus pendant la recherche, mais n’étaient pas assez fiables pour être
          propagés automatiquement. Une validation forcée relance uniquement leur recherche de
          pages auteur.
        </p>
        {error ? (
          <p className="author-correspondence-view__rejected-error" role="alert">{error}</p>
        ) : null}
        <div className="author-correspondence-view__rejected-list">
          {candidates.map((candidate) => {
            const pending = pendingCandidateName === candidate.name;
            const openTargets = openTargetsByCandidateKey.get(candidate.key) ?? [];
            return (
              <article key={candidate.key}>
                <div>
                  <h3>{candidate.name}</h3>
                  <p>{describeReason(candidate)}</p>
                  <small>
                    {candidate.mangaCount} manga(s) · {candidate.scraperCount} source(s)
                    {candidate.scraperNames.length
                      ? ` · ${candidate.scraperNames.join(", ")}`
                      : ""}
                  </small>
                  {candidate.sampleTitles.length ? (
                    <em title={candidate.sampleTitles.join("\n")}>{candidate.sampleTitles[0]}</em>
                  ) : null}
                </div>
                <div className="author-correspondence-view__rejected-actions">
                  {openTargets.map((source) => (
                    <button
                      key={`${source.scraperId}::${source.authorUrl}`}
                      type="button"
                      className="author-correspondence-view__rejected-open"
                      onClick={() => onOpenReferenceSource(candidate, source, false)}
                      onMouseDown={(event) => {
                        if (event.button === 1) event.preventDefault();
                      }}
                      onAuxClick={(event) => {
                        if (event.button !== 1) return;
                        event.preventDefault();
                        event.stopPropagation();
                        onOpenReferenceSource(candidate, source, true);
                      }}
                      title="Ouvrir cette page auteur rejetée"
                      data-prevent-middle-click-autoscroll="true"
                    >
                      <OpenBookIcon aria-hidden="true" focusable="false" />
                      <span>Ouvrir · {source.scraperName}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className="author-correspondence-view__rejected-accept"
                    disabled={active || Boolean(pendingCandidateName)}
                    onClick={() => onAccept(candidate)}
                  >
                    {pending ? "Validation…" : "Valider et rechercher"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </details>
  );
}
