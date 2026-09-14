import React, { useEffect, useMemo, useState } from "react";
import type {
  AuthorCorrespondenceBackgroundInput,
  AuthorCorrespondenceReferenceSource,
} from "@/shared/backgroundSearch";
import { DEFAULT_AUTHOR_CORRESPONDENCE_ADVANCED_BATCH_SIZE } from "@/shared/backgroundSearch";
import type { ScraperRecord } from "@/shared/scraper";
import { enqueueBackgroundSearch } from "@/renderer/backgroundSearch/backgroundSearchClient";
import { getDepthPages } from "@/renderer/components/MultiSearch/MultiSearchControls";
import type {
  MultiSearchAdvancedPages,
  MultiSearchDepthMode,
  MultiSearchPaceMode,
} from "@/renderer/components/MultiSearch/types";
import useParams from "@/renderer/hooks/useParams";
import { buildMangaCorrespondenceSafetySettings } from "@/shared/mangaCorrespondenceSafetySettings";
import "@/renderer/components/MangaCorrespondence/style.scss";

type Props = {
  initialName: string;
  initialNames: string[];
  referenceSources: AuthorCorrespondenceReferenceSource[];
  mangaSeed?: AuthorCorrespondenceBackgroundInput["mangaSeed"];
  linkedMangaJobId?: string;
  initialAdvancedSearchEnabled?: boolean;
  onCancel: () => void;
  onQueued: (message: string) => void;
};

const normalizeList = (value: string): string[] => Array.from(new Set(
  value.split(/[,;\n]+/g).map((entry) => entry.trim()).filter(Boolean),
));

export default function AuthorCorrespondenceDialog({
  initialName,
  initialNames,
  referenceSources,
  mangaSeed,
  linkedMangaJobId,
  initialAdvancedSearchEnabled = false,
  onCancel,
  onQueued,
}: Props) {
  const { params } = useParams();
  const [name, setName] = useState(initialName);
  const [otherNames, setOtherNames] = useState(initialNames.filter((entry) => entry !== initialName).join(", "));
  const [scrapers, setScrapers] = useState<ScraperRecord[]>([]);
  const [advancedSearchEnabled, setAdvancedSearchEnabled] = useState(initialAdvancedSearchEnabled);
  const [advancedMangaCount, setAdvancedMangaCount] = useState(
    DEFAULT_AUTHOR_CORRESPONDENCE_ADVANCED_BATCH_SIZE,
  );
  const [autoImportOnCompletion, setAutoImportOnCompletion] = useState(Boolean(linkedMangaJobId));
  const [blockAutomaticImportOnSafetyWarning, setBlockAutomaticImportOnSafetyWarning] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    void window.api.getScrapers().then((records: ScraperRecord[]) => {
      if (!disposed) setScrapers(Array.isArray(records) ? records : []);
    }).catch((loadError: unknown) => {
      if (!disposed) setError(loadError instanceof Error ? loadError.message : "Impossible de charger les scrappers.");
    });
    return () => { disposed = true; };
  }, []);

  const canSubmit = useMemo(() => Boolean(
    (name.trim() || mangaSeed) && scrapers.length && !submitting
  ), [mangaSeed, name, scrapers.length, submitting]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const depthMode = (["quick", "extended", "advanced"].includes(params?.multiSearchDepthMode ?? "")
        ? params?.multiSearchDepthMode
        : "quick") as MultiSearchDepthMode;
      const advancedPages = (params?.multiSearchAdvancedPages ?? 3) as MultiSearchAdvancedPages;
      const paceMode = (params?.multiSearchPaceMode === "careful" ? "careful" : "fast") as MultiSearchPaceMode;
      const input: AuthorCorrespondenceBackgroundInput = {
        referenceName: name.trim(),
        names: Array.from(new Set([name.trim(), ...normalizeList(otherNames)])),
        referenceSources,
        scraperFilterValues: [],
        scrapers,
        maxPages: getDepthPages(depthMode, advancedPages),
        authorPageCount: Math.max(1, Math.floor(params?.scraperAuthorFavoritePageCount ?? 1)),
        paceMode,
        scrapingConcurrency: Math.max(1, Math.floor(params?.scraperLatestConcurrency ?? 3)),
        scrapeDetailsWithCards: params?.multiSearchScrapeDetailsWithCards === true,
        advancedSearch: advancedSearchEnabled ? {
          enabled: true,
          batchSize: Math.max(0, Math.floor(advancedMangaCount)),
          requestedBatchCount: 1,
          enableRomajiPhoneticMerge: params?.multiSearchEnableRomajiPhoneticMerge === true,
        } : undefined,
        mangaSeed,
        correspondenceSafety: buildMangaCorrespondenceSafetySettings(params),
      };
      const primaryTerm = name.trim() || mangaSeed?.reference.title || "Auteur inconnu";
      await enqueueBackgroundSearch({
        input,
        kind: "authorCorrespondence",
        params,
        primaryTerm,
        title: `Correspondances auteur · ${primaryTerm}`,
        ...(linkedMangaJobId ? {
          relation: {
            kind: "authorExpansion",
            parentJobId: linkedMangaJobId,
            autoImportOnCompletion,
            blockAutomaticImportOnSafetyWarning,
          },
        } : {}),
      });
      onQueued(name.trim()
        ? `Recherche de correspondances auteur lancée pour « ${name.trim()} ».`
        : `Recherche de l’auteur lancée à partir de « ${primaryTerm} ».`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Impossible de lancer la recherche.");
      setSubmitting(false);
    }
  };

  return (
    <form className="manga-correspondence-dialog" onSubmit={submit}>
      <div className="manga-correspondence-dialog__grid">
        <label><span>Nom de l’auteur</span><input value={name} onChange={(event) => setName(event.target.value)} autoFocus /></label>
        <label><span>Autres noms</span><input value={otherNames} onChange={(event) => setOtherNames(event.target.value)} placeholder="Séparés par une virgule" /></label>
      </div>
      <p className="manga-correspondence-dialog__hint">
        {name.trim()
          ? "La recherche parcourt les résultats multi-sources, en extrait les auteurs et teste directement les modules Auteur compatibles."
          : "Aucun auteur n’a été détecté sur la fiche. La recherche retrouvera d’abord ce manga sur les autres sources, extraira un auteur fiable, puis cherchera ses pages correspondantes."}
      </p>
      <label className="manga-correspondence-dialog__advanced-toggle">
        <input
          type="checkbox"
          checked={advancedSearchEnabled}
          onChange={(event) => setAdvancedSearchEnabled(event.target.checked)}
        />
        <span>
          <strong>Recherche poussée</strong>
          <small>
            Analyse les mangas les plus présents pour découvrir d’autres pages auteur.
          </small>
        </span>
      </label>
      {advancedSearchEnabled ? (
        <label className="manga-correspondence-dialog__advanced-count">
          <span>Mangas à approfondir</span>
          <input
            type="number"
            min="0"
            step="1"
            value={advancedMangaCount}
            onChange={(event) => setAdvancedMangaCount(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
          />
          <small>0 analyse tous les mangas disponibles.</small>
        </label>
      ) : null}
      {linkedMangaJobId ? (
        <div className="manga-correspondence-dialog__linked-options">
          <label>
            <input
              type="checkbox"
              checked={autoImportOnCompletion}
              onChange={(event) => setAutoImportOnCompletion(event.target.checked)}
            />
            <span>
              <strong>Mettre à jour automatiquement la recherche manga</strong>
              <small>À la fin, importe le corpus collecté puis relance la recherche manga liée.</small>
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={blockAutomaticImportOnSafetyWarning}
              disabled={!autoImportOnCompletion}
              onChange={(event) => setBlockAutomaticImportOnSafetyWarning(event.target.checked)}
            />
            <span>
              <strong>Bloquer en cas d’alerte anti-emballement</strong>
              <small>L’import manuel restera disponible depuis la recherche manga.</small>
            </span>
          </label>
        </div>
      ) : null}
      {error ? <p className="manga-correspondence-dialog__error">{error}</p> : null}
      <div className="manga-correspondence-dialog__actions">
        <button type="button" className="secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" disabled={!canSubmit}>{submitting ? "Lancement…" : "Lancer en arrière-plan"}</button>
      </div>
    </form>
  );
}
