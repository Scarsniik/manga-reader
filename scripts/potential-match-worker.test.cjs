const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const { Worker } = require("node:worker_threads");

test("potential matches are computed in the persistent backend worker", async () => {
  const worker = new Worker(path.resolve("dist/electron/workers/potentialMatchWorker.js"));
  try {
    const response = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Potential-match worker timed out.")), 10_000);
      worker.once("error", reject);
      worker.on("message", (message) => {
        if (message.sessionId !== "test-potential-matches") return;
        clearTimeout(timeout);
        resolve(message.response);
      });
      worker.postMessage({
        type: "potentialMatchRequest",
        sessionId: "test-potential-matches",
        request: {
          type: "potentialMatches",
          requestId: 1,
          dataRevision: 0,
          inputs: [{
            key: "current",
            scraperId: "source-a",
            title: "Example Manga",
            sourceUrl: "https://source-a.test/current",
          }],
          candidates: {
            readingCandidates: [{
              id: "history-1",
              category: "reading",
              title: "Example Manga",
              sourceLabel: "History",
              detailLabel: "Read",
              readingStatus: "read",
              target: {
                kind: "scraperDetails",
                scraperId: "source-b",
                sourceUrl: "https://source-b.test/example",
                title: "Example Manga",
              },
            }],
            bookmarkCandidates: [],
            readingListCandidates: [],
            titleAnalysisConfigs: [],
            mergeOptions: { enableRomajiPhoneticMerge: false },
          },
        },
      });
    });

    assert.equal(response.type, "potentialMatchesProcessed");
    assert.equal(response.error, undefined);
    assert.equal(response.matches.length, 1);
    assert.equal(response.matches[0][0], "current");
    assert.equal(response.matches[0][1].readingMatches.length, 1);
  } finally {
    await worker.terminate();
  }
});
