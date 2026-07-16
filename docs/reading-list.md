# Listes de lecture

## Création

La barre supérieure expose un menu `Actions` lorsque la surface courante possède au moins une action disponible.
Dans le workspace, l'action `Convertir les onglets en liste de lecture` apparaît lorsqu'au moins un onglet affiche une
fiche manga ou un lecteur.

La conversion respecte l'ordre des onglets. Par défaut, les onglets sources sont fermés et remplacés par un onglet
`Liste de lecture`. L'option générale `Conserver les onglets manga après la création d'une liste de lecture` permet de
les garder.

### Depuis les bookmarks

La page Bookmarks propose aussi l'action `Créer une liste de lecture`. Elle ouvre une modale permettant de choisir le
nombre de mangas et d'activer ou non une lecture aléatoire. La sélection est construite depuis les bookmarks actuellement
affichés : elle respecte donc le scrapper courant, la recherche, tous les filtres et le tri choisi.

Sans lecture aléatoire, les premiers bookmarks sont pris dans leur ordre d'affichage. Avec l'option active, les bookmarks
affichés sont mélangés avant la sélection. La création ouvre et active un nouvel onglet `Liste de lecture` dans le
workspace.

## Enregistrement

La page de préparation permet d'enregistrer la liste telle qu'elle est affichée. Une liste enregistrée conserve son
ordre, ses mangas et les métadonnées utiles à leur affichage et à leur réouverture. Elle n'a pour le moment ni nom ni
description.

Lorsqu'une liste enregistrée est rouverte, toute modification suivie d'un nouvel enregistrement met à jour cette même
liste. Son identifiant et sa date de création sont conservés ; aucune copie supplémentaire n'est créée.

Les listes sont stockées dans le fichier utilisateur `data/saved-reading-lists.json`. Elles restent donc disponibles
après la fermeture du workspace ou de l'application.

La page Bookmarks possède deux onglets :

- `Bookmarks`, ouvert par défaut, conserve la vue et les actions existantes ;
- `Listes`, affiche une ligne par liste enregistrée avec le nombre de mangas, un aperçu des premières couvertures et la
  date d'enregistrement.

Un clic sur une ligne ouvre la page de préparation de la liste dans le workspace. Le bouton `Lecture` l'ouvre et lance
directement le premier manga. Le bouton `Supprimer` efface la liste enregistrée sans supprimer ses mangas, leurs
bookmarks ou leur progression.

## Options

La page de liste propose trois options avant le lancement :

- `Lecture aléatoire`, désactivée par défaut, mélange une fois la liste au lancement ;
- `Retirer le bookmark après lecture`, activée par défaut, retire un bookmark scraper existant lorsque le manga est terminé ;
- `Reprendre depuis la progression`, activée par défaut, reprend chaque manga à sa progression enregistrée. Une lecture
  déjà terminée redémarre à la première page.

Les éléments peuvent être retirés de la liste avant le lancement.
Les cards de préparation et de résumé ouvrent leur fiche manga dans un nouvel onglet workspace au clic ou au clavier.
Le survol de la card affiche le nom du manga.

## Ordre des mangas

Dans la page de préparation, chaque card possède une poignée permettant de déplacer le manga par glisser-déposer.
Lorsque la poignée a le focus, les flèches du clavier déplacent aussi le manga d'une position. Le nouvel ordre est utilisé
au lancement et conservé lors de l'enregistrement de la liste.

Le bouton `Tri automatique` applique d'abord les règles personnalisées d'analyse des titres du scraper source. Il utilise
ensuite la même normalisation que les merges de cards pour ignorer notamment les auteurs entre crochets et les marqueurs
de langue, puis recherche les numéros de tome, de partie ou de chapitre. Il reconnaît les libellés français et anglais
courants (`tome`, `volume`, `vol`, `chapitre`, `chapter`, `ch`), les nombres décimaux, les plages, les chiffres romains,
les numéros placés à la fin d'un titre ainsi que les marqueurs japonais de chapitre et de tome. Le tome est trié avant la
partie et le chapitre lorsqu'un titre contient plusieurs informations. Les titres non reconnus et les séries différentes
conservent leur emplacement afin de limiter les déplacements erronés ; l'ordre peut ensuite être corrigé manuellement.
Le bouton indique explicitement lorsque l'ordre détecté était déjà appliqué.

L'option `Lecture aléatoire` mélange toujours la liste au lancement et prend donc la priorité sur l'ordre manuel ou
automatique pour la session concernée.

## Lecture

Le lecteur normal est réutilisé. En mode liste de lecture, l'enchaînement de la liste prend la priorité sur les chapitres
ou mangas adjacents d'une série.

Après la dernière page d'un manga, une transition indique le titre, la couverture et la position du prochain élément.
Cette transition permet aussi d'ouvrir la fiche du manga terminé dans un nouvel onglet. Les commandes `Suivant`, clavier
et souris du lecteur continuent la liste. Le dernier manga affiche la même transition avant le résumé. Le bouton retour
du lecteur revient à la page de préparation de la liste.

Pendant la lecture, l'action `Passer au manga suivant` ouvre directement cette transition sans marquer le manga courant
comme lu et sans retirer son bookmark. La poursuite depuis la transition charge ensuite l'élément suivant normalement.

Tant qu'il reste des mangas, la transition propose aussi `Terminer la liste`. Cette action ouvre immédiatement le résumé
sans marquer les éléments restants comme lus. Les cards du résumé indiquent explicitement `Lu` ou `Non lu` selon ce qui
a été parcouru pendant la session.

Lorsqu'un élément ne peut pas être résolu en lecteur, la page permet de réessayer, de le passer ou de revenir à la liste.

Après le dernier manga, un résumé affiche les éléments dans l'ordre effectivement lu, avec leurs auteurs, langues et
l'état éventuel de suppression du bookmark.
