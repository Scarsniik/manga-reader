# Source linking

Mangas downloaded from a scraper store their origin with:

- `sourceKind: "scraper"`
- `scraperId`
- `sourceUrl`
- optional `sourceChapterUrl` and `sourceChapterLabel`

The library card action **Voir source** opens the configured scraper on the stored source when the scraper still exists. If the scraper was deleted, the same action opens `sourceUrl` in the system browser.

On a scraper details page, the download button changes to a redownload action when a matching library manga is already linked to the current source. Redownloading keeps the existing manga entry and replaces only the local image files in its folder.

Search result cards and scraper bookmark cards expose the same standalone download action when the scraper has `Fiche` and `Pages` configured without chapter linking. The card action uses the download icon; it switches to the linked yellow state when a local manga already matches the scraper source.

The scraper bookmarks view can filter saved cards by text, including title, source, author and tag text, detected bookmark languages, page count range and reading status. Its **Tags frequents** action opens a tag statistics dialog with a minimum occurrence threshold, a current-selection/all-scope switch, and optional fuzzy grouping to merge similar tag names across scrapers. Tags already linked through the same tag favorite are merged automatically, even when fuzzy grouping is disabled. Clicking a tag applies it to the bookmark text search, while middle-clicking the action or a tag opens the same target in a workspace tab. When a bookmark has no detected language but its scraper has exactly one configured source language, that source language is treated as the bookmark manga language. The reading status uses the scraper reader progress when available, then falls back to the explicit card read marker stored in the view history. The same view has a **Rescraper les bookmarks** action that reloads every saved bookmark through its current scraper details configuration and saves newly found metadata, including languages.

Multi-source search and author favorites also expose reading status filters. In merged result mode, the filter applies to the whole merged card instead of individual sources: a matching card is displayed with all its sources, and a non-matching card is hidden entirely. A merged card is considered read when at least one source is completed, in progress when no source is completed but at least one source has progress, and unread otherwise.
Merged result cards include a compact read toggle next to the reading progress block. When one or more sources are in progress, marking the card as read only writes a read marker for those in-progress sources. When no source has started, the read marker is written only on the first source. Clearing the read state removes only the explicit read markers already written by that toggle.
Clicking an in-progress block opens the scraper reader directly on the saved page for that source. When the progress belongs to a chapter-based reader, the card resolves the matching chapter before opening the reader.

Search result cards and scraper bookmark cards also write a compact view history in `scraper-view-history.json` under the Electron `userData/data` folder, but only after at least 80% of the card surface stays visible in the viewport for 1 second. A card is identified by `scraperId` plus its source URL when available, otherwise by `scraperId`, title and thumbnail, then only the compact id, scraper id, optional source URL, first seen date and optional read date are persisted. Cards absent from history when the current list is loaded keep a green border for that list session, even after the viewport dwell writes them to history. Opening a scraper details page stores a temporary snapshot of the listing state, so browser/back navigation restores the same first-view display instead of recalculating it from the persisted history. Cards already present in history use the default border, and cards marked with the read button get a grey border. By default, the history keeps seen-only records for 45 days, read records for 365 days, and caps the file at 5000 records. These three cleanup values are configurable in the application settings, and `0` disables the corresponding cleanup. History mutations are serialized before writing the JSON file, and the reader repairs extra trailing closing brackets if an older file was left in that state.

The scraper details page also provides:

- **Lier a un manga** / **Changer le lien**, to attach the current scraper source to an existing local manga through a searchable cover grid. When the source was already linked to another manga, validating a new selection clears the previous link.
- **Ouvrir dans le navigateur**, to open the current source URL outside the app.
