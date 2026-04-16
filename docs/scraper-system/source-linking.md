# Source linking

Mangas downloaded from a scraper store their origin with:

- `sourceKind: "scraper"`
- `scraperId`
- `sourceUrl`
- optional `sourceChapterUrl` and `sourceChapterLabel`

The library card action **Voir source** opens the configured scraper on the stored source when the scraper still exists. If the scraper was deleted, the same action opens `sourceUrl` in the system browser.

On a scraper details page, the download button changes to a redownload action when a matching library manga is already linked to the current source. Redownloading keeps the existing manga entry and replaces only the local image files in its folder.

The scraper details page also provides:

- **Lier a un manga** / **Changer le lien**, to attach the current scraper source to an existing local manga through a searchable cover grid. When the source was already linked to another manga, validating a new selection clears the previous link.
- **Ouvrir dans le navigateur**, to open the current source URL outside the app.
