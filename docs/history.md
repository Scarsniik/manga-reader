# Historique

La vue `Historique` est accessible depuis le select principal de l'accueil.

Elle regroupe pour le moment trois onglets :

- `Lecture` : lectures locales et lectures ouvertes depuis les scrappers.
- `Fiches consultees` : fiches manga scrapper reellement ouvertes.
- `Recherches` : recherches lancees depuis un scrapper ou depuis la recherche multi-source.

## Donnees

L'historique est stocke dans le fichier utilisateur `data/history.json`.

La suppression depuis cette vue retire seulement l'entree d'historique. Elle ne supprime pas le manga local, le bookmark scraper, ni la progression de lecture.

Les recherches multi-source conservent la chaine recherchee et les settings utiles au lancement : scrappers, langues, types, profondeur, rythme et vue. Les recherches scraper conservent la chaine recherchee et le scrapper source.

La progression reste portee par les donnees existantes :

- mangas locaux : `mangas.json`
- lectures scrapper : `scraper-reader-progress.json`

## UI

La vue fournit :

- une recherche simple ;
- un filtre par source/scrapper ;
- une pagination pour limiter le nombre de cards affichees ;
- des onglets declaratifs pour pouvoir ajouter d'autres historiques plus tard.

Les onglets `Lecture` et `Fiches consultees` utilisent des cards. L'onglet `Recherches` utilise des lignes compactes pour supporter un volume plus important.
