# Tags favoris scraper

Date : 2026-05-15

Les tags favoris scraper permettent de sauvegarder une page tag et de regrouper plusieurs sources
tag sous un meme tag logique.

Un favori tag contient :

- un identifiant interne
- un nom affiche
- une couverture optionnelle
- une ou plusieurs sources scraper

Chaque source stocke :

- le `scraperId`
- l'URL ou la requete de page tag
- le nom du tag tel qu'il existe sur ce scraper
- une couverture optionnelle

## Ajout depuis une page tag

Sur une page tag scraper, une etoile permet d'ajouter la page aux favoris.

Le formulaire d'ajout reprend le meme modele que les auteurs favoris :

- creation d'un nouveau tag favori
- ou rattachement de la source a un tag favori existant
- saisie du nom du tag propre au scraper courant

Dans l'onglet tag existant, le formulaire selectionne par defaut le favori dont le nom affiche ou
les noms de sources existantes se rapprochent le plus du nom tag courant.

L'etoile devient active quand la source tag courante est deja rattachee a un favori.

## Vue Tags favoris

La vue `Tags favoris` est disponible dans le menu deroulant principal, au meme niveau que
`Auteurs favoris`.

La liste affiche les tags sauvegardes sous forme de cards. Ouvrir un tag lance la premiere page de
chaque source associee, puis fusionne les cards dans une seule liste de resultats.

La page d'un tag favori affiche la liste des sources scraper associees avant les resultats. Chaque
source peut etre ouverte dans sa page tag d'origine. Les resultats exposes sur la page courante
peuvent etre filtres par langue avec les memes controles que la recherche multi-sources.

La pagination reste globale au favori :

- `Page suivante` charge la page suivante de chaque source qui peut continuer
- `Page precedente` revient a la page deja chargee precedente
- les actions de pagination sont affichees au-dessus et au-dessous des resultats
- la vue n'affiche pas de separation par scraper

Les donnees sont stockees dans `scraper-tag-favorites.json` dans le dossier de donnees utilisateur
de l'application.
