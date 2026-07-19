import React, { useEffect, useMemo, useState } from "react";
import type {
  MangaCorrespondenceBackgroundInput,
  MangaCorrespondenceRequest,
  MangaCorrespondenceStrategy,
} from "@/shared/backgroundSearch";
import type { ScraperRecord } from "@/shared/scraper";
import { enqueueBackgroundSearch } from "@/renderer/backgroundSearch/backgroundSearchClient";
import { getDepthPages } from "@/renderer/components/MultiSearch/MultiSearchControls";
import type { MultiSearchAdvancedPages, MultiSearchDepthMode, MultiSearchPaceMode } from "@/renderer/components/MultiSearch/types";
import useParams from "@/renderer/hooks/useParams";
import "./style.scss";

type Props = {
  scraperId: string;
  sourceUrl: string;
  rawTitle: string;
  initialTitle: string;
  initialAlternativeTitles: string[];
  initialAuthors: string[];
  initialAuthorUrls: string[];
  initialChapter?: string;
  onCancel: () => void;
  onQueued: (message: string) => void;
};

const normalizeList = (value: string): string[] => Array.from(new Set(
  value.split(/[,;\n]+/g).map((entry) => entry.trim()).filter(Boolean),
));

export default function MangaCorrespondenceDialog({
  scraperId,
  sourceUrl,
  rawTitle,
  initialTitle,
  initialAlternativeTitles,
  initialAuthors,
  initialAuthorUrls,
  initialChapter,
  onCancel,
  onQueued,
}: Props) {
  const { params } = useParams();
  const [title, setTitle] = useState(initialTitle);
  const [authors, setAuthors] = useState(initialAuthors.join(", "));
  const [chapter, setChapter] = useState(initialChapter ?? "");
  const [request, setRequest] = useState<MangaCorrespondenceRequest>("otherChapters");
  const [strategy, setStrategy] = useState<MangaCorrespondenceStrategy>("balanced");
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

  const canSubmit = useMemo(() => Boolean(title.trim() && scrapers.length && !submitting), [scrapers.length, submitting, title]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const configuredDepthMode = params?.multiSearchDepthMode;
      const depthMode = (typeof configuredDepthMode === "string" && ["quick", "extended", "advanced"].includes(configuredDepthMode)
        ? configuredDepthMode
        : "quick") as MultiSearchDepthMode;
      const advancedPages = (params?.multiSearchAdvancedPages ?? 3) as MultiSearchAdvancedPages;
      const paceMode = (params?.multiSearchPaceMode === "careful" ? "careful" : "fast") as MultiSearchPaceMode;
      const input: MangaCorrespondenceBackgroundInput = {
        reference: {
          scraperId,
          sourceUrl,
          rawTitle,
          title: title.trim(),
          alternativeTitles: Array.from(new Set([title.trim(), ...initialAlternativeTitles])).filter(Boolean),
          authors: normalizeList(authors),
          authorUrls: initialAuthorUrls,
          chapter: chapter.trim() || undefined,
        },
        request,
        strategy,
        scraperFilterValues: params?.multiSearchSelectedScraperIds ?? [],
        scrapers,
        maxPages: getDepthPages(depthMode, advancedPages),
        paceMode,
        scrapingConcurrency: Math.max(1, Math.floor(params?.scraperLatestConcurrency ?? 3)),
        scrapeDetailsWithCards: params?.multiSearchScrapeDetailsWithCards === true,
        enableRomajiPhoneticMerge: params?.multiSearchEnableRomajiPhoneticMerge === true,
      };
      await enqueueBackgroundSearch({
        input,
        kind: "mangaCorrespondence",
        params,
        primaryTerm: title.trim(),
        title: `Correspondances · ${title.trim()}`,
      });
      onQueued(`Recherche de correspondances lancée pour « ${title.trim()} ».`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Impossible de lancer la recherche.");
      setSubmitting(false);
    }
  };

  return (
    <form className="manga-correspondence-dialog" onSubmit={submit}>
      <div className="manga-correspondence-dialog__grid">
        <label><span>Nom</span><input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus /></label>
        <label><span>Auteur(s)</span><input value={authors} onChange={(event) => setAuthors(event.target.value)} placeholder="Séparés par une virgule" /></label>
        <label><span>Chapitre</span><input value={chapter} onChange={(event) => setChapter(event.target.value)} /></label>
        <label><span>Demande</span><select value={request} onChange={(event) => setRequest(event.target.value as MangaCorrespondenceRequest)}><option value="otherChapters">Trouver les autres chapitres</option><option value="sameManga">Trouver ce même manga</option></select></label>
        <label className="manga-correspondence-dialog__wide"><span>Ordre d’exploration</span><select value={strategy} onChange={(event) => setStrategy(event.target.value as MangaCorrespondenceStrategy)}><option value="balanced">Équilibré</option><option value="titleFirst">Titres en priorité</option><option value="authorFirst">Auteurs en priorité</option></select></label>
      </div>
      <p className="manga-correspondence-dialog__hint">La recherche s’exécute en arrière-plan et respecte la limite de scrapings simultanés des paramètres.</p>
      {error ? <p className="manga-correspondence-dialog__error">{error}</p> : null}
      <div className="manga-correspondence-dialog__actions">
        <button type="button" className="secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" disabled={!canSubmit}>{submitting ? "Lancement…" : "Lancer en arrière-plan"}</button>
      </div>
    </form>
  );
}
