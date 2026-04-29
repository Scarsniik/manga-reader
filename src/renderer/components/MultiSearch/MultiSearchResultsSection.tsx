import React from "react";
import MultiSearchResultCard from "@/renderer/components/MultiSearch/MultiSearchResultCard";
import { DownloadArrowIcon } from "@/renderer/components/icons";
import type { Manga } from "@/renderer/types";
import type {
  MultiSearchMergedResult,
  MultiSearchScraperRun,
  MultiSearchSourceResult,
  MultiSearchViewMode,
} from "@/renderer/components/MultiSearch/types";
import { UNKNOWN_MULTI_SEARCH_VALUE } from "@/renderer/components/MultiSearch/multiSearchUtils";

type Props = {
  viewMode: MultiSearchViewMode;
  runs: MultiSearchScraperRun[];
  mergedResults: MultiSearchMergedResult[];
  sourceCount: number;
  libraryMangas: Manga[];
  bookmarkedSourceKeys: Set<string>;
  isExportingJson: boolean;
  showMergeReloadButton: boolean;
  onOpenSource: (source: MultiSearchSourceResult) => void;
  onOpenSourceInWorkspace: (source: MultiSearchSourceResult) => void;
  onExportJson: () => void;
  onExportMergedResultsJson: () => void;
  onReloadMerge: () => void;
};

const buildSingleSourceMergedResult = (source: MultiSearchSourceResult): MultiSearchMergedResult => ({
  id: `${source.scraper.id}-${source.result.detailUrl || source.result.title}`,
  title: source.result.title,
  coverUrl: source.result.thumbnailUrl,
  summary: source.result.summary,
  pageCount: source.result.pageCount,
  sources: [source],
  sourceLanguageCodes: source.sourceLanguageCodes.length ? source.sourceLanguageCodes : [UNKNOWN_MULTI_SEARCH_VALUE],
  tentativeAuthorNames: source.tentativeAuthorNames,
  contentTypes: source.contentTypes,
});

export default function MultiSearchResultsSection({
  viewMode,
  runs,
  mergedResults,
  sourceCount,
  libraryMangas,
  bookmarkedSourceKeys,
  isExportingJson,
  showMergeReloadButton,
  onOpenSource,
  onOpenSourceInWorkspace,
  onExportJson,
  onExportMergedResultsJson,
  onReloadMerge,
}: Props) {
  if (viewMode === "merged") {
    return (
      <section className="multi-search__results">
        <div className="multi-search__section-head">
          <div>
            <h3>Resultats fusionnes</h3>
            <p>{mergedResults.length} carte(s), {sourceCount} source(s) chargee(s).</p>
          </div>
          <div className="multi-search__section-actions">
            {showMergeReloadButton ? (
              <>
                <button
                  type="button"
                  className="multi-search__reload-merge-button"
                  onClick={onReloadMerge}
                  disabled={sourceCount === 0}
                  title="Recalculer la fusion depuis les resultats charges"
                >
                  Recharger fusion
                </button>
                <button
                  type="button"
                  className="multi-search__export-json-button"
                  onClick={onExportMergedResultsJson}
                  disabled={isExportingJson || sourceCount === 0}
                  title="Ouvrir seulement les mergedResults en JSON"
                >
                  <DownloadArrowIcon aria-hidden="true" focusable="false" />
                  <span>Merged JSON</span>
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="multi-search__export-json-button"
              onClick={onExportJson}
              disabled={isExportingJson || sourceCount === 0}
              title="Ouvrir les resultats JSON"
            >
              <DownloadArrowIcon aria-hidden="true" focusable="false" />
              <span>{isExportingJson ? "Ouverture..." : "JSON"}</span>
            </button>
          </div>
        </div>

        <div className="multi-search__results-grid">
          {mergedResults.map((result) => (
            <MultiSearchResultCard
              key={result.id}
              result={result}
              libraryMangas={libraryMangas}
              bookmarkedSourceKeys={bookmarkedSourceKeys}
              onOpenSource={onOpenSource}
              onOpenSourceInWorkspace={onOpenSourceInWorkspace}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="multi-search__results">
      <div className="multi-search__section-head">
        <div>
          <h3>Resultats par scrapper</h3>
          <p>{sourceCount} source(s) chargee(s) sans fusion.</p>
        </div>
        <div className="multi-search__section-actions">
          <button
            type="button"
            className="multi-search__export-json-button"
            onClick={onExportJson}
            disabled={isExportingJson || sourceCount === 0}
            title="Ouvrir les resultats JSON"
          >
            <DownloadArrowIcon aria-hidden="true" focusable="false" />
            <span>{isExportingJson ? "Ouverture..." : "JSON"}</span>
          </button>
        </div>
      </div>

      <div className="multi-search__by-scraper">
        {runs.map((run) => (
          <div key={run.scraper.id} className="multi-search__scraper-results">
            <h4>{run.scraper.name}</h4>
            <div className="multi-search__results-grid">
              {run.results.map((source) => (
                <MultiSearchResultCard
                  key={`${source.scraper.id}-${source.result.detailUrl || source.result.title}`}
                  result={buildSingleSourceMergedResult(source)}
                  libraryMangas={libraryMangas}
                  bookmarkedSourceKeys={bookmarkedSourceKeys}
                  onOpenSource={onOpenSource}
                  onOpenSourceInWorkspace={onOpenSourceInWorkspace}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
