export type ScraperLatestDiagnosticMode = "foreground" | "background";

export type ScraperLatestDiagnosticStartRequest = {
  mode: ScraperLatestDiagnosticMode;
  searchKind?: string;
  searchMode?: string;
  resultLimitMode?: string;
  resultLimit?: number;
  tagResultLimit?: number;
  concurrency: number;
  sourceCount: number;
  backgroundJobId?: string;
};

export type ScraperLatestDiagnosticSession = {
  profileId: string;
  filePath: string;
  startedAt: string;
};

export type ScraperLatestDiagnosticEventRequest = {
  profileId: string;
  event: string;
  sourceKey?: string;
  data?: Record<string, unknown>;
};

export type ScraperLatestDiagnosticFinishRequest = {
  profileId: string;
  status: "completed" | "cancelled" | "error";
  data?: Record<string, unknown>;
};

export type ScraperRequestDiagnosticContext = {
  profileId: string;
  purpose: string;
  sourceKey?: string;
  pageIndex?: number;
};
