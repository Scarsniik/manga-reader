import type {
  RecordDetailsHistoryRequest,
  RecordReadingHistoryRequest,
  RecordSearchHistoryRequest,
} from "@/shared/history";

const getHistoryApi = (): any => (
  typeof window !== "undefined" ? (window as any).api : null
);

export const toLocalImageUrl = (value: string | null | undefined): string | undefined => {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) {
    return undefined;
  }

  if (rawValue.startsWith("local://") || rawValue.startsWith("http://") || rawValue.startsWith("https://")) {
    return rawValue;
  }

  if (rawValue.startsWith("file://")) {
    return rawValue.replace(/^file:\/\//, "local://");
  }

  if (/^[A-Za-z]:\\/.test(rawValue)) {
    return `local:///${rawValue.replace(/\\/g, "/")}`;
  }

  if (rawValue.startsWith("/")) {
    return `local://${rawValue}`;
  }

  return `local://${rawValue.replace(/\\/g, "/")}`;
};

export const recordReadingHistorySafe = async (
  request: RecordReadingHistoryRequest,
): Promise<void> => {
  const api = getHistoryApi();
  if (!api || typeof api.recordReadingHistory !== "function") {
    return;
  }

  try {
    await api.recordReadingHistory(request);
  } catch (error) {
    console.warn("Failed to record reading history", error);
  }
};

export const recordDetailsHistorySafe = async (
  request: RecordDetailsHistoryRequest,
): Promise<void> => {
  const api = getHistoryApi();
  if (!api || typeof api.recordDetailsHistory !== "function") {
    return;
  }

  try {
    await api.recordDetailsHistory(request);
  } catch (error) {
    console.warn("Failed to record details history", error);
  }
};

export const recordSearchHistorySafe = async (
  request: RecordSearchHistoryRequest,
): Promise<void> => {
  const api = getHistoryApi();
  if (!api || typeof api.recordSearchHistory !== "function") {
    return;
  }

  try {
    await api.recordSearchHistory(request);
  } catch (error) {
    console.warn("Failed to record search history", error);
  }
};
