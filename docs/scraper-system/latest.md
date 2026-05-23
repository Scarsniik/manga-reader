# Mode Nouveautes

Date : 2026-05-20

Le mode `Nouveautes` affiche des resultats fusionnes qui sont encore consideres comme nouveaux par
l'historique de vue des cards. La vue ouvre d'abord l'onglet `Scrappers`, puis propose l'onglet
`Auteurs`. Une card reste dans la vue tant qu'elle garde son liseret vert dans la liste courante.
Au rechargement, les cards deja vues disparaissent.

## Onglet Scrappers

L'onglet `Scrappers` parcourt chaque scraper active pour les nouveautes. Pour chaque scraper, il
charge des pages jusqu'a trouver `scraperLatestResultLimit` resultats non vus, ou jusqu'a ne plus
avoir de page suivante.

Chaque scraper choisit son module de collecte :

- `Homepage` charge le module `Homepage`
- `Recherche` charge le module `Recherche` avec `homeSearch.query` comme requete par defaut

Le parametre global `scraperLatestResultLimit` a un minimum de 1 et pas de limite haute. Si une
valeur tres grande est configuree, le runtime suit ce choix et peut donc charger beaucoup de pages.

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
