import React from "react";
import MultiSearchLanguageFilterBar from "@/renderer/components/MultiSearch/MultiSearchLanguageFilterBar";
import MultiSearchTextFilterBar from "@/renderer/components/MultiSearch/MultiSearchTextFilterBar";
import MultiSearchVirtualizedResultsGrid from "@/renderer/components/MultiSearch/MultiSearchVirtualizedResultsGrid";
import { DownloadArrowIcon } from "@/renderer/components/icons";
import type { Manga } from "@/renderer/types";
import type {
  MultiSearchLanguageFilterMode,
  MultiSearchLanguageFilterModes,
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
  visibleSourceCount: number;
  loadedSourceCount: number;
  resultLanguageCodes: string[];
  languageFilterModes: MultiSearchLanguageFilterModes;
  textFilter: string;
  baseQuery: string;
  libraryMangas: Manga[];
  bookmarkedSourceKeys: Set<string>;
  isExportingJson: boolean;
  showMergeReloadButton: boolean;
  onOpenSource: (source: MultiSearchSourceResult) => void;
  onOpenSourceInWorkspace: (source: MultiSearchSourceResult) => void;
  onExportJson: () => void;
  onExportMergedResultsJson: () => void;
  onReloadMerge: () => void;
  onTextFilterChange: (value: string) => void;
  onFillTextFilterFromBaseQuery: () => void;
  onClearTextFilter: () => void;
  onToggleLanguageFilterMode: (
    languageCode: string,
    mode: Exclude<MultiSearchLanguageFilterMode, "default">,
  ) => void;
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
  visibleSourceCount,
  loadedSourceCount,
  resultLanguageCodes,
  languageFilterModes,
  textFilter,
  baseQuery,
  libraryMangas,
  bookmarkedSourceKeys,
  isExportingJson,
  showMergeReloadButton,
  onOpenSource,
  onOpenSourceInWorkspace,
  onExportJson,
  onExportMergedResultsJson,
  onReloadMerge,
  onTextFilterChange,
  onFillTextFilterFromBaseQuery,
  onClearTextFilter,
  onToggleLanguageFilterMode,
}: Props) {
  const scraperResultGroups = React.useMemo(() => (
    viewMode === "byScraper"
      ? runs.map((run) => ({
        scraperId: run.scraper.id,
        scraperName: run.scraper.name,
        results: run.results.map(buildSingleSourceMergedResult),
      }))
      : []
  ), [runs, viewMode]);

  if (viewMode === "merged") {
    return (
      <section className="multi-search__results">
        <div className="multi-search__section-head">
          <div>
            <h3>Resultats fusionnes</h3>
            <p>{mergedResults.length} carte(s), {visibleSourceCount} source(s) chargee(s).</p>
            <div className="multi-search__result-filter-stack">
              <MultiSearchTextFilterBar
                value={textFilter}
                baseQuery={baseQuery}
                onChange={onTextFilterChange}
                onFillFromBaseQuery={onFillTextFilterFromBaseQuery}
                onClear={onClearTextFilter}
              />
              <MultiSearchLanguageFilterBar
                languageCodes={resultLanguageCodes}
                filterModes={languageFilterModes}
                onToggleFilterMode={onToggleLanguageFilterMode}
              />
            </div>
          </div>
          <div className="multi-search__section-actions">
            {showMergeReloadButton ? (
              <>
                <button
                  type="button"
                  className="multi-search__reload-merge-button"
                  onClick={onReloadMerge}
                  disabled={loadedSourceCount === 0}
                  title="Recalculer la fusion depuis les resultats charges"
                >
                  Recharger fusion
                </button>
                <button
                  type="button"
                  className="multi-search__export-json-button"
                  onClick={onExportMergedResultsJson}
                  disabled={isExportingJson || loadedSourceCount === 0}
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
              disabled={isExportingJson || loadedSourceCount === 0}
              title="Ouvrir les resultats JSON"
            >
              <DownloadArrowIcon aria-hidden="true" focusable="false" />
              <span>{isExportingJson ? "Ouverture..." : "JSON"}</span>
            </button>
          </div>
        </div>

        <MultiSearchVirtualizedResultsGrid
          results={mergedResults}
          libraryMangas={libraryMangas}
          bookmarkedSourceKeys={bookmarkedSourceKeys}
          onOpenSource={onOpenSource}
          onOpenSourceInWorkspace={onOpenSourceInWorkspace}
        />
      </section>
    );
  }

  return (
    <section className="multi-search__results">
      <div className="multi-search__section-head">
        <div>
          <h3>Resultats par scrapper</h3>
          <p>{visibleSourceCount} source(s) chargee(s) sans fusion.</p>
          <div className="multi-search__result-filter-stack">
            <MultiSearchTextFilterBar
              value={textFilter}
              baseQuery={baseQuery}
              onChange={onTextFilterChange}
              onFillFromBaseQuery={onFillTextFilterFromBaseQuery}
              onClear={onClearTextFilter}
            />
            <MultiSearchLanguageFilterBar
              languageCodes={resultLanguageCodes}
              filterModes={languageFilterModes}
              onToggleFilterMode={onToggleLanguageFilterMode}
            />
          </div>
        </div>
        <div className="multi-search__section-actions">
          <button
            type="button"
            className="multi-search__export-json-button"
            onClick={onExportJson}
            disabled={isExportingJson || loadedSourceCount === 0}
            title="Ouvrir les resultats JSON"
          >
            <DownloadArrowIcon aria-hidden="true" focusable="false" />
            <span>{isExportingJson ? "Ouverture..." : "JSON"}</span>
          </button>
        </div>
      </div>

      <div className="multi-search__by-scraper">
        {scraperResultGroups.map((group) => (
          <div key={group.scraperId} className="multi-search__scraper-results">
            <h4>{group.scraperName}</h4>
            <MultiSearchVirtualizedResultsGrid
              results={group.results}
              libraryMangas={libraryMangas}
              bookmarkedSourceKeys={bookmarkedSourceKeys}
              onOpenSource={onOpenSource}
              onOpenSourceInWorkspace={onOpenSourceInWorkspace}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
