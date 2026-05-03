import React from "react";
import ScraperCard, { type ScraperCardAction } from "@/renderer/components/ScraperCard/ScraperCard";
import LanguageFlags from "@/renderer/components/LanguageFlags/LanguageFlags";
import { getScraperBookmarkKey } from "@/renderer/stores/scraperBookmarks";
import type { Manga } from "@/renderer/types";
import { getLanguageLabel } from "@/renderer/components/MultiSearch/multiSearchUtils";
import type {
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import { findMangaLinkedToSource } from "@/renderer/utils/mangaSource";
import { buildRemoteThumbnailUrl } from "@/renderer/utils/remoteThumbnails";
import { formatScraperPageCountForDisplay } from "@/renderer/utils/scraperRuntime";
import "./card.scss";

type Props = {
  result: MultiSearchMergedResult;
  libraryMangas: Manga[];
  bookmarkedSourceKeys: Set<string>;
  onOpenSource: (source: MultiSearchSourceResult) => void;
  onOpenSourceInWorkspace: (source: MultiSearchSourceResult) => void;
};

const formatValues = (values: string[], fallback: string): string => (
  values.length ? values.join(", ") : fallback
);

const getSourceLanguageTitle = (source: MultiSearchSourceResult): string => (
  source.sourceLanguageCodes.length
    ? source.sourceLanguageCodes.map(getLanguageLabel).join(", ")
    : "Non renseignee"
);

const formatMatchedSourceCount = (count: number): string => (
  count > 1 ? ` x${count}` : ""
);

const closeDetails = (details: HTMLDetailsElement | null) => {
  if (details) {
    details.open = false;
  }
};

type CoverCandidate = {
  url?: string | null;
  refererUrl?: string | null;
};

const uniqueCoverUrls = (values: CoverCandidate[]): string[] => {
  const seen = new Set<string>();

  return values.reduce<string[]>((items, value) => {
    const normalized = value.url?.trim();
    if (!normalized || seen.has(normalized)) {
      return items;
    }

    seen.add(normalized);
    const thumbnailUrl = buildRemoteThumbnailUrl(normalized, value.refererUrl);
    if (thumbnailUrl && !seen.has(thumbnailUrl)) {
      seen.add(thumbnailUrl);
      items.push(thumbnailUrl);
    }

    items.push(normalized);
    return items;
  }, []);
};

export default function MultiSearchResultCard({
  result,
  libraryMangas,
  bookmarkedSourceKeys,
  onOpenSource,
  onOpenSourceInWorkspace,
}: Props) {
  const sourceMenuRef = React.useRef<HTMLDetailsElement>(null);
  const openMenuRef = React.useRef<HTMLDetailsElement>(null);
  const coverUrls = React.useMemo(() => uniqueCoverUrls([
    {
      url: result.coverUrl,
      refererUrl: result.sources[0]?.result.detailUrl || result.sources[0]?.scraper.baseUrl,
    },
    ...result.sources.map((source) => ({
      url: source.result.thumbnailUrl,
      refererUrl: source.result.detailUrl || source.scraper.baseUrl,
    })),
  ]), [result.coverUrl, result.sources]);
  const coverUrlsKey = coverUrls.join("\n");
  const [coverIndex, setCoverIndex] = React.useState(0);
  const activeCoverUrl = coverIndex < coverUrls.length ? coverUrls[coverIndex] : undefined;
  const languageLabels = result.sourceLanguageCodes.map(getLanguageLabel);
  const pageCountLabel = formatScraperPageCountForDisplay(result.pageCount);
  const sourceAvailability = React.useMemo(() => (
    result.sources.map((source) => {
      const sourceUrl = source.result.detailUrl || "";
      const bookmarkKey = getScraperBookmarkKey(source.scraper.id, sourceUrl);

      return {
        inLibrary: Boolean(sourceUrl && findMangaLinkedToSource(libraryMangas, {
          scraperId: source.scraper.id,
          sourceUrl,
        })),
        inBookmarks: Boolean(bookmarkKey && bookmarkedSourceKeys.has(bookmarkKey)),
      };
    })
  ), [bookmarkedSourceKeys, libraryMangas, result.sources]);
  const librarySourceCount = sourceAvailability.filter((availability) => availability.inLibrary).length;
  const bookmarkSourceCount = sourceAvailability.filter((availability) => availability.inBookmarks).length;
  const scraperSourceCounts = Array.from(
    result.sources.reduce<Map<string, { id: string; name: string; count: number }>>((counts, source) => {
      const current = counts.get(source.scraper.id);
      counts.set(source.scraper.id, {
        id: source.scraper.id,
        name: source.scraper.name,
        count: (current?.count ?? 0) + 1,
      });
      return counts;
    }, new Map()).values(),
  );
  const metadata = (
    <div className="multi-search-card__metadata">
      <span title={formatValues(languageLabels, "Non renseignee")}>
        Langues : <LanguageFlags languageCodes={result.sourceLanguageCodes} />
      </span>
      <span>Types : {formatValues(result.contentTypes, "Non renseigne")}</span>
      {pageCountLabel ? <span>{pageCountLabel}</span> : null}
      {librarySourceCount ? (
        <span className="multi-search-card__state-badge is-library">
          Bibliotheque{formatMatchedSourceCount(librarySourceCount)}
        </span>
      ) : null}
      {bookmarkSourceCount ? (
        <span className="multi-search-card__state-badge is-bookmark">
          Bookmark{formatMatchedSourceCount(bookmarkSourceCount)}
        </span>
      ) : null}
      <span>{result.sources.length} source(s) trouvee(s)</span>
      {result.sources.length > 1 ? (
        <details ref={sourceMenuRef} className="multi-search-card__source-menu">
          <summary className="multi-search-card__source-trigger">
            Scrappers : {scraperSourceCounts.length}
          </summary>
          <div className="multi-search-card__source-popover">
            {result.sources.map((source, index) => {
              const availability = sourceAvailability[index];

              return (
                <div
                  key={`${source.scraper.id}-${source.result.detailUrl || source.result.title}-${index}`}
                  className="multi-search-card__source-row"
                >
                  <div>
                    <strong>{source.scraper.name}</strong>
                    <span title={getSourceLanguageTitle(source)}>
                      <LanguageFlags languageCodes={source.sourceLanguageCodes} />
                    </span>
                  </div>
                  <div className="multi-search-card__source-states">
                    {availability?.inLibrary ? <span className="is-library">Bibliotheque</span> : null}
                    {availability?.inBookmarks ? <span className="is-bookmark">Bookmark</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      ) : scraperSourceCounts[0] ? (
        <span className="multi-search-card__source-inline">{scraperSourceCounts[0].name}</span>
      ) : null}
    </div>
  );
  const actions: ScraperCardAction[] = [];

  React.useEffect(() => {
    setCoverIndex(0);
  }, [coverUrlsKey]);

  React.useEffect(() => {
    const closeMenusOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      [sourceMenuRef.current, openMenuRef.current].forEach((details) => {
        if (details?.open && !details.contains(target)) {
          closeDetails(details);
        }
      });
    };

    document.addEventListener("pointerdown", closeMenusOnOutsideClick, true);
    return () => document.removeEventListener("pointerdown", closeMenusOnOutsideClick, true);
  }, []);

  if (result.sources.length === 1) {
    const source = result.sources[0];
    actions.push({
      id: "open-source",
      type: "primary",
      label: source.canOpenDetails ? `Ouvrir sur ${source.scraper.name}` : "Ouvrir le lien",
      onClick: () => onOpenSource(source),
      onMiddleClick: () => onOpenSourceInWorkspace(source),
      disabled: !source.result.detailUrl,
    });
  } else {
    actions.push({
      id: "open-source-menu",
      type: "custom",
      label: "Ouvrir avec",
      render: () => (
        <details ref={openMenuRef} className="multi-search-card__open-menu">
          <summary className="multi-search-card__open-trigger">
            Ouvrir avec...
          </summary>
          <div className="multi-search-card__open-options">
            {result.sources.map((source, index) => (
              <button
                key={`${source.scraper.id}-${source.result.detailUrl || source.result.title}-${index}`}
                type="button"
                onClick={() => {
                  closeDetails(openMenuRef.current);
                  onOpenSource(source);
                }}
                onMouseDown={(event) => {
                  if (event.button !== 1) {
                    return;
                  }

                  event.preventDefault();
                  event.stopPropagation();
                }}
                onAuxClick={(event) => {
                  if (event.button !== 1) {
                    return;
                  }

                  event.preventDefault();
                  event.stopPropagation();
                  closeDetails(openMenuRef.current);
                  onOpenSourceInWorkspace(source);
                }}
                disabled={!source.result.detailUrl}
                data-prevent-middle-click-autoscroll="true"
              >
                <strong>{source.scraper.name}</strong>
                <span title={getSourceLanguageTitle(source)}>
                  <LanguageFlags languageCodes={source.sourceLanguageCodes} />
                </span>
              </button>
            ))}
          </div>
        </details>
      ),
    });
  }

  return (
    <ScraperCard
      title={result.title}
      coverUrl={activeCoverUrl}
      coverAlt={result.title}
      summary={result.summary}
      metadata={metadata}
      actions={actions}
      className={result.sources.length > 1 ? "is-merged" : ""}
      isActionable={result.sources.length === 1 && Boolean(result.sources[0].result.detailUrl)}
      onClick={result.sources.length === 1 ? () => onOpenSource(result.sources[0]) : undefined}
      onMiddleClick={result.sources.length === 1 ? () => onOpenSourceInWorkspace(result.sources[0]) : undefined}
      onCoverError={() => setCoverIndex((currentIndex) => currentIndex + 1)}
      aria-label={result.sources.length === 1 ? `Ouvrir ${result.title}` : undefined}
    />
  );
}
