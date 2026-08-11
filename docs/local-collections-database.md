# Base locale des collections

## Perimetre

Les collections volumineuses sont stockees dans
`userData/data/collections.sqlite` :

- bookmarks scraper ;
- historique des cards scraper vues ;
- historique de lecture, de fiches et de recherches ;
- progressions de lecture scraper.

Les configurations et les petites collections restent en JSON.

## Migration JSON

La base et son schema versionne sont initialises avant la creation des fenetres.
Si la migration `legacy_json_import_v1` n'est pas encore enregistree, les quatre
anciens stockages JSON sont lus et normalises avant l'ouverture d'une
transaction SQLite unique. Le marqueur de migration et toutes les donnees sont
valides dans la meme transaction.

Une erreur de lecture ou d'ecriture annule toute l'importation. Le prochain
lancement peut alors la retenter. Les fichiers JSON sources ne sont ni supprimes
ni reecrits et restent disponibles comme sauvegarde de migration.

## Ecritures et lectures

Les ajouts et modifications utilisent des `UPSERT` cibles. Les suppressions ne
touchent que les lignes selectionnees. Les lots de cards vues sont ecrits dans
une transaction, puis les regles de conservation sont appliquees directement
par des requetes indexees.

La base utilise le mode WAL, `synchronous=NORMAL`, les cles etrangeres et un
delai d'attente en cas de verrou temporaire. L'application ferme explicitement
la connexion avant de quitter. Les sauvegardes utilisateur doivent continuer a
etre realisees application fermee afin que la base et son WAL forment un
snapshot coherent.

## Correspondances de bookmarks

Le comparateur fonctionnel reste celui utilise par le multi-search : URL,
variantes exactes, romanisations, auteurs, marqueurs de sequence et comparaison
floue prudente. Un index en memoire utilise les URLs normalisees, les variantes
exactes et les longueurs floues pour ne soumettre au comparateur final que les
candidats possibles. Cette presselection ne change pas les decisions du moteur.

Le meme index est partage par les fiches et les cards des pages scraper, y
compris les cards fusionnees des recherches multi-sources et des vues
combinees. Seules les cards actuellement rendues par la grille virtualisee
sont verifiees. Elles sont analysees en lot, par petits groupes entre deux frames, afin de ne
pas bloquer leur affichage. Les correspondances couvrent les bookmarks, les
mangas lus ou en cours et les listes de lecture. Les listes restent dans leur
stockage existant : elles sont chargees une seule fois et indexees en memoire,
donc une migration supplementaire n'apporterait pas de gain utile actuellement.
