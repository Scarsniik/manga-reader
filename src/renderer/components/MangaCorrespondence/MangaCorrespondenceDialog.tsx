import React, { useEffect, useMemo, useState } from "react";
import type { MangaCorrespondenceRequest, MangaCorrespondenceStrategy } from "@/shared/backgroundSearch";
import type { ScraperRecord } from "@/shared/scraper";
import { enqueueBackgroundSearch } from "@/renderer/backgroundSearch/backgroundSearchClient";
import useParams from "@/renderer/hooks/useParams";
import {
  buildMangaCorrespondenceTitleInput,
  parseMangaCorrespondenceTitleInput,
} from "@/renderer/components/MangaCorrespondence/mangaCorrespondenceTitleInput";
import { buildMangaCorrespondenceInput } from "@/renderer/components/MangaCorrespondence/mangaCorrespondenceInput";
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
  const initialTitles = useMemo(
    () => Array.from(new Set([initialTitle, ...initialAlternativeTitles])).filter(Boolean),
    [initialAlternativeTitles, initialTitle],
  );
  const [titleInput, setTitleInput] = useState(
    () => buildMangaCorrespondenceTitleInput(initialTitle, initialAlternativeTitles),
  );
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

  const enteredTitles = useMemo(
    () => parseMangaCorrespondenceTitleInput(titleInput, initialTitles),
    [initialTitles, titleInput],
  );
  const canSubmit = useMemo(
    () => Boolean(enteredTitles.length && scrapers.length && !submitting),
    [enteredTitles.length, scrapers.length, submitting],
  );
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const [enteredTitle, ...enteredAlternativeTitles] = enteredTitles;
      const input = buildMangaCorrespondenceInput({
        params,
        reference: {
          scraperId,
          sourceUrl,
          rawTitle,
          title: enteredTitle,
          alternativeTitles: enteredAlternativeTitles,
          authors: normalizeList(authors),
          authorUrls: initialAuthorUrls,
          chapter: chapter.trim() || undefined,
        },
        scrapers,
        request,
        strategy,
      });
      await enqueueBackgroundSearch({
        input,
        kind: "mangaCorrespondence",
        params,
        primaryTerm: enteredTitle,
        title: `Correspondances · ${enteredTitle}`,
      });
      onQueued(`Recherche de correspondances lancée pour « ${enteredTitles.join(", ")} ».`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Impossible de lancer la recherche.");
      setSubmitting(false);
    }
  };

  return (
    <form className="manga-correspondence-dialog" onSubmit={submit}>
      <div className="manga-correspondence-dialog__grid">
        <label className="manga-correspondence-dialog__wide"><span>Nom(s)</span><input value={titleInput} onChange={(event) => setTitleInput(event.target.value)} placeholder="Titres séparés par une virgule" autoFocus /></label>
        <label><span>Auteur(s)</span><input value={authors} onChange={(event) => setAuthors(event.target.value)} placeholder="Séparés par une virgule" /></label>
        <label><span>Chapitre</span><input value={chapter} onChange={(event) => setChapter(event.target.value)} /></label>
        <label><span>Demande</span><select value={request} onChange={(event) => setRequest(event.target.value as MangaCorrespondenceRequest)}><option value="otherChapters">Trouver les autres chapitres</option><option value="sameManga">Trouver ce même manga</option></select></label>
        <label className="manga-correspondence-dialog__wide"><span>Ordre d’exploration</span><select value={strategy} onChange={(event) => setStrategy(event.target.value as MangaCorrespondenceStrategy)}><option value="balanced">Équilibré</option><option value="titleFirst">Titres en priorité</option><option value="authorFirst">Auteurs en priorité</option></select></label>
      </div>
      <p className="manga-correspondence-dialog__hint">Chaque titre séparé par une virgule est recherché individuellement en arrière-plan, dans la limite globale de scrapings configurée.</p>
      {error ? <p className="manga-correspondence-dialog__error">{error}</p> : null}
      <div className="manga-correspondence-dialog__actions">
        <button type="button" className="secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" disabled={!canSubmit}>{submitting ? "Lancement…" : "Lancer en arrière-plan"}</button>
      </div>
    </form>
  );
}
