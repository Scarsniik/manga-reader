import React from "react";
import ScraperCard, { type ScraperCardAction } from "@/renderer/components/ScraperCard/ScraperCard";
import {
  getLanguageLabel,
} from "@/renderer/components/MultiSearch/multiSearchUtils";
import type {
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import { formatScraperPageCountForDisplay } from "@/renderer/utils/scraperRuntime";
import "./card.scss";

type Props = {
  result: MultiSearchMergedResult;
  onOpenSource: (source: MultiSearchSourceResult) => void;
  onOpenSourceInWorkspace: (source: MultiSearchSourceResult) => void;
};

const formatValues = (values: string[], fallback: string): string => (
  values.length ? values.join(", ") : fallback
);

const getSourceLanguageLabel = (source: MultiSearchSourceResult): string => (
  source.sourceLanguageCodes.length
    ? source.sourceLanguageCodes.map(getLanguageLabel).join(", ")
    : "Non renseignee"
);

const uniqueCoverUrls = (values: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();

  return values.reduce<string[]>((items, value) => {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) {
      return items;
    }

    seen.add(normalized);
    items.push(normalized);
    return items;
  }, []);
};

export default function MultiSearchResultCard({
  result,
  onOpenSource,
  onOpenSourceInWorkspace,
}: Props) {
  const coverUrls = React.useMemo(() => uniqueCoverUrls([
    result.coverUrl,
    ...result.sources.map((source) => source.result.thumbnailUrl),
  ]), [result.coverUrl, result.sources]);
  const coverUrlsKey = coverUrls.join("\n");
  const [coverIndex, setCoverIndex] = React.useState(0);
  const activeCoverUrl = coverIndex < coverUrls.length ? coverUrls[coverIndex] : undefined;
  const languageLabels = result.sourceLanguageCodes.map(getLanguageLabel);
  const pageCountLabel = formatScraperPageCountForDisplay(result.pageCount);
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
      <span>Langues : {formatValues(languageLabels, "Non renseignee")}</span>
      <span>Types : {formatValues(result.contentTypes, "Non renseigne")}</span>
      {pageCountLabel ? <span>{pageCountLabel}</span> : null}
      <span>{result.sources.length} source(s) trouvee(s)</span>
      <div className="multi-search-card__sources">
        {scraperSourceCounts.map((sourceCount) => (
          <span key={sourceCount.id}>
            {sourceCount.name}{sourceCount.count > 1 ? ` x${sourceCount.count}` : ""}
          </span>
        ))}
      </div>
    </div>
  );
  const actions: ScraperCardAction[] = [];

  React.useEffect(() => {
    setCoverIndex(0);
  }, [coverUrlsKey]);

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
        <details className="multi-search-card__open-menu">
          <summary>Ouvrir avec...</summary>
          <div className="multi-search-card__open-options">
            {result.sources.map((source, index) => (
              <button
                key={`${source.scraper.id}-${source.result.detailUrl || source.result.title}-${index}`}
                type="button"
                onClick={() => onOpenSource(source)}
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
                  onOpenSourceInWorkspace(source);
                }}
                disabled={!source.result.detailUrl}
                data-prevent-middle-click-autoscroll="true"
              >
                <strong>{source.scraper.name}</strong>
                <span>{getSourceLanguageLabel(source)}</span>
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
