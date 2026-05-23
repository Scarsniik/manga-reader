# Mode Nouveautes

Date : 2026-05-23

Le mode `Nouveautes` affiche des resultats fusionnes qui sont encore consideres comme nouveaux par
l'historique de vue des cards. La vue ouvre d'abord l'onglet `Scrappers`, puis propose l'onglet
`Auteurs`. Une card reste dans la vue tant qu'elle garde son liseret vert dans la liste courante.
Au rechargement, les cards deja vues disparaissent.

La collecte ne se lance pas automatiquement a l'ouverture de la vue ni au changement d'onglet.
L'utilisateur doit cliquer sur `Charger`, puis sur `Recharger` pour relancer une collecte.

## Onglet Scrappers

L'onglet `Scrappers` parcourt chaque scraper active pour les nouveautes. Pour chaque scraper, il
charge des pages jusqu'a trouver `scraperLatestResultLimit` resultats non vus, ou jusqu'a ne plus
avoir de page suivante.

L'onglet peut aussi recevoir une liste de langues incluses via le parametre
`scraperLatestIncludedLanguageCodes`. Cette liste est exclusive : quand elle contient au moins une
langue, une card dont la langue n'est pas dans la liste est ignoree avant le comptage des
nouveautes. Le runtime continue donc a charger des pages jusqu'a atteindre la limite avec des
resultats dans les langues incluses, ou jusqu'a la fin de pagination. Si la liste est vide, toutes
les langues sont acceptees.

Chaque scraper choisit son module de collecte :

- `Homepage` charge le module `Homepage`
- `Recherche` charge le module `Recherche` avec `homeSearch.query` comme requete par defaut

Le parametre global `scraperLatestResultLimit` a un minimum de 1 et pas de limite haute. Si une
valeur tres grande est configuree, le runtime suit ce choix et peut donc charger beaucoup de pages.

La selection propose aussi `Inconnue`. Elle garde les cards sans langue detectee quand une
restriction de langue est activee. Sans cette option, les cards sans langue detectee sont ignorees
comme les autres cards hors liste. Pour tout accepter, il faut laisser la liste de langues incluses
vide.

La vue affiche un avertissement si l'historique de vue des cards n'est pas configure en illimite
sur la limite globale, la conservation des cards vues et la conservation des cards lues. Dans ce
cas, des cards deja vues peuvent redevenir des nouveautes apres nettoyage automatique.

## Onglet Auteurs

L'onglet `Auteurs` regroupe toutes les sources des auteurs favoris. Il charge les pages auteur avec
le meme runtime que les favoris auteur, puis fusionne les resultats comme la recherche multi-sources.

Le nombre de pages chargees par source reprend le parametre global
`scraperAuthorFavoritePageCount`. Les resultats deja connus dans l'historique de vue ne sont pas
affiches.

## Reglages par scraper

Dans les reglages globaux d'un scraper :

- `latest.enabled` active le scraper dans l'onglet `Scrappers`
- `latest.module` vaut `homepage` ou `search`

Le choix du module est propose uniquement si le module correspondant est configure sur le scraper.
Si `search` est choisi, l'activation automatique `homeSearch.enabled` ne change rien au mode
`Nouveautes` : seule la requete `homeSearch.query` est reutilisee.
