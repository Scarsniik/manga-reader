import React, { useEffect, useMemo, useState } from "react";
import type {
  BackgroundSearchJob,
  BackgroundSearchQueueSummary,
  MangaCorrespondenceBackgroundInput,
} from "@/shared/backgroundSearch";
import type { MangaCorrespondenceBackgroundResult } from "@/renderer/backgroundSearch/types";
import { importLinkedAuthorSearchIntoManga } from "@/renderer/backgroundSearch/linkedAuthorSearchOrchestration";
import {
  buildReusableAuthorSearchCandidates,
  collectAuthorSearchCorpusNames,
  type ReusableAuthorSearchCandidate,
} from "@/renderer/backgroundSearch/reusableAuthorSearches";
import { normalizeFuzzyText } from "@/renderer/utils/fuzzyText";

type Props = {
  mangaJob: BackgroundSearchJob<MangaCorrespondenceBackgroundInput, MangaCorrespondenceBackgroundResult>
    & { result: MangaCorrespondenceBackgroundResult };
  onCancel: () => void;
  onImported: () => Promise<void> | void;
};

const loadAuthorJobs = async (): Promise<BackgroundSearchJob[]> => {
  const queue = await window.api?.getBackgroundSearchQueue?.() as BackgroundSearchQueueSummary | undefined;
  if (!queue || typeof window.api?.getBackgroundSearchJob !== "function") return [];
  const metadata = queue.jobs.filter((job) => (
    job.kind === "authorCorrespondence"
    && job.resultAvailable
    && (job.status === "completed" || job.status === "cancelled")
  ));
  const jobs = await Promise.all(metadata.map((job) => window.api?.getBackgroundSearchJob?.(job.id)));
  return jobs.filter((job): job is BackgroundSearchJob => Boolean(job));
};

const getCandidateSearchText = (candidate: ReusableAuthorSearchCandidate): string => normalizeFuzzyText([
  candidate.job.metadata.primaryTerm,
  candidate.job.metadata.title,
  ...collectAuthorSearchCorpusNames(candidate.job),
].join(" "));

export default function ExistingAuthorSearchDialog({ mangaJob, onCancel, onImported }: Props) {
  const [candidates, setCandidates] = useState<ReusableAuthorSearchCandidate[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [query, setQuery] = useState("");
  const [autoRefreshOnCompletion, setAutoRefreshOnCompletion] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    void loadAuthorJobs().then((jobs) => {
      if (disposed) return;
      const loadedCandidates = buildReusableAuthorSearchCandidates(mangaJob, jobs);
      setCandidates(loadedCandidates);
      setSelectedJobId(
        loadedCandidates.find((candidate) => (
          candidate.automaticallyCompatible && !candidate.automaticImportBlocked
        ))?.job.metadata.id
        ?? loadedCandidates[0]?.job.metadata.id
        ?? "",
      );
    }).catch((loadError: unknown) => {
      if (!disposed) {
        setError(loadError instanceof Error
          ? loadError.message
          : "Impossible de charger les recherches auteur existantes.");
      }
    }).finally(() => {
      if (!disposed) setLoading(false);
    });
    return () => { disposed = true; };
  }, [mangaJob]);

  const visibleCandidates = useMemo(() => {
    const normalizedQuery = normalizeFuzzyText(query);
    return normalizedQuery
      ? candidates.filter((candidate) => getCandidateSearchText(candidate).includes(normalizedQuery))
      : candidates;
  }, [candidates, query]);
  const selectedCandidate = candidates.find((candidate) => (
    candidate.job.metadata.id === selectedJobId
  ));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCandidate || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await importLinkedAuthorSearchIntoManga({
        authorJobId: selectedCandidate.job.metadata.id,
        mangaJobId: mangaJob.metadata.id,
        automatic: false,
        autoRefreshOnCompletion,
        blockAutomaticImportOnSafetyWarning: true,
      });
      await onImported();
    } catch (submitError) {
      setError(submitError instanceof Error
        ? submitError.message
        : "Le corpus auteur n’a pas pu être lié.");
      setSubmitting(false);
    }
  };

  return (
    <form className="existing-author-search-dialog" onSubmit={submit}>
      <p>
        Les recherches compatibles sont proposées en premier. Tu peux aussi sélectionner manuellement
        n’importe quel corpus auteur conservé.
      </p>
      <label className="existing-author-search-dialog__filter">
        <span>Filtrer les recherches auteur</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nom de l’auteur ou de la recherche"
          autoFocus
        />
      </label>
      <div className="existing-author-search-dialog__list">
        {loading ? <p>Chargement des recherches auteur…</p> : null}
        {!loading && !visibleCandidates.length ? (
          <p>Aucune recherche auteur importable ne correspond à ce filtre.</p>
        ) : null}
        {visibleCandidates.map((candidate) => {
          const advanced = candidate.job.result.advancedSearch;
          return (
            <label
              key={candidate.job.metadata.id}
              className={candidate.job.metadata.id === selectedJobId ? "is-selected" : ""}
            >
              <input
                type="radio"
                name="existing-author-search"
                value={candidate.job.metadata.id}
                checked={candidate.job.metadata.id === selectedJobId}
                onChange={() => setSelectedJobId(candidate.job.metadata.id)}
              />
              <span>
                <strong>{candidate.job.metadata.primaryTerm}</strong>
                <small>
                  {candidate.job.metadata.progress.resultCount} page(s) auteur
                  {advanced ? ` · ${advanced.processedMangaCount} manga(s) approfondi(s)` : ""}
                  {candidate.matchedNames.length
                    ? ` · correspond à ${candidate.matchedNames.join(", ")}`
                    : candidate.matchedByAuthorUrl
                      ? " · même page auteur"
                      : " · sélection manuelle"}
                </small>
                {candidate.automaticImportBlocked ? (
                  <em>Une alerte anti-emballement impose un import manuel.</em>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      {selectedCandidate && !selectedCandidate.automaticallyCompatible ? (
        <p className="existing-author-search-dialog__warning">
          Aucun auteur identique n’a été confirmé automatiquement. Vérifie le corpus avant de le lier.
        </p>
      ) : null}
      <label className="existing-author-search-dialog__refresh">
        <input
          type="checkbox"
          checked={autoRefreshOnCompletion}
          onChange={(event) => setAutoRefreshOnCompletion(event.target.checked)}
        />
        <span>
          <strong>Garder ce lien à jour automatiquement</strong>
          <small>Si cette recherche auteur est approfondie plus tard, le manga sera actualisé à sa fin.</small>
        </span>
      </label>
      {error ? <p className="manga-correspondence-dialog__error">{error}</p> : null}
      <div className="manga-correspondence-dialog__actions">
        <button type="button" className="secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" disabled={!selectedCandidate || submitting}>
          {submitting ? "Liaison…" : "Lier, importer et relancer"}
        </button>
      </div>
    </form>
  );
}
