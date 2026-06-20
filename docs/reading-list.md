# Listes de lecture temporaires

## Création

La barre supérieure expose un menu `Actions` lorsque la surface courante possède au moins une action disponible.
Dans le workspace, l'action `Convertir les onglets en liste de lecture` apparaît lorsqu'au moins un onglet affiche une
fiche manga ou un lecteur.

La conversion respecte l'ordre des onglets. Par défaut, les onglets sources sont fermés et remplacés par un onglet
`Liste de lecture`. L'option générale `Conserver les onglets manga après la création d'une liste de lecture` permet de
les garder. La liste reste uniquement en mémoire et disparaît avec la session du workspace.

### Depuis les bookmarks

La page Bookmarks propose aussi l'action `Créer une liste de lecture`. Elle ouvre une modale permettant de choisir le
nombre de mangas et d'activer ou non une lecture aléatoire. La sélection est construite depuis les bookmarks actuellement
affichés : elle respecte donc le scrapper courant, la recherche, tous les filtres et le tri choisi.

Sans lecture aléatoire, les premiers bookmarks sont pris dans leur ordre d'affichage. Avec l'option active, les bookmarks
affichés sont mélangés avant la sélection. La création ouvre et active un nouvel onglet `Liste de lecture` dans le
workspace.

## Options

La page de liste propose trois options avant le lancement :

- `Lecture aléatoire`, désactivée par défaut, mélange une fois la liste au lancement ;
- `Retirer le bookmark après lecture`, désactivée par défaut, retire un bookmark scraper existant lorsque le manga est terminé ;
- `Reprendre depuis la progression`, activée par défaut, reprend chaque manga à sa progression enregistrée. Une lecture
  déjà terminée redémarre à la première page.

Les éléments peuvent être retirés de la liste avant le lancement.
Les cards de préparation et de résumé ouvrent leur fiche manga dans un nouvel onglet workspace au clic ou au clavier.

## Lecture

Le lecteur normal est réutilisé. En mode liste de lecture, l'enchaînement de la liste prend la priorité sur les chapitres
ou mangas adjacents d'une série.

Après la dernière page d'un manga, une transition indique le titre, la couverture et la position du prochain élément.
Cette transition permet aussi d'ouvrir la fiche du manga terminé dans un nouvel onglet. Les commandes `Suivant`, clavier
et souris du lecteur continuent la liste. Le dernier manga affiche la même transition avant le résumé. Le bouton retour
du lecteur revient à la page de préparation de la liste.

Tant qu'il reste des mangas, la transition propose aussi `Terminer la liste`. Cette action ouvre immédiatement le résumé
sans marquer les éléments restants comme lus. Les cards du résumé indiquent explicitement `Lu` ou `Non lu` selon ce qui
a été parcouru pendant la session.

Lorsqu'un élément ne peut pas être résolu en lecteur, la page permet de réessayer, de le passer ou de revenir à la liste.

Après le dernier manga, un résumé affiche les éléments dans l'ordre effectivement lu, avec leurs auteurs, langues et
l'état éventuel de suppression du bookmark.
