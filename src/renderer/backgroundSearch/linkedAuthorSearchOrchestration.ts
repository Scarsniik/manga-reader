import type {
  AuthorCorrespondenceBackgroundInput,
  BackgroundSearchJob,
  BackgroundSearchQueueSummary,
  LinkedAuthorCorpusImport,
  MangaCorrespondenceBackgroundInput,
} from "@/shared/backgroundSearch";
import type {
  AuthorCorrespondenceBackgroundResult,
  MangaCorrespondenceBackgroundResult,
} from "@/renderer/backgroundSearch/types";
import {
  hydrateAuthorCorrespondenceSessionCache,
  mergeAuthorCorrespondenceSessionCacheSnapshots,
  publishAuthorCorrespondenceSessionCache,
} from "@/renderer/backgroundSearch/authorCorrespondenceSessionCache";
import { readAuthorCorrespondenceInvalidations } from "@/renderer/backgroundSearch/authorCorrespondenceInvalidations";
import { buildMangaCorrespondenceReplayInput } from "@/renderer/backgroundSearch/mangaCorrespondenceDiscoveries";
import { buildUniqueAuthorSearchNames } from "@/renderer/utils/authorSearchNames";
import {
  buildAuthorCorrespondenceMatchKey,
  dedupeAuthorCorrespondenceReferenceSources,
} from "@/renderer/utils/authorCorrespondenceIdentity";
import { selectAutomaticReusableAuthorSearch } from "@/renderer/backgroundSearch/reusableAuthorSearches";

export type LinkedAuthorImportOutcome = "blocked" | "deferred" | "unchanged" | "replayed";

const isParentReplayable = (job: BackgroundSearchJob): boolean => (
  job.metadata.kind === "mangaCorrespondence"
  && (job.metadata.status === "completed" || job.metadata.status === "cancelled")
  && Boolean(job.result)
);

const updateRelation = async (
  jobId: string,
  automationStatus: NonNullable<BackgroundSearchJob["metadata"]["relation"]>["automationStatus"],
  options: { importedCacheRevision?: number; automationError?: string } = {},
): Promise<void> => {
  await window.api?.updateBackgroundSearchRelation?.({
    jobId,
    automationStatus,
    ...options,
  });
};

const buildCorpusImport = (
  authorJob: BackgroundSearchJob,
  result: AuthorCorrespondenceBackgroundResult,
  sourceCacheRevision: number,
  importedCacheRevision: number,
  options: {
    autoRefreshOnCompletion: boolean;
    blockAutomaticImportOnSafetyWarning: boolean;
  },
): LinkedAuthorCorpusImport => {
  const input = authorJob.input as AuthorCorrespondenceBackgroundInput;
  const invalidatedMatchKeys = new Set([
    ...(input.advancedSearch?.invalidatedAuthorMatchKeys ?? []),
    ...readAuthorCorrespondenceInvalidations(authorJob.metadata.id),
  ]);
  const activeMatches = result.matches.filter((match) => !invalidatedMatchKeys.has(match.key));
  return {
    authorJobId: authorJob.metadata.id,
    sourceCacheRevision,
    importedCacheRevision,
    importedAt: new Date().toISOString(),
    names: buildUniqueAuthorSearchNames([
      input.referenceName,
      ...(input.names ?? []),
      ...result.searchedNames,
      ...activeMatches.flatMap((match) => [match.authorName, match.matchedName]),
    ]),
    referenceSources: dedupeAuthorCorrespondenceReferenceSources([
      ...input.referenceSources.filter((source) => !invalidatedMatchKeys.has(
        buildAuthorCorrespondenceMatchKey(source.scraperId, source.authorUrl),
      )),
      ...activeMatches.map((match) => ({
        scraperId: match.scraperId,
        authorUrl: match.authorUrl,
        name: match.authorName,
        templateContext: match.templateContext,
      })),
    ]),
    autoRefreshOnCompletion: options.autoRefreshOnCompletion,
    blockAutomaticImportOnSafetyWarning: options.blockAutomaticImportOnSafetyWarning,
  };
};

export const importLinkedAuthorSearchIntoManga = async (options: {
  authorJobId: string;
  mangaJobId?: string;
  automatic: boolean;
  autoRefreshOnCompletion?: boolean;
  blockAutomaticImportOnSafetyWarning?: boolean;
}): Promise<LinkedAuthorImportOutcome> => {
  const authorJob = await window.api?.getBackgroundSearchJob?.(
    options.authorJobId,
  ) as BackgroundSearchJob | null;
  const relation = authorJob?.metadata.relation;
  if (!authorJob || authorJob.metadata.kind !== "authorCorrespondence") {
    throw new Error("La recherche auteur n’est plus disponible.");
  }
  const authorResult = authorJob.result as AuthorCorrespondenceBackgroundResult | undefined;
  if (!authorResult) throw new Error("La recherche auteur ne contient aucun résultat importable.");
  const mangaJobId = options.mangaJobId ?? relation?.parentJobId;
  if (!mangaJobId) {
    throw new Error("Aucune recherche manga cible n’a été indiquée.");
  }
  const applicableRelation = relation?.parentJobId === mangaJobId ? relation : undefined;
  const updateApplicableRelation = async (
    automationStatus: NonNullable<BackgroundSearchJob["metadata"]["relation"]>["automationStatus"],
    updateOptions: { importedCacheRevision?: number; automationError?: string } = {},
  ): Promise<void> => {
    if (!applicableRelation) return;
    await updateRelation(authorJob.metadata.id, automationStatus, updateOptions);
  };

  const parentJob = await window.api?.getBackgroundSearchJob?.(
    mangaJobId,
  ) as BackgroundSearchJob | null;
  if (!parentJob || parentJob.metadata.kind !== "mangaCorrespondence") {
    await updateApplicableRelation("error", {
      automationError: "La recherche manga d’origine n’est plus disponible.",
    });
    throw new Error("La recherche manga cible n’est plus disponible.");
  }
  const parentInput = parentJob.input as MangaCorrespondenceBackgroundInput;
  const currentImport = parentInput.linkedAuthorImports?.find((entry) => (
    entry.authorJobId === authorJob.metadata.id
  ));
  const blockAutomaticImportOnSafetyWarning = options.blockAutomaticImportOnSafetyWarning
    ?? currentImport?.blockAutomaticImportOnSafetyWarning
    ?? applicableRelation?.blockAutomaticImportOnSafetyWarning
    ?? true;
  if (
    options.automatic
    && blockAutomaticImportOnSafetyWarning
    && authorResult.advancedSearch?.automaticMangaReplayBlocked === true
  ) {
    await updateApplicableRelation("blocked");
    return "blocked";
  }
  if (parentJob.metadata.status === "queued" || parentJob.metadata.status === "running") {
    return "deferred";
  }
  if (options.automatic && parentJob.metadata.status === "cancelled") {
    await updateApplicableRelation("manualReady");
    return "deferred";
  }
  if (!isParentReplayable(parentJob)) {
    const message = "La recherche manga cible ne peut pas être rejouée dans son état actuel.";
    await updateApplicableRelation("error", { automationError: message });
    throw new Error(message);
  }

  const sourceCache = await hydrateAuthorCorrespondenceSessionCache(authorJob.metadata.id);
  if (
    options.automatic
    && currentImport
    && currentImport.sourceCacheRevision >= sourceCache.revision
    && (!applicableRelation || applicableRelation.importedCacheRevision === sourceCache.revision)
  ) {
    await updateApplicableRelation("completed", {
      importedCacheRevision: sourceCache.revision,
    });
    return "unchanged";
  }

  await updateApplicableRelation("processing");
  try {
    const targetCache = await hydrateAuthorCorrespondenceSessionCache(parentJob.metadata.id);
    const importedCache = await publishAuthorCorrespondenceSessionCache(
      parentJob.metadata.id,
      (current) => mergeAuthorCorrespondenceSessionCacheSnapshots(
        current.revision >= targetCache.revision ? current : targetCache,
        sourceCache,
      ),
    );
    const corpusImport = buildCorpusImport(
      authorJob,
      authorResult,
      sourceCache.revision,
      importedCache.revision,
      {
        autoRefreshOnCompletion: options.autoRefreshOnCompletion
          ?? currentImport?.autoRefreshOnCompletion
          ?? applicableRelation?.autoImportOnCompletion
          ?? true,
        blockAutomaticImportOnSafetyWarning,
      },
    );
    const linkedAuthorImports = [
      ...(parentInput.linkedAuthorImports ?? []).filter((entry) => (
        entry.authorJobId !== authorJob.metadata.id
      )),
      corpusImport,
    ];
    const replayInput = buildMangaCorrespondenceReplayInput({
      ...parentInput,
      linkedAuthorImports,
    }, parentJob.result as MangaCorrespondenceBackgroundResult);
    const replayed = await window.api?.replayBackgroundSearch?.({
      jobId: parentJob.metadata.id,
      input: replayInput,
    });
    if (!replayed) throw new Error("La recherche manga n’a pas pu être relancée.");
    await updateApplicableRelation("completed", {
      importedCacheRevision: sourceCache.revision,
    });
    return "replayed";
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Le corpus auteur n’a pas pu être importé.";
    await updateApplicableRelation("error", { automationError: message });
    throw error;
  }
};

const loadAvailableJobs = async (
  kind: "authorCorrespondence" | "mangaCorrespondence",
): Promise<BackgroundSearchJob[]> => {
  const queue = await window.api?.getBackgroundSearchQueue?.() as BackgroundSearchQueueSummary | undefined;
  if (!queue || typeof window.api?.getBackgroundSearchJob !== "function") return [];
  const metadata = queue.jobs.filter((job) => (
    job.kind === kind
    && job.resultAvailable
    && (job.status === "completed" || job.status === "cancelled")
  ));
  const jobs = await Promise.all(metadata.map((job) => window.api?.getBackgroundSearchJob?.(job.id)));
  return jobs.filter((job): job is BackgroundSearchJob => Boolean(job));
};

export const automaticallyReuseExistingAuthorSearch = async (
  mangaJobId: string,
): Promise<LinkedAuthorImportOutcome | "notFound"> => {
  const mangaJob = await window.api?.getBackgroundSearchJob?.(mangaJobId) as BackgroundSearchJob | null;
  if (
    !mangaJob
    || mangaJob.metadata.kind !== "mangaCorrespondence"
    || mangaJob.metadata.status !== "completed"
    || !mangaJob.result
  ) {
    return "notFound";
  }
  const authorJobs = await loadAvailableJobs("authorCorrespondence");
  const candidate = selectAutomaticReusableAuthorSearch(
    mangaJob as BackgroundSearchJob<MangaCorrespondenceBackgroundInput, MangaCorrespondenceBackgroundResult>
      & { result: MangaCorrespondenceBackgroundResult },
    authorJobs,
  );
  if (!candidate) return "notFound";

  return importLinkedAuthorSearchIntoManga({
    authorJobId: candidate.job.metadata.id,
    mangaJobId,
    automatic: true,
    autoRefreshOnCompletion: true,
    blockAutomaticImportOnSafetyWarning: true,
  });
};

export const refreshMangaSearchesUsingAuthor = async (
  authorJobId: string,
): Promise<void> => {
  const mangaJobs = await loadAvailableJobs("mangaCorrespondence");
  for (const mangaJob of mangaJobs) {
    const input = mangaJob.input as MangaCorrespondenceBackgroundInput;
    const existingImport = input.linkedAuthorImports?.find((entry) => (
      entry.authorJobId === authorJobId && entry.autoRefreshOnCompletion === true
    ));
    if (!existingImport || mangaJob.metadata.status !== "completed") continue;
    try {
      await importLinkedAuthorSearchIntoManga({
        authorJobId,
        mangaJobId: mangaJob.metadata.id,
        automatic: true,
        autoRefreshOnCompletion: true,
        blockAutomaticImportOnSafetyWarning:
          existingImport.blockAutomaticImportOnSafetyWarning !== false,
      });
    } catch (error) {
      console.warn("Failed to refresh a manga search from its reusable author corpus", error);
    }
  }
};
