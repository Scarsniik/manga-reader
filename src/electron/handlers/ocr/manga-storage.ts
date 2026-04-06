import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { Notification } from "electron";
import { MANGA_OCR_PROFILE_SCHEMA_VERSION, MANGA_OCR_SCHEMA_VERSION } from "./constants";
import {
  getMangaOcrFilePath,
  getMangaOcrProfileFilePath,
  writeJsonFileAtomically,
} from "./helpers";
import { ensureMangaFileProgress, touchMangaFileProgress } from "./manga-progress";
import type {
  MangaOcrFile,
  MangaOcrProfileFile,
  MangaOcrProfileSummary,
  OcrLanguageDetection,
  OcrNumericRecord,
  OcrQueueJob,
} from "./types";

export const createEmptyLanguageDetection = (): OcrLanguageDetection => ({
  status: "not_run",
  score: null,
  sampledPages: [],
  appliedLanguageTag: false,
  source: "ocr-samples",
  sampleDetails: [],
});

const createEmptyMangaOcrFile = (
  manga: { id: string; title: string; path: string },
  totalPages: number,
): MangaOcrFile => ({
  version: MANGA_OCR_SCHEMA_VERSION,
  engine: "mokuro",
  manga: {
    id: String(manga.id),
    title: String(manga.title || path.basename(manga.path)),
    rootPath: manga.path,
  },
  languageDetection: createEmptyLanguageDetection(),
  progress: {
    totalPages,
    completedPages: 0,
    failedPages: 0,
    mode: "on_demand",
    updatedAt: new Date().toISOString(),
  },
  pages: {},
});

export async function readMangaOcrFile(mangaPath: string): Promise<MangaOcrFile | null> {
  const targetPath = getMangaOcrFilePath(mangaPath);

  try {
    const raw = await fs.readFile(targetPath, "utf-8");
    const parsed = JSON.parse(raw) as MangaOcrFile;
    const normalizedFile: MangaOcrFile = {
      ...createEmptyMangaOcrFile({
        id: parsed?.manga?.id || path.basename(mangaPath),
        title: parsed?.manga?.title || path.basename(mangaPath),
        path: mangaPath,
      }, Number(parsed?.progress?.totalPages || 0)),
      ...(parsed || {}),
      manga: {
        id: parsed?.manga?.id || path.basename(mangaPath),
        title: parsed?.manga?.title || path.basename(mangaPath),
        rootPath: mangaPath,
      },
      languageDetection: {
        ...createEmptyLanguageDetection(),
        ...(parsed?.languageDetection || {}),
      },
      progress: {
        totalPages: Number(parsed?.progress?.totalPages || 0),
        completedPages: Number(parsed?.progress?.completedPages || 0),
        failedPages: Number(parsed?.progress?.failedPages || 0),
        lastProcessedPage: parsed?.progress?.lastProcessedPage,
        mode: parsed?.progress?.mode,
        updatedAt: parsed?.progress?.updatedAt,
      },
      pages: parsed?.pages || {},
    };
    ensureMangaFileProgress(
      normalizedFile,
      Number(normalizedFile.progress?.totalPages || 0),
      normalizedFile.progress?.mode || "on_demand",
    );
    return normalizedFile;
  } catch (error: any) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function writeMangaOcrFile(mangaPath: string, file: MangaOcrFile) {
  const targetPath = getMangaOcrFilePath(mangaPath);
  const tempPath = `${targetPath}.${randomUUID()}.tmp`;
  const nextFile: MangaOcrFile = {
    ...file,
    version: MANGA_OCR_SCHEMA_VERSION,
    engine: "mokuro",
    manga: {
      ...(file?.manga || {}),
      rootPath: mangaPath,
    },
    progress: {
      ...(file?.progress || {}),
      updatedAt: new Date().toISOString(),
    },
  };
  ensureMangaFileProgress(
    nextFile,
    Number(nextFile.progress?.totalPages || 0),
    nextFile.progress?.mode || "on_demand",
  );
  const serialized = JSON.stringify(nextFile, null, 2);

  await writeJsonFileAtomically(targetPath, tempPath, serialized);
  return nextFile;
}

function createEmptyMangaOcrProfileSummary(): MangaOcrProfileSummary {
  return {
    backendPages: 0,
    appCachePages: 0,
    mangaFilePages: 0,
    profiledPages: 0,
    totalDurationMs: 0,
    totalMocrCalls: 0,
    totalMocrMs: 0,
    totalTextDetectorCalls: 0,
    totalTextDetectorMs: 0,
    lineSelectedTotal: {},
    lineSelectedWhenTriggered: {},
    lineCandidateEvaluations: {},
    finalBlockOrigins: {},
    truncatedRefineCalls: 0,
    truncatedRefineAccepted: 0,
    passes: {},
  };
}

function addProfileCounters(target: OcrNumericRecord, source?: OcrNumericRecord | null) {
  for (const [key, rawValue] of Object.entries(source || {})) {
    const value = Number(rawValue || 0);
    if (!Number.isFinite(value) || value === 0) {
      continue;
    }
    target[key] = Number(target[key] || 0) + value;
  }
}

function buildMangaOcrProfileSummary(session: MangaOcrProfileFile["session"]): MangaOcrProfileSummary {
  const summary = createEmptyMangaOcrProfileSummary();

  for (const page of Object.values(session.pages || {})) {
    if (page.source === "backend") {
      summary.backendPages += 1;
    } else if (page.source === "app-cache") {
      summary.appCachePages += 1;
    } else if (page.source === "manga-file") {
      summary.mangaFilePages += 1;
    }

    const profile = page.profile;
    if (!profile) {
      continue;
    }

    summary.profiledPages += 1;
    summary.totalDurationMs += Number(profile.duration_ms || 0);
    summary.totalMocrCalls += Number(profile.mocr?.calls || 0);
    summary.totalMocrMs += Number(profile.mocr?.total_ms || 0);
    summary.totalTextDetectorCalls += Number(profile.text_detector?.calls || 0);
    summary.totalTextDetectorMs += Number(profile.text_detector?.total_ms || 0);
    summary.truncatedRefineCalls += Number(profile.truncated_refine?.calls || 0);
    summary.truncatedRefineAccepted += Number(profile.truncated_refine?.accepted || 0);

    addProfileCounters(summary.lineSelectedTotal, profile.line_variants?.selected_total);
    addProfileCounters(summary.lineSelectedWhenTriggered, profile.line_variants?.selected_when_triggered);
    addProfileCounters(summary.lineCandidateEvaluations, profile.line_variants?.candidate_evaluations);
    addProfileCounters(summary.finalBlockOrigins, profile.final_blocks?.by_origin);

    for (const pass of profile.passes || []) {
      const kind = String(pass.kind || "unknown");
      const name = String(pass.name || "unknown");
      const summaryKey = `${kind}:${name}`;
      const current = summary.passes[summaryKey] || {
        kind,
        name,
        runs: 0,
        durationMs: 0,
        blocksDetected: 0,
        candidateCount: 0,
        acceptedCandidates: 0,
        addedCandidates: 0,
        replacedCandidates: 0,
        replacedBlocks: 0,
        skippedCandidates: 0,
        finalBlocks: 0,
      };

      current.runs += 1;
      current.durationMs += Number(pass.duration_ms || 0);
      current.blocksDetected += Number(pass.blocks_detected || 0);
      current.candidateCount += Number(pass.candidate_count || 0);
      current.acceptedCandidates += Number(pass.accepted_candidates || 0);
      current.addedCandidates += Number(pass.added_candidates || 0);
      current.replacedCandidates += Number(pass.replaced_candidates || 0);
      current.replacedBlocks += Number(pass.replaced_blocks || 0);
      current.skippedCandidates += Number(pass.skipped_candidates || 0);
      current.finalBlocks += Number(pass.final_blocks || 0);
      summary.passes[summaryKey] = current;
    }
  }

  return summary;
}

export function createEmptyMangaOcrProfileFile(job: OcrQueueJob, manga: any, totalPages: number): MangaOcrProfileFile {
  const startedAt = job.startedAt || new Date().toISOString();
  return {
    version: MANGA_OCR_PROFILE_SCHEMA_VERSION,
    manga: {
      id: String(manga.id),
      title: String(manga.title || path.basename(manga.path)),
      rootPath: manga.path,
    },
    session: {
      id: job.id,
      mode: job.mode,
      overwrite: !!job.overwrite,
      heavyPass: !!job.heavyPass,
      status: job.status,
      startedAt,
      updatedAt: startedAt,
      totalPages,
      pages: {},
      summary: createEmptyMangaOcrProfileSummary(),
    },
  };
}

export function syncMangaOcrProfileSession(file: MangaOcrProfileFile, job: OcrQueueJob, totalPages: number) {
  const nextSession: MangaOcrProfileFile["session"] = {
    ...file.session,
    status: job.status,
    heavyPass: !!job.heavyPass,
    totalPages: Math.max(0, Number(totalPages || file.session.totalPages || 0)),
    updatedAt: new Date().toISOString(),
  };

  if (job.completedAt) {
    nextSession.completedAt = job.completedAt;
  } else {
    delete nextSession.completedAt;
  }

  file.session = nextSession;
  return file.session;
}

export async function writeMangaOcrProfileFile(mangaPath: string, file: MangaOcrProfileFile) {
  const targetPath = getMangaOcrProfileFilePath(mangaPath);
  const tempPath = `${targetPath}.${randomUUID()}.tmp`;
  const nextFile: MangaOcrProfileFile = {
    ...file,
    version: MANGA_OCR_PROFILE_SCHEMA_VERSION,
    manga: {
      ...(file?.manga || {}),
      rootPath: mangaPath,
    },
    session: {
      ...(file?.session || {}),
      heavyPass: !!file?.session?.heavyPass,
      totalPages: Math.max(0, Number(file?.session?.totalPages || 0)),
      updatedAt: new Date().toISOString(),
      pages: file?.session?.pages || {},
      summary: buildMangaOcrProfileSummary(file.session),
    },
  };
  const serialized = JSON.stringify(nextFile, null, 2);

  await writeJsonFileAtomically(targetPath, tempPath, serialized);
  return nextFile;
}

export function showQueueJobCompletionNotification(job: OcrQueueJob) {
  if (job.mode !== "full_manga" || !Notification.isSupported()) {
    return;
  }

  let title = "OCR termine";
  if (job.status === "error") {
    title = "OCR en erreur";
  } else if (job.status === "completed" && Number(job.failedPages || 0) > 0) {
    title = "OCR termine avec erreurs";
  } else if (job.status !== "completed") {
    return;
  }

  const processedPages = Number(job.completedPages || 0) + Number(job.failedPages || 0);
  const totalPages = Number(job.totalPages || 0);
  const progressText = totalPages > 0
    ? `${processedPages}/${totalPages} page(s)`
    : `${processedPages} page(s)`;
  const bodyParts = [
    String(job.mangaTitle || "Manga inconnu"),
    progressText,
  ];

  if (job.status === "completed" && Number(job.failedPages || 0) > 0) {
    bodyParts.push(`${Number(job.failedPages || 0)} page(s) en erreur`);
  } else if (job.status === "error" && job.message) {
    bodyParts.push(String(job.message).slice(0, 180));
  }

  try {
    new Notification({
      title,
      body: bodyParts.join("\n"),
      silent: false,
    }).show();
  } catch (error) {
    console.warn("[ocr] Unable to show completion notification", {
      mangaId: job.mangaId,
      error,
    });
  }
}

export async function ensureMangaOcrFile(manga: any, totalPages: number) {
  const existing = await readMangaOcrFile(manga.path);
  if (existing) {
    existing.manga = {
      id: String(manga.id),
      title: String(manga.title || path.basename(manga.path)),
      rootPath: manga.path,
    };
    touchMangaFileProgress(existing, totalPages, existing.progress.mode || "on_demand");
    return existing;
  }

  const file = createEmptyMangaOcrFile(manga, totalPages);
  touchMangaFileProgress(file, totalPages, file.progress.mode || "on_demand");
  return file;
}
