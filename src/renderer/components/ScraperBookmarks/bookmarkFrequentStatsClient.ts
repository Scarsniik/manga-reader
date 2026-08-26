import BookmarkFrequentStatsWorker from "@/renderer/components/ScraperBookmarks/bookmarkFrequentStats.worker?worker";
import type {
  BookmarkFrequentStatsWorkerRequest,
  BookmarkFrequentStatsWorkerResponse,
} from "@/renderer/components/ScraperBookmarks/bookmarkFrequentStats.worker";

type PendingRequest = {
  reject: (error: Error) => void;
  resolve: (response: BookmarkFrequentStatsWorkerResponse) => void;
};

let worker: Worker | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<number, PendingRequest>();

const rejectPendingRequests = () => {
  pendingRequests.forEach(({ reject }) => {
    reject(new Error("Le calcul des comptages a échoué."));
  });
  pendingRequests.clear();
};

const resetWorker = () => {
  worker?.terminate();
  worker = null;
  rejectPendingRequests();
};

const getWorker = (): Worker => {
  if (worker) {
    return worker;
  }

  worker = new BookmarkFrequentStatsWorker();
  worker.addEventListener("message", (
    event: MessageEvent<BookmarkFrequentStatsWorkerResponse>,
  ) => {
    const pending = pendingRequests.get(event.data.requestId);
    if (!pending) return;
    pendingRequests.delete(event.data.requestId);
    pending.resolve(event.data);
  });
  worker.addEventListener("error", resetWorker);
  return worker;
};

export const requestBookmarkFrequentStats = (
  request: Omit<BookmarkFrequentStatsWorkerRequest, "requestId">,
): Promise<BookmarkFrequentStatsWorkerResponse> => {
  const requestId = nextRequestId;
  nextRequestId += 1;

  return new Promise((resolve, reject) => {
    pendingRequests.set(requestId, { reject, resolve });
    try {
      getWorker().postMessage({ ...request, requestId });
    } catch (error) {
      pendingRequests.delete(requestId);
      reject(error instanceof Error ? error : new Error("Le calcul des comptages a échoué."));
    }
  });
};
