# Historique

La vue `Historique` est accessible depuis le select principal de l'accueil.

Elle regroupe pour le moment trois onglets :

- `Lecture` : lectures locales et lectures ouvertes depuis les scrappers.
- `Fiches consultees` : fiches manga scrapper reellement ouvertes.
- `Recherches` : recherches lancees depuis un scrapper ou depuis la recherche multi-source.

## Donnees

L'historique est stocke dans la base locale utilisateur `data/collections.sqlite`.
Au premier lancement avec cette base, l'ancien fichier `data/history.json` est
importe dans une transaction avec les bookmarks, l'historique de vue et les
progressions scraper. Les fichiers JSON existants sont conserves sans
modification comme sauvegarde de migration.

La suppression depuis cette vue retire seulement l'entree d'historique. Elle ne supprime pas le manga local, le bookmark scraper, ni la progression de lecture.

Les recherches multi-source conservent la chaine recherchee et les settings utiles au lancement : scrappers, langues, types, profondeur, rythme et vue. Les recherches scraper conservent la chaine recherchee et le scrapper source.

La progression reste portee par les donnees existantes :

- mangas locaux : `mangas.json`
- lectures scrapper : table locale `scraper_reader_progress`

## UI

La vue fournit :

- une recherche simple ;
- un filtre par source/scrapper ;
- une pagination pour limiter le nombre de cards affichees ;
- des onglets declaratifs pour pouvoir ajouter d'autres historiques plus tard.

Les onglets `Lecture` et `Fiches consultees` utilisent des cards. L'onglet `Recherches` utilise des lignes compactes pour supporter un volume plus important.

Quand une fiche source est disponible, un clic gauche sur une card l'ouvre dans
la vue courante et un clic molette l'ouvre dans un nouvel onglet workspace. Dans
l'onglet `Lecture`, le bouton `Reprendre` conserve un comportement distinct : il
ouvre le lecteur, avec le clic molette disponible pour l'ouvrir dans un nouvel
onglet workspace.
