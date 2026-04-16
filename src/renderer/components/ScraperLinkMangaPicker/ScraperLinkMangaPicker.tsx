import React, { useMemo, useState } from "react";
import { Manga } from "@/renderer/types";
import "@/renderer/components/ScraperLinkMangaPicker/style.scss";

type Props = {
  mangas: Manga[];
  selectedMangaId: string;
  initialQuery?: string;
  disabled?: boolean;
  onSelect: (mangaId: string) => void;
};

const buildMangaLabel = (manga: Manga): string => {
  const chapterLabel = typeof manga.chapters === "string" && manga.chapters.trim().length > 0
    ? ` - ${manga.chapters.trim()}`
    : "";

  return `${manga.title}${chapterLabel}`;
};

const normalizeCoverSrc = (thumbnailPath?: string | null): string | null => {
  if (!thumbnailPath) {
    return null;
  }

  if (thumbnailPath.startsWith("local://")) {
    return thumbnailPath;
  }

  if (thumbnailPath.startsWith("file://")) {
    return thumbnailPath.replace(/^file:\/\//, "local://");
  }

  if (/^[A-Za-z]:\\/.test(thumbnailPath)) {
    return `local:///${thumbnailPath.replace(/\\/g, "/")}`;
  }

  if (thumbnailPath.startsWith("/")) {
    return `local://${thumbnailPath}`;
  }

  return `local://${thumbnailPath.replace(/\\/g, "/")}`;
};

const getMangaSearchText = (manga: Manga): string => [
  manga.title,
  manga.chapters,
  manga.path,
].filter(Boolean).join(" ").toLowerCase();

export default function ScraperLinkMangaPicker({
  mangas,
  selectedMangaId,
  initialQuery = "",
  disabled = false,
  onSelect,
}: Props) {
  const [query, setQuery] = useState(initialQuery);

  const sortedMangas = useMemo(
    () => [...mangas].sort((left, right) => buildMangaLabel(left).localeCompare(buildMangaLabel(right))),
    [mangas],
  );

  const filteredMangas = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return sortedMangas;
    }

    return sortedMangas.filter((manga) => getMangaSearchText(manga).includes(normalizedQuery));
  }, [query, sortedMangas]);

  return (
    <div className="scraper-link-manga-picker">
      <label className="scraper-link-manga-picker__search">
        <span>Rechercher dans la bibliotheque</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Titre, chapitre, dossier..."
          disabled={disabled}
        />
      </label>

      {filteredMangas.length === 0 ? (
        <div className="scraper-link-manga-picker__empty">
          Aucun manga ne correspond a cette recherche.
        </div>
      ) : (
        <div className="scraper-link-manga-picker__grid">
          {filteredMangas.map((manga) => {
            const isSelected = manga.id === selectedMangaId;
            const coverSrc = normalizeCoverSrc(manga.thumbnailPath);

            return (
              <button
                key={manga.id}
                type="button"
                className={[
                  "scraper-link-manga-picker__card",
                  isSelected ? "is-selected" : "",
                ].join(" ").trim()}
                onClick={() => onSelect(manga.id)}
                disabled={disabled}
                aria-pressed={isSelected}
              >
                <span className="scraper-link-manga-picker__cover">
                  {coverSrc ? (
                    <img src={coverSrc} alt={manga.title} />
                  ) : (
                    <span className="scraper-link-manga-picker__placeholder">Sans image</span>
                  )}
                </span>
                <span className="scraper-link-manga-picker__title">{manga.title}</span>
                {manga.chapters ? (
                  <span className="scraper-link-manga-picker__meta">{manga.chapters}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
