import React, { useMemo, useState } from "react";
import type { MangaCorrespondenceRejectedCandidate } from "@/renderer/backgroundSearch/types";
import { formatMangaCorrespondenceChapterLabel } from "@/renderer/utils/mangaCorrespondenceChapter";

type Props = {
  candidates: MangaCorrespondenceRejectedCandidate[];
  onAccept: (chapter: string | undefined, useAsSearchSeed: boolean) => Promise<void>;
  onDismiss: () => Promise<void>;
  onCancel: () => void;
  onOpenSource: (candidate: MangaCorrespondenceRejectedCandidate) => void;
};

const uniqueText = (values: Array<string | undefined>): string[] => Array.from(new Set(
  values.map((value) => value?.trim() ?? "").filter(Boolean),
));

const getInitialChapter = (candidates: MangaCorrespondenceRejectedCandidate[]): string => {
  const acceptedChapters = uniqueText(candidates.map((candidate) => candidate.acceptedChapter));
  if (acceptedChapters.length === 1) return acceptedChapters[0];
  const suggestedChapters = uniqueText(candidates.map((candidate) => candidate.suggestedChapter));
  return suggestedChapters.length === 1 ? suggestedChapters[0] : "";
};

export default function MangaCorrespondenceRejectedReviewDialog({
  candidates,
  onAccept,
  onDismiss,
  onCancel,
  onOpenSource,
}: Props) {
  const [chapter, setChapter] = useState(() => getInitialChapter(candidates));
  const [useAsSearchSeed, setUseAsSearchSeed] = useState(() => (
    candidates.some((candidate) => candidate.useAsSearchSeed)
  ));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const score = Math.max(0, ...candidates.map((candidate) => candidate.score));
  const reasons = useMemo(
    () => uniqueText(candidates.flatMap((candidate) => candidate.scoreReasons)),
    [candidates],
  );
  const titles = useMemo(
    () => uniqueText(candidates.flatMap((candidate) => [
      candidate.analyzedTitle,
      ...candidate.alternativeTitles,
    ])),
    [candidates],
  );
  const authors = useMemo(
    () => uniqueText(candidates.flatMap((candidate) => candidate.authors)),
    [candidates],
  );
  const hasReliableChapter = candidates.some((candidate) => (
    candidate.chapterConfidence === "high" && Boolean(candidate.suggestedChapter)
  ));

  const runAction = async (action: () => Promise<void>) => {
    setSubmitting(true);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Impossible d’enregistrer ce choix.");
      setSubmitting(false);
    }
  };

  return (
    <div className="manga-correspondence-rejected-dialog">
      <div className="manga-correspondence-rejected-dialog__score">
        <strong>{score}/100</strong>
        <span>Score de correspondance, distinct de la fiabilité du chapitre</span>
      </div>

      <div className="manga-correspondence-rejected-dialog__summary">
        <div><span>Titre(s)</span><strong>{titles.join(" · ")}</strong></div>
        <div><span>Auteur(s)</span><strong>{authors.join(", ") || "Non renseigné"}</strong></div>
        <div><span>Sources</span><strong>{candidates.length}</strong></div>
      </div>

      <ul className="manga-correspondence-rejected-dialog__reasons">
        {reasons.map((reason) => <li key={reason}>{reason}</li>)}
      </ul>

      <label className="manga-correspondence-rejected-dialog__field">
        <span>
          Chapitre
          <small>{hasReliableChapter ? "Détection fiable" : "Proposition à vérifier"}</small>
        </span>
        <input
          value={chapter}
          onChange={(event) => setChapter(event.target.value)}
          placeholder="Non renseigné"
        />
        {chapter ? <small>{formatMangaCorrespondenceChapterLabel(chapter, true)}</small> : null}
      </label>

      <label className="manga-correspondence-rejected-dialog__seed">
        <input
          type="checkbox"
          checked={useAsSearchSeed}
          onChange={(event) => setUseAsSearchSeed(event.target.checked)}
        />
        <span>Utiliser les titres et auteurs comme pistes pour la prochaine passe</span>
      </label>

      <div className="manga-correspondence-rejected-dialog__sources">
        {candidates.map((candidate) => (
          <button type="button" key={candidate.key} onClick={() => onOpenSource(candidate)}>
            <span>{candidate.source.scraper.name}</span>
            <strong>{candidate.source.result.title}</strong>
            <small>Ouvrir dans un onglet</small>
          </button>
        ))}
      </div>

      {error ? <p className="manga-correspondence-rejected-dialog__error">{error}</p> : null}
      <div className="manga-correspondence-rejected-dialog__actions">
        <button type="button" className="secondary" disabled={submitting} onClick={onCancel}>Annuler</button>
        <button
          type="button"
          className="danger"
          disabled={submitting}
          onClick={() => void runAction(onDismiss)}
        >
          Écarter
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void runAction(() => onAccept(chapter.trim() || undefined, useAsSearchSeed))}
        >
          {submitting ? "Enregistrement…" : "Accepter"}
        </button>
      </div>
    </div>
  );
}
