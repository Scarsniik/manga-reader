# Background searches

## User behavior

Supported searches can be switched to background mode from their own screen. The switch is remembered independently for:

- multi-source searches;
- scraper author searches;
- latest scraper scans;
- latest favorite-author scans;
- favorite-author cache refreshes.
- intelligent manga correspondence searches launched from a manga details page.

The header button opens a compact activity list. A left click restores a job in the active application view. A middle click opens it in a workspace tab. Opening a running job attaches the view to the existing execution and displays partial results without starting a second network request.

## Ownership and concurrency

Electron main owns job identity, metadata, status transitions, storage, cleanup, and notifications. The main application renderer owns execution because scraper extraction requires browser APIs such as `DOMParser`. Workspace renderers never claim queued jobs.

Every job has a UUID and its own input, progress, cancellation signal, result snapshot, and revision. The renderer can execute several jobs concurrently. `backgroundSearchMaxConcurrent` limits job-level concurrency; scraper-level concurrency remains controlled by each adapter.

Manga correspondence jobs snapshot `scraperLatestConcurrency` when they are created. The dialogue does not expose a concurrency control, and every title or author exploration batch uses that configured limit.

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
