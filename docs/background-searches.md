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

Manga correspondence pages are parsed as lightweight cards first. The existing rejected-candidate score then selects direct matches and the `possible`/`likely` review bands for detail-page enrichment. Distant rejections do not load their detail page, while selected candidates are analyzed again after the shared cached enrichment step. A candidate remains available from its lightweight card if its detail request fails.

The chapter view re-analyzes stored raw titles so parser improvements also repair existing temporary results. All accepted sources for the same parsed chapter are presented in one card, and the card title and cover follow the same source selected by the global merged-title language priority. A result whose parsed title exactly matches a known series title and has no chapter, part, volume, extra, bonus, ongoing or compilation marker is treated as chapter 1.

From the chapter view, the user can create a reading list for one of the languages present in the result. The dialogue reports the number of covered chapters and names missing chapters before allowing an intentionally incomplete list. For every missing chapter, the user may select an openable source from another or an unknown language, open that source in a workspace tab for manual verification, and keep it as a replacement. The created list contains one source per covered or manually replaced chapter, in chapter order.

Correspondence progress counts executed title and author searches. The trace also includes title and author discoveries, so the UI labels these separately as searches and trace events instead of calling both values steps.

Manga correspondence results expose every discovered title and author separately per scraper. The two-tab review dialog can invalidate or reactivate reference, card, details, and author-page discoveries. A full replay is refused when no title remains active; all authors may be disabled. Replay replaces matches, rejected candidates, trace, and unreachable branches, while keeping manual reviews and chapter corrections only for identities found again. The additive pass based on accepted rejected candidates remains a separate action.

Author correspondence jobs reuse the multi-source scraper selection, depth, pacing and concurrency settings. For each searched name they combine regular manga search followed by author-link extraction with direct attempts against scrapers whose Author module uses a URL template. Their result stores each matching author page and a small preview of its first manga results. Preview images keep the page's current remote image source and every configured fallback candidate, while ignoring inline lazy-loading placeholders. The result review dialog can add another author name or a recognized author-page URL, invalidate existing results, and replay the full search. A name is searched on every enabled source, while a recognized URL also becomes a direct target for its scraper. The result and combined-author views can group every non-invalidated page into one existing or new author favorite.

Latest favorite-author background scans use the persisted global scraping concurrency, not a temporary session override. They are limited by the configured author page count, not by a result quota or the quick scan's consecutive already-seen boundary. Detail-page enrichment is deferred until after history filtering so known cards do not generate unnecessary requests.

Latest source background scans persist the selected result-limit mode in their job input. In the default `total` mode, the scraper quota is shared by all regular scrapers, while the tag quota is applied separately to each favorite tag and shared only by that tag's sources. Each quota group recalculates balanced optimistic batches after every pass from the results actually accepted by each source. A missing share is redistributed after a confirmed pagination end, or when a source produces no result before its language-rejection or page safety boundary. That filtered unavailability is cached for 24 hours for the same source, tag query and language selection. Ordinary filtering, an error, or a boundary reached after at least one accepted result does not change another source's target. Foreground and background scans both call `runScraperLatestSearch`, rather than maintaining separate scraping loops. Lightweight cards stay buffered, listing pages required by the current batches are prefetched, and one following page can be anticipated as soon as rejections make it necessary. Listing and detail requests still share the configured global request limit. Older jobs without the mode field keep their original per-source behavior, and legacy tag source ids still recover their favorite-tag group.

All foreground and background scraper searches use the same optional performance trace format. Reports are disabled by default and can be enabled in the Developer settings tab. Each enabled run records its engine and phase, request-limiter waits separately from HTTP execution, memory/disk cache hits, scheduler rounds, source batches, detail enrichment, task merging, checkpoint resumes, and listing-page prefetch reuse. Profiles are stored below `data/scraper-search-diagnostics` and can be summarized with `npm run diagnostics:search` (the previous command remains an alias).

Status transitions are:

`queued -> running -> completed | error | cancelled`

Persistent running jobs found after an application restart become `queued` and resume their last compatible checkpoint. Memory-only jobs become `expired`. Results whose retention period ended also become `expired`.

## Storage

The metadata index is stored in `data/background-searches.json`. It is intentionally small so opening the activity list never loads result payloads. New jobs also keep a persistent unopened marker until the user opens them from the list or from a native notification.

Inputs are stored separately by job so an expired or interrupted search can still be prefilled and restarted. Results use one isolated payload per job:

- `memory`: the result exists only in the Electron process and expires when the application closes;
- `temporaryFile`: the result is written atomically below the operating-system temporary directory and survives restarts until its job-specific expiration time.

Correspondence jobs also own a compressed document cache below the operating-system temporary directory. It lasts at most 24 hours, is capped at 64 MiB for one job and 256 MiB globally, never stores failed requests or image validations, and is deleted when the owning job is deleted or expires.

Deleting a terminal job removes its temporary result, stored input, and metadata. Temporary result cleanup also runs whenever the queue is read.

## Renderer attachment

Workspace targets and route state carry only `backgroundSearchJobId`. The destination view then loads that one payload and subscribes to lightweight change events containing `jobId`, `revision`, `status`, and progress. It reloads the full snapshot only for revisions of the attached job.

## Adding a search type

1. Add the kind and its versioned input contract to `src/shared/backgroundSearch.ts`.
2. Add a canonical engine and its adapter branch to `src/renderer/searchEngines/searchEngineRegistry.ts`. The engine must accept an `AbortSignal` and publish serializable partial snapshots. If a foreground variant exists, it must call that same engine.
3. Add a remembered foreground/background switch at the existing launch point and enqueue a fully resolved input snapshot.
4. Map the kind to its destination view in `backgroundSearchNavigation.ts`.
5. Teach the destination view to hydrate its parameters and results through `useBackgroundSearchJob` without issuing a duplicate request.
6. Add status/result-count coverage and document any canonical-cache side effects.

Adapters must store extracted data, not React state or rendered elements. This keeps payloads portable and allows result presentation to evolve independently.
