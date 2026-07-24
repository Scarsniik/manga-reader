# Background searches

## User behavior

Supported searches can be switched to background mode from their own screen. The switch is remembered independently for:

- multi-source searches;
- scraper author searches;
- latest scraper scans;
- latest favorite-author scans;
- favorite-author cache refreshes.
- intelligent manga correspondence searches launched from a manga details page.
- author correspondence searches launched from an author page or a favorite author.

The header button opens a compact activity list. A left click restores a job in the active application view. A middle click opens it in a workspace tab. Opening a running job attaches the view to the existing execution and displays partial results without starting a second network request.

## Ownership and concurrency

Electron main owns job identity, metadata, status transitions, storage, cleanup, and notifications. The main application renderer owns execution because scraper extraction requires browser APIs such as `DOMParser`. Workspace renderers never claim queued jobs.

Every job has a UUID and its own input, progress, cancellation signal, result snapshot, and revision. The renderer can execute several jobs concurrently. `backgroundSearchMaxConcurrent` limits job-level concurrency; scraper-level concurrency remains controlled by each adapter.

Manga correspondence jobs snapshot `scraperLatestConcurrency` when they are created. The dialogue does not expose a concurrency control, and every title or author exploration batch uses that configured limit.

Manga correspondence title analysis uses the scraper-specific parser when it is configured, otherwise it enables the built-in structured parser. A tolerant fallback handles convention prefixes, nested release metadata, translated-title separators, bare chapter numbers and punctuation. Parsed primary and alternative titles can both create follow-up searches, while parsed chapter markers are stored with every match for the chapter view.

The chapter view re-analyzes stored raw titles so parser improvements also repair existing temporary results. All accepted sources for the same parsed chapter are presented in one card, and the card title and cover follow the same source selected by the global merged-title language priority. A result whose parsed title exactly matches a known series title and has no chapter, part, volume, extra, bonus, ongoing or compilation marker is treated as chapter 1.

From the chapter view, the user can create a reading list for one of the languages present in the result. The dialogue reports the number of covered chapters and names missing chapters before allowing an intentionally incomplete list. For every missing chapter, the user may select an openable source from another or an unknown language, open that source in a workspace tab for manual verification, and keep it as a replacement. The created list contains one source per covered or manually replaced chapter, in chapter order.

Correspondence progress counts executed title and author searches. The trace also includes title and author discoveries, so the UI labels these separately as searches and trace events instead of calling both values steps.

Author correspondence jobs reuse the multi-source scraper selection, depth, pacing and concurrency settings. For each searched name they combine regular manga search followed by author-link extraction with direct attempts against scrapers whose Author module uses a URL template. Their result stores each matching author page and a small preview of its first manga results.

Latest favorite-author background scans use the persisted global scraping concurrency, not a temporary session override. In quick mode, each source stops after the configured consecutive already-seen boundary. Detail-page enrichment is deferred until after history filtering so known cards do not generate unnecessary requests.

Status transitions are:

`queued -> running -> completed | error | cancelled`

Running jobs found after an application restart become `interrupted`. Results whose retention period ended become `expired`.

## Storage

The metadata index is stored in `data/background-searches.json`. It is intentionally small so opening the activity list never loads result payloads. New jobs also keep a persistent unopened marker until the user opens them from the list or from a native notification.

Inputs are stored separately by job so an expired or interrupted search can still be prefilled and restarted. Results use one isolated payload per job:

- `memory`: the result exists only in the Electron process and expires when the application closes;
- `temporaryFile`: the result is written atomically below the operating-system temporary directory and survives restarts until its job-specific expiration time.

Deleting a terminal job removes its temporary result, stored input, and metadata. Temporary result cleanup also runs whenever the queue is read.

## Renderer attachment

Workspace targets and route state carry only `backgroundSearchJobId`. The destination view then loads that one payload and subscribes to lightweight change events containing `jobId`, `revision`, `status`, and progress. It reloads the full snapshot only for revisions of the attached job.

## Adding a search type

1. Add the kind and its versioned input contract to `src/shared/backgroundSearch.ts`.
2. Add an adapter branch to `backgroundSearchEngine.ts`. The adapter must accept an `AbortSignal` and publish serializable partial snapshots.
3. Add a remembered foreground/background switch at the existing launch point and enqueue a fully resolved input snapshot.
4. Map the kind to its destination view in `backgroundSearchNavigation.ts`.
5. Teach the destination view to hydrate its parameters and results through `useBackgroundSearchJob` without issuing a duplicate request.
6. Add status/result-count coverage and document any canonical-cache side effects.

Adapters must store extracted data, not React state or rendered elements. This keeps payloads portable and allows result presentation to evolve independently.
