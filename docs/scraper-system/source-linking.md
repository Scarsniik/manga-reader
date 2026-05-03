# Source linking

Mangas downloaded from a scraper store their origin with:

- `sourceKind: "scraper"`
- `scraperId`
- `sourceUrl`
- optional `sourceChapterUrl` and `sourceChapterLabel`

The library card action **Voir source** opens the configured scraper on the stored source when the scraper still exists. If the scraper was deleted, the same action opens `sourceUrl` in the system browser.

On a scraper details page, the download button changes to a redownload action when a matching library manga is already linked to the current source. Redownloading keeps the existing manga entry and replaces only the local image files in its folder.

Search result cards and scraper bookmark cards expose the same standalone download action when the scraper has `Fiche` and `Pages` configured without chapter linking. The card action uses the download icon; it switches to the linked yellow state when a local manga already matches the scraper source.

The scraper bookmarks view can filter saved cards by text, detected bookmark languages, page count range and reading status. When a bookmark has no detected language but its scraper has exactly one configured source language, that source language is treated as the bookmark manga language. The reading status uses the scraper reader progress when available, then falls back to the explicit card read marker stored in the view history. The same view has a **Rescraper les bookmarks** action that reloads every saved bookmark through its current scraper details configuration and saves newly found metadata, including languages.

Search result cards and scraper bookmark cards also write a compact view history in `scraper-view-history.json` under the Electron `userData/data` folder, but only when a scroll crosses their vertical position. The scroll check uses the central viewport band swept between the previous and current scroll positions, so fast scrolls still mark rows passed between two frames. A card is identified by `scraperId` plus its source URL when available, otherwise by `scraperId`, title and thumbnail, then only the compact id, scraper id, optional source URL, first seen date and optional read date are persisted. Cards absent from history when the current list is loaded keep a green border for that list session, even after the scroll writes them to history. Opening a scraper details page stores a temporary snapshot of the listing state, so browser/back navigation restores the same first-view display instead of recalculating it from the persisted history. Cards already present in history use the default border, and cards marked with the read button get a grey border. The history keeps read records longer than seen-only records and prunes old entries automatically, with a hard cap of 5000 records. History mutations are serialized before writing the JSON file, and the reader repairs extra trailing closing brackets if an older file was left in that state.

The scraper details page also provides:

- **Lier a un manga** / **Changer le lien**, to attach the current scraper source to an existing local manga through a searchable cover grid. When the source was already linked to another manga, validating a new selection clears the previous link.
- **Ouvrir dans le navigateur**, to open the current source URL outside the app.
