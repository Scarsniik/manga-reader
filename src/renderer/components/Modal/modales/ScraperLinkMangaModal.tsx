import React, { FormEvent, useState } from "react";
import { ModalOptions } from "@/renderer/context/ModalContext";
import { useModal } from "@/renderer/hooks/useModal";
import ScraperLinkMangaPicker from "@/renderer/components/ScraperLinkMangaPicker/ScraperLinkMangaPicker";
import { Manga } from "@/renderer/types";

type BuildScraperLinkMangaModalOptions = {
  mangas: Manga[];
  scraperId: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceChapterUrl?: string | null;
  sourceChapterLabel?: string | null;
  currentLinkedMangaId?: string | null;
  onLinked?: () => void;
};

export default function buildScraperLinkMangaModal({
  mangas,
  scraperId,
  sourceUrl,
  sourceTitle,
  sourceChapterUrl = null,
  sourceChapterLabel = null,
  currentLinkedMangaId = null,
  onLinked,
}: BuildScraperLinkMangaModalOptions): ModalOptions {
  const LinkMangaContent: React.FC = () => {
    const { closeModal } = useModal();
    const [selectedMangaId, setSelectedMangaId] = useState(currentLinkedMangaId || "");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (event: FormEvent) => {
      event.preventDefault();

      const selectedManga = mangas.find((manga) => manga.id === selectedMangaId) ?? null;
      if (!selectedManga) {
        setError("Selectionne un manga a lier.");
        return;
      }

      if (!window.api || typeof window.api.updateManga !== "function") {
        setError("La mise a jour de la bibliotheque est indisponible.");
        return;
      }

      setSubmitting(true);
      setError(null);

      try {
        if (currentLinkedMangaId && currentLinkedMangaId !== selectedManga.id) {
          await window.api.updateManga({
            id: currentLinkedMangaId,
            sourceKind: "library",
            scraperId: null,
            sourceUrl: null,
            sourceChapterUrl: null,
            sourceChapterLabel: null,
          });
        }

        await window.api.updateManga({
          id: selectedManga.id,
          sourceKind: "scraper",
          scraperId,
          sourceUrl,
          sourceChapterUrl: sourceChapterUrl || null,
          sourceChapterLabel: sourceChapterLabel || null,
        });
        window.dispatchEvent(new CustomEvent("mangas-updated"));
        onLinked?.();
        closeModal();
      } catch (err) {
        console.error("Failed to link scraper source to manga", err);
        setError("Impossible de lier cette fiche au manga selectionne.");
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <form className="mh-form" onSubmit={handleSubmit}>
        <p>
          Source: <strong>{sourceTitle}</strong>
        </p>

        {sourceChapterLabel ? (
          <p>
            Chapitre: <strong>{sourceChapterLabel}</strong>
          </p>
        ) : null}

        <ScraperLinkMangaPicker
          mangas={mangas}
          selectedMangaId={selectedMangaId}
          initialQuery={sourceTitle === sourceUrl ? "" : sourceTitle}
          disabled={submitting}
          onSelect={setSelectedMangaId}
        />

        {mangas.length === 0 ? (
          <div className="mh-form__global-error">Aucun manga local disponible.</div>
        ) : null}

        {error ? <div className="mh-form__global-error">{error}</div> : null}

        <div className="mh-form__actions">
          <button type="button" onClick={closeModal} disabled={submitting}>
            Annuler
          </button>
          <button type="submit" disabled={submitting || mangas.length === 0 || !selectedMangaId}>
            {submitting ? "Liaison..." : "Valider"}
          </button>
        </div>
      </form>
    );
  };

  return {
    title: currentLinkedMangaId ? "Changer le manga lie" : "Lier a un manga existant",
    content: <LinkMangaContent />,
    className: "scraper-link-manga-modal",
  };
}
