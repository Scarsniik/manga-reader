import React from "react";
import MultiSearchResultCard from "@/renderer/components/MultiSearch/MultiSearchResultCard";
import type {
  MultiSearchMergedResult,
  MultiSearchScraperRun,
  MultiSearchSourceResult,
  MultiSearchViewMode,
} from "@/renderer/components/MultiSearch/types";

type Props = {
  viewMode: MultiSearchViewMode;
  runs: MultiSearchScraperRun[];
  mergedResults: MultiSearchMergedResult[];
  sourceCount: number;
  onOpenSource: (source: MultiSearchSourceResult) => void;
  onOpenSourceInWorkspace: (source: MultiSearchSourceResult) => void;
};

const buildSingleSourceMergedResult = (source: MultiSearchSourceResult): MultiSearchMergedResult => ({
  id: `${source.scraper.id}-${source.result.detailUrl || source.result.title}`,
  title: source.result.title,
  coverUrl: source.result.thumbnailUrl,
  summary: source.result.summary,
  pageCount: source.result.pageCount,
  sources: [source],
  sourceLanguageCodes: source.sourceLanguageCodes,
  contentTypes: source.contentTypes,
});

export default function MultiSearchResultsSection({
  viewMode,
  runs,
  mergedResults,
  sourceCount,
  onOpenSource,
  onOpenSourceInWorkspace,
}: Props) {
  if (viewMode === "merged") {
    return (
      <section className="multi-search__results">
        <div className="multi-search__section-head">
          <div>
            <h3>Resultats fusionnes</h3>
            <p>{mergedResults.length} carte(s), {sourceCount} source(s) chargee(s).</p>
          </div>
        </div>

        <div className="multi-search__results-grid">
          {mergedResults.map((result) => (
            <MultiSearchResultCard
              key={result.id}
              result={result}
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
