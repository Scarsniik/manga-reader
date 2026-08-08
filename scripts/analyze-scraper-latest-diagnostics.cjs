const fs = require("node:fs");
const path = require("node:path");
const { resolveAppIdentity } = require("./app-identity.cjs");

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const round = (value) => Math.round(toNumber(value));

const percentile = (values, ratio) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
};

const buildStats = (values) => {
  const normalized = values.map(toNumber).filter((value) => value >= 0);
  const totalMs = normalized.reduce((total, value) => total + value, 0);
  return {
    count: normalized.length,
    totalMs: round(totalMs),
    averageMs: normalized.length ? round(totalMs / normalized.length) : 0,
    p50Ms: round(percentile(normalized, 0.5)),
    p95Ms: round(percentile(normalized, 0.95)),
    maxMs: round(normalized.reduce((maximum, value) => Math.max(maximum, value), 0)),
  };
};

const readDiagnosticEntries = (filePath) => fs.readFileSync(filePath, "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Ligne JSONL invalide ${index + 1}: ${error.message}`);
    }
  });

const buildSummary = (entries, filePath = "") => {
  const requests = new Map();
  const sourceStats = new Map();
  const byPurpose = new Map();
  const prefetch = {
    started: 0,
    reused: 0,
    hits: 0,
    misses: 0,
    replaced: 0,
    clearedEntries: 0,
  };
  const cache = {
    memoryHits: 0,
    memoryMisses: 0,
    diskHits: 0,
    networkRequests: 0,
  };
  const engine = {
    detailsRequested: 0,
    detailsSkipped: 0,
    tasksMerged: 0,
    deltaTasksQueued: 0,
    checkpointResumes: 0,
  };
  const scheduling = {
    roundCount: 0,
    totalRoundMs: 0,
    schedulerWaitMs: 0,
    maxSchedulerWaitMs: 0,
    barrierIdleMs: 0,
    paceWaitMs: 0,
    pagePacingWaitMs: 0,
    retryWaitMs: 0,
    duplicateRetryWaitCount: 0,
  };
  const retryWaitsByPage = new Map();
  let addedResultCount = 0;
  let sourceBatchCount = 0;
  const sourceBatchDurations = [];
  const pageProcessingEntries = [];

  const getRequest = (requestId) => {
    const key = String(requestId || "unknown");
    const request = requests.get(key) || { requestId: key };
    requests.set(key, request);
    return request;
  };

  for (const entry of entries) {
    const data = entry.data || {};
    if (entry.event === "request.queued") {
      Object.assign(getRequest(data.requestId), {
        sourceKey: entry.sourceKey,
        purpose: data.purpose,
        pageIndex: data.pageIndex,
        url: data.requestedUrl || data.url,
        scraperId: data.scraperId,
      });
    } else if (entry.event === "request.acquired") {
      Object.assign(getRequest(data.requestId), {
        sourceKey: entry.sourceKey,
        purpose: data.purpose,
        queueWaitMs: toNumber(data.queueWaitMs),
        activeAfterAcquire: data.activeAfterAcquire,
        pendingAfterAcquire: data.pendingAfterAcquire,
      });
    } else if (entry.event === "request.completed") {
      Object.assign(getRequest(data.requestId), {
        sourceKey: entry.sourceKey,
        purpose: data.purpose,
        executionMs: toNumber(data.executionMs),
        totalRequestMs: toNumber(data.totalRequestMs),
        status: data.status,
        ok: data.ok,
        error: data.error,
        cache: data.cache,
      });
    } else if (entry.event === "quota.round-completed") {
      scheduling.roundCount += 1;
      scheduling.totalRoundMs += toNumber(data.durationMs);
      scheduling.schedulerWaitMs += toNumber(data.schedulerWaitMs);
      scheduling.maxSchedulerWaitMs = Math.max(
        scheduling.maxSchedulerWaitMs,
        toNumber(data.maxSchedulerWaitMs),
      );
      scheduling.barrierIdleMs += toNumber(data.barrierIdleMs);
    } else if (entry.event === "scheduler.slot-acquired") {
      const waitMs = toNumber(data.waitMs);
      scheduling.schedulerWaitMs += waitMs;
      scheduling.maxSchedulerWaitMs = Math.max(scheduling.maxSchedulerWaitMs, waitMs);
    } else if (entry.event === "pace.wait") {
      const delayMs = toNumber(data.delayMs);
      scheduling.paceWaitMs += delayMs;
      if (data.reason === "page-pacing") {
        scheduling.pagePacingWaitMs += delayMs;
      } else {
        scheduling.retryWaitMs += delayMs;
        const retryKey = `${entry.sourceKey || "?"}:${data.pageIndex ?? "?"}`;
        const reasons = retryWaitsByPage.get(retryKey) || new Set();
        reasons.add(data.reason);
        retryWaitsByPage.set(retryKey, reasons);
      }
    } else if (entry.event === "source.batch-completed") {
      sourceBatchCount += 1;
      addedResultCount += toNumber(data.addedResultCount);
      sourceBatchDurations.push(toNumber(data.durationMs));
    } else if (entry.event === "page.processing-completed") {
      pageProcessingEntries.push(data);
    } else if (entry.event === "prefetch.preload-started") {
      prefetch.started += 1;
    } else if (entry.event === "prefetch.preload-reused") {
      prefetch.reused += 1;
    } else if (entry.event === "prefetch.load-hit") {
      prefetch.hits += 1;
    } else if (entry.event === "prefetch.load-miss") {
      prefetch.misses += 1;
    } else if (entry.event === "prefetch.preload-replaced" || entry.event === "prefetch.load-replaced") {
      prefetch.replaced += 1;
    } else if (entry.event === "prefetch.cleared") {
      prefetch.clearedEntries += toNumber(data.entryCount);
    } else if (entry.event === "cache.memory-hit") {
      cache.memoryHits += 1;
    } else if (entry.event === "cache.memory-miss") {
      cache.memoryMisses += 1;
    } else if (entry.event === "details.requested") {
      engine.detailsRequested += Math.max(1, toNumber(data.count));
    } else if (entry.event === "details.skipped-present") {
      engine.detailsSkipped += Math.max(1, toNumber(data.count));
    } else if (entry.event === "task.merged") {
      engine.tasksMerged += 1;
    } else if (entry.event === "task.delta-queued") {
      engine.deltaTasksQueued += 1;
    } else if (entry.event === "checkpoint.resumed") {
      engine.checkpointResumes += 1;
    }
  }

  const completedRequests = [...requests.values()].filter((request) => request.executionMs !== undefined);
  cache.diskHits = completedRequests.filter((request) => request.cache === "disk-hit").length;
  cache.networkRequests = completedRequests.length - cache.diskHits;
  for (const request of completedRequests) {
    const sourceKey = request.sourceKey || "inconnue";
    const source = sourceStats.get(sourceKey) || {
      sourceKey,
      requestCount: 0,
      queueWaitMs: 0,
      executionMs: 0,
      failedRequestCount: 0,
    };
    source.requestCount += 1;
    source.queueWaitMs += toNumber(request.queueWaitMs);
    source.executionMs += toNumber(request.executionMs);
    if (request.ok === false || request.error) source.failedRequestCount += 1;
    sourceStats.set(sourceKey, source);

    const purposeKey = request.purpose || "inconnu";
    const purpose = byPurpose.get(purposeKey) || { purpose: purposeKey, count: 0, queueWaitMs: 0, executionMs: 0 };
    purpose.count += 1;
    purpose.queueWaitMs += toNumber(request.queueWaitMs);
    purpose.executionMs += toNumber(request.executionMs);
    byPurpose.set(purposeKey, purpose);
  }

  const queueStats = buildStats(completedRequests.map((request) => request.queueWaitMs));
  const executionStats = buildStats(completedRequests.map((request) => request.executionMs));
  const totalStats = buildStats(completedRequests.map((request) => (
    request.totalRequestMs || toNumber(request.queueWaitMs) + toNumber(request.executionMs)
  )));
  const failedRequestCount = completedRequests.filter((request) => request.ok === false || request.error).length;
  const detailRequestCount = completedRequests.filter((request) => String(request.purpose || "").startsWith("card-details")).length;
  const pageProcessing = {
    count: pageProcessingEntries.length,
    total: buildStats(pageProcessingEntries.map((page) => page.totalMs)),
    listingLoad: buildStats(pageProcessingEntries.map((page) => page.listingLoadMs)),
    postListing: buildStats(pageProcessingEntries.map((page) => page.postListingMs)),
  };
  const sessionStarted = entries.find((entry) => entry.event === "session.started");
  const sessionFinished = [...entries].reverse().find((entry) => (
    entry.event === "session.closed" || entry.event === "session.finish-requested"
  ));
  const elapsedMs = entries.reduce((maximum, entry) => (
    Math.max(maximum, toNumber(entry.elapsedMs))
  ), 0);
  const prefetchDecisionCount = prefetch.started;
  const prefetchHitRate = prefetchDecisionCount > 0 ? prefetch.hits / prefetchDecisionCount : 0;
  const findings = [];
  const addFinding = (severity, code, message, evidence) => findings.push({ severity, code, message, evidence });

  if (!completedRequests.length) {
    addFinding("warning", "no-requests", "Aucune requête terminée n'a été enregistrée.", {});
  }
  const measuredRequestMs = queueStats.totalMs + executionStats.totalMs;
  const queueShare = measuredRequestMs > 0 ? queueStats.totalMs / measuredRequestMs : 0;
  if (queueStats.p95Ms >= 1_000 || (queueStats.totalMs >= 2_000 && queueShare >= 0.25)) {
    addFinding(
      "warning",
      "request-queue",
      "Une part importante du temps est passée à attendre un créneau de requête.",
      { p95Ms: queueStats.p95Ms, totalMs: queueStats.totalMs, sharePercent: round(queueShare * 100) },
    );
  }
  if (executionStats.p95Ms >= 5_000 || executionStats.maxMs >= 15_000) {
    addFinding(
      "warning",
      "slow-http",
      "Certaines requêtes HTTP sont anormalement longues après acquisition d'un créneau.",
      { p95Ms: executionStats.p95Ms, maxMs: executionStats.maxMs },
    );
  }
  if (failedRequestCount > 0) {
    addFinding(
      "warning",
      "request-errors",
      "Des requêtes ont échoué ou renvoyé un statut non valide.",
      { failedRequestCount, requestCount: completedRequests.length },
    );
  }
  if (scheduling.schedulerWaitMs >= 2_000) {
    addFinding(
      "info",
      "scheduler-queue",
      "Les lots attendent aussi dans la file du planificateur avant même la file HTTP.",
      { totalMs: round(scheduling.schedulerWaitMs), maxMs: round(scheduling.maxSchedulerWaitMs) },
    );
  }
  scheduling.duplicateRetryWaitCount = [...retryWaitsByPage.values()].filter((reasons) => (
    reasons.has("retry-after-failure") && reasons.has("retry-before-attempt")
  )).length;
  if (scheduling.duplicateRetryWaitCount > 0) {
    addFinding(
      "warning",
      "double-retry-wait",
      "Une relance cumule une attente après l'échec puis une seconde attente avant la tentative suivante.",
      {
        affectedPageCount: scheduling.duplicateRetryWaitCount,
        retryWaitMs: round(scheduling.retryWaitMs),
      },
    );
  }
  if (scheduling.barrierIdleMs >= 2_000 && scheduling.barrierIdleMs >= elapsedMs * 0.15) {
    addFinding(
      "warning",
      "round-barrier",
      "Les sources rapides passent un temps notable à attendre la fin des sources lentes à chaque tour.",
      { idleMs: round(scheduling.barrierIdleMs), roundCount: scheduling.roundCount },
    );
  }
  if (detailRequestCount >= 10 && detailRequestCount > Math.max(1, addedResultCount) * 3) {
    addFinding(
      "warning",
      "detail-rejections",
      "Beaucoup de fiches détail sont vérifiées pour peu de résultats finalement gardés.",
      { detailRequestCount, addedResultCount },
    );
  }
  if (detailRequestCount === 0 && pageProcessing.postListing.p95Ms >= 1_500) {
    addFinding(
      "warning",
      "renderer-processing",
      "Le traitement local après chargement des pages est lent, même sans fiches détail.",
      { p95Ms: pageProcessing.postListing.p95Ms, maxMs: pageProcessing.postListing.maxMs },
    );
  } else if (detailRequestCount > 0 && pageProcessing.postListing.p95Ms >= 5_000) {
    addFinding(
      "info",
      "detail-phase",
      "La phase après chargement de liste, qui inclut l'enrichissement des fiches détail, est longue.",
      { p95Ms: pageProcessing.postListing.p95Ms, detailRequestCount },
    );
  }
  if (prefetchDecisionCount >= 3 && prefetchHitRate < 0.4) {
    addFinding(
      "info",
      "low-prefetch-hit-rate",
      "Une majorité des préchargements n'est pas consommée par la page demandée suivante.",
      { hitRatePercent: round(prefetchHitRate * 100), ...prefetch },
    );
  }
  if (!findings.length && completedRequests.length) {
    addFinding(
      "ok",
      "no-obvious-stall",
      "Aucune attente anormale évidente n'apparaît dans ce profil.",
      { requestCount: completedRequests.length, elapsedMs: round(elapsedMs) },
    );
  }

  const slowestRequests = [...completedRequests]
    .sort((left, right) => (
      toNumber(right.totalRequestMs) - toNumber(left.totalRequestMs)
    ))
    .slice(0, 10)
    .map((request) => ({
      sourceKey: request.sourceKey,
      purpose: request.purpose,
      pageIndex: request.pageIndex,
      queueWaitMs: round(request.queueWaitMs),
      executionMs: round(request.executionMs),
      totalRequestMs: round(request.totalRequestMs),
      status: request.status,
      url: request.url,
    }));

  return {
    filePath,
    session: {
      profileId: sessionStarted?.profileId,
      mode: sessionStarted?.data?.mode,
      searchKind: sessionStarted?.data?.searchKind || "latestSources",
      searchMode: sessionStarted?.data?.searchMode,
      resultLimitMode: sessionStarted?.data?.resultLimitMode,
      concurrency: sessionStarted?.data?.concurrency,
      sourceCount: sessionStarted?.data?.sourceCount,
      status: sessionFinished?.data?.status,
      elapsedMs: round(elapsedMs),
    },
    requests: {
      count: completedRequests.length,
      failedRequestCount,
      queue: queueStats,
      execution: executionStats,
      total: totalStats,
      detailRequestCount,
      byPurpose: [...byPurpose.values()].sort((left, right) => right.executionMs - left.executionMs),
      slowest: slowestRequests,
    },
    scheduling: {
      ...scheduling,
      totalRoundMs: round(scheduling.totalRoundMs),
      schedulerWaitMs: round(scheduling.schedulerWaitMs),
      maxSchedulerWaitMs: round(scheduling.maxSchedulerWaitMs),
      barrierIdleMs: round(scheduling.barrierIdleMs),
      paceWaitMs: round(scheduling.paceWaitMs),
      pagePacingWaitMs: round(scheduling.pagePacingWaitMs),
      retryWaitMs: round(scheduling.retryWaitMs),
      sourceBatchCount,
      sourceBatchDuration: buildStats(sourceBatchDurations),
    },
    pageProcessing,
    prefetch: {
      ...prefetch,
      unconsumedEstimate: Math.max(0, prefetch.started - prefetch.hits),
      hitRatePercent: round(prefetchHitRate * 100),
    },
    cache,
    engine,
    results: { addedResultCount },
    sources: [...sourceStats.values()]
      .map((source) => ({
        ...source,
        queueWaitMs: round(source.queueWaitMs),
        executionMs: round(source.executionMs),
      }))
      .sort((left, right) => right.executionMs + right.queueWaitMs - left.executionMs - left.queueWaitMs),
    findings,
  };
};

const resolveDiagnosticDirectory = () => {
  const identity = resolveAppIdentity();
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) throw new Error("LOCALAPPDATA est indisponible.");
  return path.join(localAppData, identity.userDataDirName, "data", "scraper-search-diagnostics");
};

const findLatestDiagnosticFile = (directoryPath) => {
  if (!fs.existsSync(directoryPath)) return null;
  return fs.readdirSync(directoryPath)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => {
      const filePath = path.join(directoryPath, name);
      return { filePath, modifiedAt: fs.statSync(filePath).mtimeMs };
    })
    .sort((left, right) => right.modifiedAt - left.modifiedAt)[0]?.filePath || null;
};

const formatMs = (value) => `${round(value)} ms`;

const printSummary = (summary) => {
  console.log(`Profil: ${summary.filePath}`);
  console.log(`Session: ${summary.session.searchKind || "?"} / ${summary.session.mode || "?"}, ${summary.session.elapsedMs} ms, ${summary.requests.count} requêtes`);
  console.log(`File HTTP: total ${formatMs(summary.requests.queue.totalMs)}, p95 ${formatMs(summary.requests.queue.p95Ms)}, max ${formatMs(summary.requests.queue.maxMs)}`);
  console.log(`HTTP réel: total ${formatMs(summary.requests.execution.totalMs)}, p95 ${formatMs(summary.requests.execution.p95Ms)}, max ${formatMs(summary.requests.execution.maxMs)}`);
  console.log(`Planificateur: attente ${formatMs(summary.scheduling.schedulerWaitMs)}, barrière ${formatMs(summary.scheduling.barrierIdleMs)}, ${summary.scheduling.roundCount} tour(s)`);
  console.log(`Temporisation volontaire: ${formatMs(summary.scheduling.paceWaitMs)} (pages ${formatMs(summary.scheduling.pagePacingWaitMs)}, relances ${formatMs(summary.scheduling.retryWaitMs)})`);
  console.log(`Pages: chargement p95 ${formatMs(summary.pageProcessing.listingLoad.p95Ms)}, traitement après liste p95 ${formatMs(summary.pageProcessing.postListing.p95Ms)}`);
  console.log(`Préchargement: ${summary.prefetch.hits} utilisé(s), ${summary.prefetch.misses} raté(s), ${summary.prefetch.replaced} remplacé(s), taux ${summary.prefetch.hitRatePercent}%`);
  console.log(`Cache: ${summary.cache.memoryHits} hit(s) mémoire, ${summary.cache.diskHits} hit(s) disque, ${summary.cache.networkRequests} requête(s) réseau`);
  console.log(`Moteur: ${summary.engine.detailsRequested} fiche(s) chargée(s), ${summary.engine.detailsSkipped} évitée(s), ${summary.engine.tasksMerged} tâche(s) fusionnée(s), ${summary.engine.checkpointResumes} reprise(s)`);
  console.log("Diagnostic:");
  summary.findings.forEach((finding) => console.log(`- [${finding.severity}] ${finding.message}`));
  if (summary.requests.slowest.length) {
    console.log("Requêtes les plus lentes:");
    summary.requests.slowest.slice(0, 5).forEach((request) => {
      console.log(`- ${request.sourceKey || "?"} / ${request.purpose || "?"}: ${formatMs(request.totalRequestMs)} (${formatMs(request.queueWaitMs)} en file + ${formatMs(request.executionMs)} HTTP)`);
    });
  }
};

const main = () => {
  const fileArgumentIndex = process.argv.findIndex((argument) => argument === "--file");
  const requestedFile = fileArgumentIndex >= 0 ? process.argv[fileArgumentIndex + 1] : null;
  const filePath = requestedFile
    ? path.resolve(requestedFile)
    : findLatestDiagnosticFile(resolveDiagnosticDirectory());
  if (!filePath) {
    throw new Error("Aucun profil de recherche scraper n'a encore été trouvé.");
  }
  const summary = buildSummary(readDiagnosticEntries(filePath), filePath);
  const summaryPath = filePath.replace(/\.jsonl$/i, ".summary.json");
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  printSummary(summary);
  console.log(`Rapport JSON: ${summaryPath}`);
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = {
  buildStats,
  buildSummary,
  findLatestDiagnosticFile,
  readDiagnosticEntries,
};
