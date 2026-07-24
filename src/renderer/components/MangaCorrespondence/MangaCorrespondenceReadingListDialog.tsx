import React, { useEffect, useMemo, useState } from "react";
import { UNKNOWN_MULTI_SEARCH_VALUE } from "@/renderer/components/MultiSearch/multiSearchConstants";
import { getMultiSearchSourceLanguageValues } from "@/renderer/components/MultiSearch/multiSearchLanguageFilters";
import { buildMultiSearchSourceIdentityKey } from "@/renderer/components/MultiSearch/multiSearchMerge";
import type {
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import type { ReadingListItem } from "@/renderer/types/readingList";
import { getLanguageLabel } from "@/renderer/utils/languageDetection";
import { openWorkspaceTarget } from "@/renderer/utils/workspaceTargets";
import {
  filterIncludedMangaCorrespondenceChapters,
  toggleMangaCorrespondenceChapterExclusion,
} from "@/renderer/components/MangaCorrespondence/mangaCorrespondenceReadingListSelection";
import { formatMangaCorrespondenceChapterLabel } from "@/renderer/utils/mangaCorrespondenceChapter";
import generateId from "@/utils/id";

export type MangaCorrespondenceReadingListChapter = {
  chapter: string;
  result: MultiSearchMergedResult;
};

type Props = {
  chapters: MangaCorrespondenceReadingListChapter[];
  initialExcludedChapterLabels: string[];
  onCancel: () => void;
  onCreate: (items: ReadingListItem[], languageCode: string) => Promise<void>;
  onExcludedChapterLabelsChange: (chapterLabels: string[]) => void;
  preferredLanguageCodes: string[];
};

type LanguageCoverage = {
  code: string;
  coveredChapters: MangaCorrespondenceReadingListChapter[];
  missingChapters: MangaCorrespondenceReadingListChapter[];
};

const getReadableSources = (
  chapter: MangaCorrespondenceReadingListChapter,
): MultiSearchSourceResult[] => (
  chapter.result.sources.filter((source) => Boolean(source.result.detailUrl))
);

const sourceMatchesLanguage = (
  source: MultiSearchSourceResult,
  languageCode: string,
): boolean => (
  getMultiSearchSourceLanguageValues(source).includes(languageCode)
);

const buildReadingListItem = (
  source: MultiSearchSourceResult,
): ReadingListItem => ({
  id: generateId(),
  metadata: {
    title: source.result.title,
    cover: source.result.thumbnailUrl || null,
    authors: source.result.authorNames?.length
      ? source.result.authorNames
      : source.tentativeAuthorNames,
    tags: source.result.tags ?? [],
    languageCodes: getMultiSearchSourceLanguageValues(source)
      .filter((code) => code !== UNKNOWN_MULTI_SEARCH_VALUE),
  },
  sourceTarget: {
    kind: "scraper.details",
    scraperId: source.scraper.id,
    sourceUrl: source.result.detailUrl as string,
    title: source.result.title,
  },
});

const getReplacementSources = (
  chapter: MangaCorrespondenceReadingListChapter,
  languageCode: string,
): MultiSearchSourceResult[] => {
  const seen = new Set<string>();
  return getReadableSources(chapter)
    .filter((source) => !sourceMatchesLanguage(source, languageCode))
    .filter((source) => {
      const key = buildMultiSearchSourceIdentityKey(source);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => {
      const leftUnknown = getMultiSearchSourceLanguageValues(left)
        .includes(UNKNOWN_MULTI_SEARCH_VALUE);
      const rightUnknown = getMultiSearchSourceLanguageValues(right)
        .includes(UNKNOWN_MULTI_SEARCH_VALUE);
      return Number(rightUnknown) - Number(leftUnknown)
        || left.scraper.name.localeCompare(right.scraper.name)
        || left.result.title.localeCompare(right.result.title);
    });
};

const getSourceLanguageLabel = (source: MultiSearchSourceResult): string => {
  const codes = getMultiSearchSourceLanguageValues(source)
    .filter((code) => code !== UNKNOWN_MULTI_SEARCH_VALUE);
  return codes.length
    ? codes.map(getLanguageLabel).join(", ")
    : "Langue inconnue";
};

const getSourceOptionLabel = (source: MultiSearchSourceResult): string => (
  `${getSourceLanguageLabel(source)} · ${source.scraper.name} · ${source.result.title}`
);

export default function MangaCorrespondenceReadingListDialog({
  chapters,
  initialExcludedChapterLabels,
  onCancel,
  onCreate,
  onExcludedChapterLabelsChange,
  preferredLanguageCodes,
}: Props) {
  const [excludedChapterLabels, setExcludedChapterLabels] = useState<Set<string>>(
    () => new Set(initialExcludedChapterLabels),
  );
  const includedChapters = useMemo(
    () => filterIncludedMangaCorrespondenceChapters(chapters, excludedChapterLabels),
    [chapters, excludedChapterLabels],
  );
  const coverage = useMemo<LanguageCoverage[]>(() => {
    const languageCodes = Array.from(new Set(includedChapters.flatMap((chapter) => (
      getReadableSources(chapter).flatMap(getMultiSearchSourceLanguageValues)
    )))).filter((code) => code !== UNKNOWN_MULTI_SEARCH_VALUE);
    const priorityIndexes = new Map(preferredLanguageCodes.map((code, index) => [code, index]));

    return languageCodes
      .map((code) => {
        const coveredChapters = includedChapters.filter((chapter) => (
          getReadableSources(chapter).some((source) => sourceMatchesLanguage(source, code))
        ));
        const coveredLabels = new Set(coveredChapters.map((chapter) => chapter.chapter));
        return {
          code,
          coveredChapters,
          missingChapters: includedChapters
            .filter((chapter) => !coveredLabels.has(chapter.chapter)),
        };
      })
      .sort((left, right) => {
        const leftPriority = priorityIndexes.get(left.code) ?? Number.MAX_SAFE_INTEGER;
        const rightPriority = priorityIndexes.get(right.code) ?? Number.MAX_SAFE_INTEGER;
        return leftPriority - rightPriority
          || right.coveredChapters.length - left.coveredChapters.length
          || getLanguageLabel(left.code).localeCompare(getLanguageLabel(right.code));
      });
  }, [includedChapters, preferredLanguageCodes]);
  const [selectedLanguageCode, setSelectedLanguageCode] = useState(
    () => coverage[0]?.code ?? "",
  );
  const [replacementSourceKeys, setReplacementSourceKeys] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [openingSourceKey, setOpeningSourceKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedCoverage = coverage.find((entry) => entry.code === selectedLanguageCode);
  const totalChapterCount = includedChapters.length;
  const selectedChapterCount = selectedCoverage?.coveredChapters.length ?? 0;
  const replacementSourcesByChapter = useMemo(() => new Map(
    (selectedCoverage?.missingChapters ?? []).map((chapter) => [
      chapter.chapter,
      getReplacementSources(chapter, selectedLanguageCode),
    ]),
  ), [selectedCoverage, selectedLanguageCode]);
  const selectedReplacementSources = useMemo(() => new Map(
    Array.from(replacementSourcesByChapter.entries()).flatMap(([chapter, sources]) => {
      const selectedKey = replacementSourceKeys[chapter];
      const selectedSource = sources.find((source) => (
        buildMultiSearchSourceIdentityKey(source) === selectedKey
      ));
      return selectedSource ? [[chapter, selectedSource] as const] : [];
    }),
  ), [replacementSourceKeys, replacementSourcesByChapter]);
  const finalChapterCount = selectedChapterCount + selectedReplacementSources.size;

  useEffect(() => {
    if (!coverage.length) {
      if (selectedLanguageCode) setSelectedLanguageCode("");
      return;
    }
    if (!coverage.some((entry) => entry.code === selectedLanguageCode)) {
      setSelectedLanguageCode(coverage[0].code);
      setReplacementSourceKeys({});
    }
  }, [coverage, selectedLanguageCode]);

  const updateExcludedChapterLabels = (next: Set<string>) => {
    setExcludedChapterLabels(next);
    onExcludedChapterLabelsChange(Array.from(next));
    setError(null);
  };
  const toggleChapter = (chapter: string) => {
    updateExcludedChapterLabels(
      toggleMangaCorrespondenceChapterExclusion(excludedChapterLabels, chapter),
    );
  };

  const openReplacementSource = async (source: MultiSearchSourceResult) => {
    const sourceKey = buildMultiSearchSourceIdentityKey(source);
    if (!source.result.detailUrl || openingSourceKey) return;

    setOpeningSourceKey(sourceKey);
    setError(null);
    try {
      const opened = await openWorkspaceTarget({
        kind: "scraper.details",
        scraperId: source.scraper.id,
        sourceUrl: source.result.detailUrl,
        title: source.result.title,
      });
      if (!opened) {
        throw new Error("La source n’a pas pu être ouverte dans le workspace.");
      }
    } catch (openError) {
      setError(openError instanceof Error
        ? openError.message
        : "Impossible d’ouvrir cette source.");
    } finally {
      setOpeningSourceKey(null);
    }
  };

  const createList = async () => {
    if (!selectedCoverage || creating) return;

    const items = includedChapters.flatMap((chapter) => {
      const source = getReadableSources(chapter)
        .find((candidate) => sourceMatchesLanguage(candidate, selectedCoverage.code))
        ?? selectedReplacementSources.get(chapter.chapter);
      return source ? [buildReadingListItem(source)] : [];
    });
    if (!items.length) {
      setError("Aucun chapitre ouvrable n’est disponible dans cette langue.");
      return;
    }

    setCreating(true);
    setError(null);
    try {
      await onCreate(items, selectedCoverage.code);
    } catch (createError) {
      setError(createError instanceof Error
        ? createError.message
        : "Impossible de créer la liste de lecture.");
      setCreating(false);
    }
  };

  return (
    <div className="manga-correspondence-reading-list-dialog">
      <section className="manga-correspondence-reading-list-dialog__chapter-selection">
        <div className="manga-correspondence-reading-list-dialog__chapter-selection-header">
          <div>
            <strong>Chapitres retenus</strong>
            <small>
              Une entrée invalidée reste dans les résultats, mais ne sera pas ajoutée à la liste.
            </small>
          </div>
          <span>{includedChapters.length}/{chapters.length}</span>
        </div>
        <div className="manga-correspondence-reading-list-dialog__chapter-selection-list">
          {chapters.map((chapter) => {
            const isExcluded = excludedChapterLabels.has(chapter.chapter);
            return (
              <button
                key={chapter.chapter}
                type="button"
                className={isExcluded ? "is-excluded" : ""}
                aria-pressed={isExcluded}
                onClick={() => toggleChapter(chapter.chapter)}
                disabled={creating}
                title={isExcluded
                  ? `Réintégrer ${formatMangaCorrespondenceChapterLabel(chapter.chapter)}`
                  : `Invalider ${formatMangaCorrespondenceChapterLabel(chapter.chapter)} pour cette liste`}
              >
                <span className="manga-correspondence-reading-list-dialog__chapter-state" aria-hidden="true">
                  {isExcluded ? "×" : "✓"}
                </span>
                <span>
                  <strong>{formatMangaCorrespondenceChapterLabel(chapter.chapter, true)}</strong>
                  <small>{chapter.result.title}</small>
                </span>
                <em>{isExcluded ? "Invalidé" : "Inclus"}</em>
              </button>
            );
          })}
        </div>
        {excludedChapterLabels.size ? (
          <button
            type="button"
            className="manga-correspondence-reading-list-dialog__restore"
            onClick={() => updateExcludedChapterLabels(new Set())}
            disabled={creating}
          >
            Tout réintégrer
          </button>
        ) : null}
      </section>

      {coverage.length ? (
        <>
          <label>
            <span>Langue de la liste</span>
            <select
              value={selectedLanguageCode}
              onChange={(event) => {
                setSelectedLanguageCode(event.target.value);
                setReplacementSourceKeys({});
                setError(null);
              }}
              disabled={creating}
            >
              {coverage.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {getLanguageLabel(entry.code)} · {entry.coveredChapters.length}/{totalChapterCount} chapitre(s)
                </option>
              ))}
            </select>
          </label>

          {selectedCoverage?.missingChapters.length ? (
            <>
              <div className="manga-correspondence-reading-list-dialog__warning" role="alert">
                <strong>Liste incomplète dans cette langue</strong>
                <p>
                  {selectedChapterCount}/{totalChapterCount} chapitres sont disponibles directement.
                  Élément(s) manquant(s) : {selectedCoverage.missingChapters
                    .map((chapter) => formatMangaCorrespondenceChapterLabel(chapter.chapter))
                    .join(", ")}.
                </p>
                <small>Tu peux choisir une source de remplacement pour chaque chapitre manquant.</small>
              </div>

              <div className="manga-correspondence-reading-list-dialog__replacements">
                <div>
                  <strong>Sources de remplacement</strong>
                  <span>{selectedReplacementSources.size} chapitre(s) complété(s)</span>
                </div>
                {selectedCoverage.missingChapters.map((chapter) => {
                  const sources = replacementSourcesByChapter.get(chapter.chapter) ?? [];
                  const selectedKey = replacementSourceKeys[chapter.chapter] ?? "";
                  const selectedSource = selectedReplacementSources.get(chapter.chapter);
                  return (
                    <div
                      key={chapter.chapter}
                      className="manga-correspondence-reading-list-dialog__replacement-item"
                    >
                      <label htmlFor={`replacement-source-${chapter.chapter}`}>
                        {formatMangaCorrespondenceChapterLabel(chapter.chapter, true)}
                      </label>
                      <div className="manga-correspondence-reading-list-dialog__source-control">
                        <select
                          id={`replacement-source-${chapter.chapter}`}
                          value={selectedKey}
                          onChange={(event) => {
                            const nextKey = event.target.value;
                            setReplacementSourceKeys((current) => ({
                              ...current,
                              [chapter.chapter]: nextKey,
                            }));
                            setError(null);
                          }}
                          disabled={creating || !sources.length}
                          title={selectedSource?.result.title}
                        >
                          <option value="">
                            {sources.length ? "Ne pas compléter ce chapitre" : "Aucune autre source disponible"}
                          </option>
                          {sources.map((source) => {
                            const sourceKey = buildMultiSearchSourceIdentityKey(source);
                            return (
                              <option key={sourceKey} value={sourceKey}>
                                {getSourceOptionLabel(source)}
                              </option>
                            );
                          })}
                        </select>
                        <button
                          type="button"
                          onClick={() => selectedSource && void openReplacementSource(selectedSource)}
                          disabled={!selectedSource || creating || Boolean(openingSourceKey)}
                          title="Ouvrir la source choisie dans un nouvel onglet"
                        >
                          {selectedSource && openingSourceKey === buildMultiSearchSourceIdentityKey(selectedSource)
                            ? "Ouverture…"
                            : "Ouvrir dans un onglet"}
                        </button>
                      </div>
                      {selectedSource ? (
                        <small>
                          {getSourceLanguageLabel(selectedSource)} · {selectedSource.scraper.name}
                          <span>{selectedSource.result.title}</span>
                        </small>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {finalChapterCount === totalChapterCount ? (
                <div className="manga-correspondence-reading-list-dialog__complete">
                  Liste complète grâce aux sources de remplacement sélectionnées.
                </div>
              ) : null}
            </>
          ) : (
            <div className="manga-correspondence-reading-list-dialog__complete">
              Les {totalChapterCount} chapitres trouvés sont disponibles dans cette langue.
            </div>
          )}
        </>
      ) : (
        <div className="manga-correspondence-reading-list-dialog__warning" role="alert">
          {includedChapters.length
            ? "Aucun chapitre retenu ne possède de langue identifiable."
            : "Tous les chapitres ont été invalidés pour cette liste."}
        </div>
      )}

      {error ? <p className="manga-correspondence-reading-list-dialog__error" role="alert">{error}</p> : null}
      <div className="manga-correspondence-reading-list-dialog__actions">
        <button type="button" onClick={onCancel} disabled={creating}>Annuler</button>
        <button
          type="button"
          className="is-primary"
          onClick={() => void createList()}
          disabled={!selectedCoverage || creating}
        >
          {creating ? "Création…" : `Créer la liste (${finalChapterCount})`}
        </button>
      </div>
    </div>
  );
}
