import React from "react";
import type { AuthorCorrespondenceRejectedAuthorCandidate } from "@/renderer/backgroundSearch/types";
import AdaptiveDropdown from "@/renderer/components/AdaptiveDropdown/AdaptiveDropdown";
import { ChevronDownIcon, DetailsCardIcon, OpenBookIcon } from "@/renderer/components/icons";
import type {
  AuthorCorrespondenceRejectedMangaTarget,
  AuthorCorrespondenceRejectedOpenTarget,
} from "@/renderer/components/AuthorCorrespondence/authorCorrespondenceRejectedOpenTargets";

type Props = {
  candidates: AuthorCorrespondenceRejectedAuthorCandidate[];
  active: boolean;
  pendingCandidateName?: string | null;
  error?: string | null;
  openTargetsByCandidateKey: ReadonlyMap<string, AuthorCorrespondenceRejectedOpenTarget[]>;
  mangaTargetsByCandidateKey: ReadonlyMap<string, AuthorCorrespondenceRejectedMangaTarget[]>;
  onAccept: (candidate: AuthorCorrespondenceRejectedAuthorCandidate) => void;
  onOpenReferenceSource: (
    candidate: AuthorCorrespondenceRejectedAuthorCandidate,
    source: AuthorCorrespondenceRejectedOpenTarget,
    inWorkspace: boolean,
  ) => void;
  onOpenEvidenceManga: (
    candidate: AuthorCorrespondenceRejectedAuthorCandidate,
    target: AuthorCorrespondenceRejectedMangaTarget,
    inWorkspace: boolean,
  ) => void;
};

type RejectedMangaDropdownProps = {
  candidate: AuthorCorrespondenceRejectedAuthorCandidate;
  targets: AuthorCorrespondenceRejectedMangaTarget[];
  onOpen: Props["onOpenEvidenceManga"];
};

function RejectedMangaDropdown({
  candidate,
  targets,
  onOpen,
}: RejectedMangaDropdownProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <AdaptiveDropdown
      open={open}
      onOpenChange={setOpen}
      className="author-correspondence-view__rejected-manga-dropdown"
      contentClassName="author-correspondence-view__rejected-manga-menu"
      contentRole="menu"
      gap={6}
      maxHeight={320}
      portal
      renderTrigger={({ contentId, isOpen, setTriggerRef, toggle }) => (
        <button
          ref={setTriggerRef}
          type="button"
          className="author-correspondence-view__rejected-open"
          aria-controls={contentId}
          aria-expanded={isOpen}
          aria-haspopup="menu"
          onClick={toggle}
        >
          <DetailsCardIcon aria-hidden="true" focusable="false" />
          <span>{targets.length === 1 ? "Voir le manga" : `Voir les mangas · ${targets.length}`}</span>
          <ChevronDownIcon aria-hidden="true" focusable="false" />
        </button>
      )}
    >
      <div className="author-correspondence-view__rejected-manga-list" role="none">
        {targets.map((target) => (
          <button
            key={`${target.scraperId}::${target.sourceUrl}`}
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onOpen(candidate, target, false);
            }}
            onMouseDown={(event) => {
              if (event.button === 1) event.preventDefault();
            }}
            onAuxClick={(event) => {
              if (event.button !== 1) return;
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              onOpen(candidate, target, true);
            }}
            title={target.title}
            data-prevent-middle-click-autoscroll="true"
          >
            <DetailsCardIcon aria-hidden="true" focusable="false" />
            <span>
              <strong>{target.title}</strong>
              <small>{target.scraperName}</small>
            </span>
          </button>
        ))}
      </div>
    </AdaptiveDropdown>
  );
}

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
  mangaTargetsByCandidateKey,
  onAccept,
  onOpenEvidenceManga,
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
          pages auteur. Sans page auteur confirmée, les mangas à l’origine de la piste sont proposés.
        </p>
        {error ? (
          <p className="author-correspondence-view__rejected-error" role="alert">{error}</p>
        ) : null}
        <div className="author-correspondence-view__rejected-list">
          {candidates.map((candidate) => {
            const pending = pendingCandidateName === candidate.name;
            const openTargets = openTargetsByCandidateKey.get(candidate.key) ?? [];
            const evidenceMangaTargets = mangaTargetsByCandidateKey.get(candidate.key) ?? [];
            const mangaTargets = openTargets.length
              ? []
              : evidenceMangaTargets;
            const sampleTitle = evidenceMangaTargets[0]?.title ?? candidate.sampleTitles[0];
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
                  {sampleTitle ? (
                    <em title={sampleTitle}>{sampleTitle}</em>
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
                  {mangaTargets.length ? (
                    <RejectedMangaDropdown
                      candidate={candidate}
                      targets={mangaTargets}
                      onOpen={onOpenEvidenceManga}
                    />
                  ) : null}
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
