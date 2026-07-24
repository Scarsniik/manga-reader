import React, { useEffect, useMemo, useState } from "react";
import type {
  AuthorCorrespondenceBackgroundInput,
  AuthorCorrespondenceReferenceSource,
} from "@/shared/backgroundSearch";
import type { ScraperRecord } from "@/shared/scraper";
import { enqueueBackgroundSearch } from "@/renderer/backgroundSearch/backgroundSearchClient";
import { getDepthPages } from "@/renderer/components/MultiSearch/MultiSearchControls";
import type {
  MultiSearchAdvancedPages,
  MultiSearchDepthMode,
  MultiSearchPaceMode,
} from "@/renderer/components/MultiSearch/types";
import useParams from "@/renderer/hooks/useParams";
import "@/renderer/components/MangaCorrespondence/style.scss";

type Props = {
  initialName: string;
  initialNames: string[];
  referenceSources: AuthorCorrespondenceReferenceSource[];
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
  onCancel,
  onQueued,
}: Props) {
  const { params } = useParams();
  const [name, setName] = useState(initialName);
  const [otherNames, setOtherNames] = useState(initialNames.filter((entry) => entry !== initialName).join(", "));
  const [scrapers, setScrapers] = useState<ScraperRecord[]>([]);
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

  const canSubmit = useMemo(() => Boolean(name.trim() && scrapers.length && !submitting), [name, scrapers.length, submitting]);
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
        scraperFilterValues: params?.multiSearchSelectedScraperIds ?? [],
        scrapers,
        maxPages: getDepthPages(depthMode, advancedPages),
        paceMode,
        scrapingConcurrency: Math.max(1, Math.floor(params?.scraperLatestConcurrency ?? 3)),
        scrapeDetailsWithCards: params?.multiSearchScrapeDetailsWithCards === true,
      };
      await enqueueBackgroundSearch({
        input,
        kind: "authorCorrespondence",
        params,
        primaryTerm: name.trim(),
        title: `Correspondances auteur · ${name.trim()}`,
      });
      onQueued(`Recherche de correspondances auteur lancée pour « ${name.trim()} ».`);
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
      <p className="manga-correspondence-dialog__hint">La recherche parcourt les résultats multi-sources, en extrait les auteurs et teste directement les modules Auteur compatibles.</p>
      {error ? <p className="manga-correspondence-dialog__error">{error}</p> : null}
      <div className="manga-correspondence-dialog__actions">
        <button type="button" className="secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" disabled={!canSubmit}>{submitting ? "Lancement…" : "Lancer en arrière-plan"}</button>
      </div>
    </form>
  );
}
