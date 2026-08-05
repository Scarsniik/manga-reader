import type {
  ScraperLatestDiagnosticEventRequest,
  ScraperLatestDiagnosticFinishRequest,
  ScraperLatestDiagnosticSession,
  ScraperLatestDiagnosticStartRequest,
} from "@/shared/scraperLatestDiagnostics";

type ScraperLatestDiagnosticApi = {
  startScraperLatestDiagnostics?: (
    request: ScraperLatestDiagnosticStartRequest,
  ) => Promise<ScraperLatestDiagnosticSession>;
  appendScraperLatestDiagnosticEvent?: (
    request: ScraperLatestDiagnosticEventRequest,
  ) => Promise<void>;
  finishScraperLatestDiagnostics?: (
    request: ScraperLatestDiagnosticFinishRequest,
  ) => Promise<{ filePath?: string }>;
};

const getDiagnosticsApi = (): ScraperLatestDiagnosticApi => (
  ((window as unknown as { api?: ScraperLatestDiagnosticApi }).api ?? {})
);

export const shouldGenerateScraperLatestPerformanceReport = (value: unknown): boolean => value === true;

export const startScraperLatestDiagnosticSession = async (
  request: ScraperLatestDiagnosticStartRequest,
): Promise<ScraperLatestDiagnosticSession | null> => {
  const start = getDiagnosticsApi().startScraperLatestDiagnostics;
  if (typeof start !== "function") {
    return null;
  }

  try {
    return await start(request);
  } catch (error) {
    console.warn("Failed to start scraper latest diagnostics", error);
    return null;
  }
};

export const appendScraperLatestDiagnosticEvent = (
  session: Pick<ScraperLatestDiagnosticSession, "profileId"> | null | undefined,
  event: string,
  data?: Record<string, unknown>,
  sourceKey?: string,
): void => {
  const append = getDiagnosticsApi().appendScraperLatestDiagnosticEvent;
  if (!session || typeof append !== "function") {
    return;
  }

  void append({
    profileId: session.profileId,
    event,
    sourceKey,
    data,
  }).catch((error) => {
    console.warn("Failed to append scraper latest diagnostic event", error);
  });
};

export const finishScraperLatestDiagnosticSession = async (
  session: ScraperLatestDiagnosticSession | null | undefined,
  status: ScraperLatestDiagnosticFinishRequest["status"],
  data?: Record<string, unknown>,
): Promise<void> => {
  const finish = getDiagnosticsApi().finishScraperLatestDiagnostics;
  if (!session || typeof finish !== "function") {
    return;
  }

  try {
    await finish({ profileId: session.profileId, status, data });
  } catch (error) {
    console.warn("Failed to finish scraper latest diagnostics", error);
  }
};
