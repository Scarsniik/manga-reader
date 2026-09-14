# Review rapide

La review rapide permet de parcourir une liste de fiches manga dans une dialog compacte, sans ouvrir chaque résultat dans la vue principale.

## Points d'entrée

- Chaque section de résultats scraper expose une action `Review rapide`.
- La recherche multi-sources, les vues combinées et les résultats de nouveautés utilisent la même dialog.
- L'action `Revoir rapidement les fiches` du workspace prend les onglets de type `scraper.details` dans leur ordre courant.

La liste est figée à l'ouverture. Elle contient uniquement les résultats visibles après les filtres d'affichage, les splits manuels et le tri courant.

## Fiche affichée

La dialog affiche une seule fiche à la fois. Sa section `Review rapide` dans l'onglet `Options`
permet d'afficher ou de masquer indépendamment :

- la couverture entière dans un cadre manga vertical au ratio `2:3` ;
- les informations générales (scraper, langues, pages et statut) ;
- le nombre de pages et le statut quand ils sont disponibles ;
- la description ;
- les correspondances potentielles avec un manga lu, bookmarké ou présent dans une liste, ainsi que la progression détectée d'une série ;
- les auteurs ;
- les tags ;
- les œuvres sources ;
- les fiches des scrapers disponibles pour un résultat fusionné ;
- les miniatures des pages.

Le titre, la progression, les erreurs de chargement et les actions de navigation restent toujours
visibles. Tous les éléments optionnels sont activés par défaut.

Les miniatures de pages restent visibles dans une bande fixe sous les informations. Cette bande
défile horizontalement quand toutes les miniatures ne tiennent pas dans la largeur de la dialog ;
la zone d'informations conserve son propre défilement vertical pour les descriptions longues.
Quand la largeur de l'écran le permet, les miniatures passent dans une grille à droite qui occupe
toute la hauteur utile et défile verticalement. La largeur historique de la fiche est conservée :
la largeur nécessaire à la grille est ajoutée à celle de la dialog afin de ne pas réduire la couverture
ou les informations. Si l'ensemble ne tient pas, la bande inférieure redevient le fallback. Les
ascenseurs des informations et des miniatures utilisent le style visuel de la review au lieu du rendu
natif du navigateur.

Dans `Options > Review rapide`, la largeur cible des miniatures est réglable de `64` à `240` px
(`112` par défaut), et la grille accepte de `1` à `6` miniatures maximum par ligne (`2` par défaut).
La vitesse du déplacement au clavier est réglable de `100` à `4000` px/s (`800` px/s par défaut).
Le nombre réel de colonnes ne dépasse jamais la place disponible. Le numéro de page est affiché dans
un petit badge superposé en bas à droite de chaque miniature.
Quand la source indique une page suivante ou davantage de pages que de miniatures chargées, un bouton
`Voir plus`/`Afficher toutes les pages`, placé après la dernière miniature dans la zone défilable,
reprend le même chargement progressif que la fiche classique.
Cliquer sur une miniature l'agrandit dans une surcouche sans ouvrir ni initialiser le lecteur.
Cette surcouche repose sur le composant réutilisable `ImageLightbox`, dont le zoom initial, les
bornes de zoom, le pas, la molette, les contrôles et les comportements de fermeture sont paramétrables.

Les métadonnées de la fiche détaillée sont chargées à la demande. Seule la couverture déjà connue de
la fiche immédiatement suivante est préchargée sans attendre. Chaque fiche supplémentaire attend un
nouveau créneau d'inactivité du renderer ; sa galerie est bornée à six miniatures préchargées avec au
plus deux décodages simultanés. Les images hors écran utilisent le chargement et le décodage différés.
Changer de fiche annule la file précédente et libère les images qui ne sont plus dans la fenêtre de
préchargement. Les correspondances potentielles et leur romanisation sont calculées dans un worker
backend persistant : les collections de lecture, bookmarks et listes ne lui sont transmises qu'une fois
par révision, puis seules les fiches nouvelles ou enrichies sont traitées. Le réglage
`Fiches suivantes à précharger` choisit cette profondeur de `0` à `20` (`2` par défaut). Si un
chargement échoue, les informations déjà présentes dans la card restent utilisables.

### Review depuis une vue auteur par série

Quand la review est lancée depuis une vue auteur actuellement affichée en mode `Par série`, chaque
vraie série ajoute un contexte compact au-dessus de la fiche sans remplacer la galerie de
miniatures : titre de la série, position dans la liste, nombre de chapitres et de sources, couverture
par langue et accès direct à chaque chapitre. Les flèches gauche et droite parcourent alors les
chapitres dans leur ordre d'affichage. Des actions séparées permettent de passer à la série
précédente ou suivante et d'ouvrir sa correspondance dans un nouvel onglet workspace en
arrière-plan.

Le résumé des langues est construit à partir des cards déjà chargées. Dans ce mode, les fiches
suivantes utilisent la même profondeur de préchargement configurable que la review classique. La
couverture connue du prochain chapitre est lancée immédiatement, puis les détails, les miniatures et
les correspondances potentielles sont chargés pendant les créneaux d'inactivité. Une fiche déjà
visitée reste en cache pendant la session.

Le groupe racine `One Shot` n'est pas une série. Ses œuvres sont injectées comme fiches indépendantes
dans la review et conservent donc l'affichage et la navigation classiques, sans en-tête, résumé de
langues ni commandes de série.

Les actions internes ouvrent toujours un nouvel onglet workspace en arrière-plan :

- fiche manga ;
- page auteur ;
- page tag ;
- page d'œuvre source.

Le workspace prend donc en charge la cible `scraper.source` en plus des cibles fiche, auteur et tag.

## Navigation et bookmark

- `Précédent` revient à la fiche précédente.
- `Suivant` ignore la fiche courante et avance.
- `Bookmark et suivant` enregistre la fiche, puis avance uniquement si l'enregistrement réussit.
- Si la fiche est déjà bookmarkée, l'action avance sans retirer le bookmark.
- Le bouton discret en forme d'œil, à côté du titre, permet de marquer explicitement la fiche comme
  lue ou de retirer cet état. Il réutilise l'historique de lecture des cards et reflète immédiatement
  l'état enregistré.
- L'état exact tient compte des URL demandée, finale et issue du résultat afin de rester visible après
  une redirection de la source.
- Les correspondances probables sont affichées avec les mêmes boutons détaillés que sur la fiche
  classique. Tenter de bookmarker malgré une correspondance ouvre la même confirmation
  `Bookmarker quand même`, avec le détail Lecture/Bookmark/Liste.
- Quand le parseur de titre détecte une séquence plus avancée que la lecture connue, la review
  affiche le tag `Série commencée`. Si aucune entrée actuelle ou antérieure n'est terminée,
  elle affiche `Précédents non lus` et l'ajout du bookmark demande également confirmation.
- Après la dernière fiche, un résumé de session permet de recommencer ou de revenir à la dernière fiche.

Les auteurs favoris sont signalés en jaune avec une étoile et les tags favoris en rose avec une
étoile. La correspondance réutilise les noms et URL favoris du scraper courant.

Dans un résultat fusionné, le bookmark utilise la source dont le titre et la couverture sont mis en avant. Cette source est choisie avec le classement `Langue du titre des cartes fusionnées`, puis avec la première source du groupe si aucune priorité ne correspond.

Une fiche devient vue dès qu'elle est affichée par la review. Pour un résultat fusionné, toutes les sources de la card sont enregistrées comme vues.

## Raccourcis

Les paramètres contiennent une catégorie dédiée `Review rapide`. Chaque action accepte jusqu'à trois raccourcis :

- fiche ou chapitre précédent : `Flèche gauche` par défaut ;
- fiche ou chapitre suivant : `Flèche droite` par défaut ;
- bookmark et fiche suivante : appui long sur `Flèche droite` par défaut ;
- ouvrir ou fermer les correspondances potentielles disponibles : `E` par défaut ;
- basculer l'état lu de la fiche : `R` par défaut ;
- série précédente : `Maj + Flèche gauche` par défaut ;
- série suivante : `Maj + Flèche droite` par défaut ;
- ouvrir la série dans un nouvel onglet : `O` par défaut ;
- défilement des miniatures en arrière : `Flèche haut` par défaut ;
- défilement des miniatures en avant : `Flèche bas` par défaut.

Un appui court et un appui long sur la même touche peuvent donc déclencher deux actions différentes.
La durée requise pour tous les raccourcis longs est un réglage global dans `Options > Interactions`,
de `200` à `1500` ms (`450` ms par défaut). Lors de l'enregistrement d'un raccourci, relâcher la
touche enregistre un appui court et la maintenir pendant cette durée enregistre un appui long.

`Échap` ferme la dialog. Les raccourcis de review sont capturés par la dialog afin de ne pas déclencher simultanément ceux du lecteur affiché derrière elle.
Le défilement est vertical dans la galerie latérale et horizontal dans la bande inférieure. Les
raccourcis s'alignent sur la ligne suivante ou précédente au lieu d'utiliser une distance fixe, sans
modifier la molette ni l'ascenseur. Leur animation respecte la vitesse configurée dans les options de
review rapide. Les appuis successifs s'ajoutent à la destination courante sans attendre la fin de
l'animation : deux appuis descendent donc immédiatement de deux lignes. En fin de galerie, deux
appuis `Bas` consécutifs réellement bloqués
par la limite déclenchent `Voir plus`. Les deux positions de scroll reviennent au début dès que la
fiche courante change.
