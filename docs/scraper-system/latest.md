# Mode Nouveautes

Date : 2026-05-24

Le mode `Nouveautes` affiche des resultats fusionnes qui sont encore consideres comme nouveaux par
l'historique de vue des cards. La vue ouvre d'abord l'onglet `Scrappers`, puis propose l'onglet
`Auteurs`. Une card reste dans la vue tant qu'elle garde son liseret vert dans la liste courante.
Au rechargement, les cards deja vues disparaissent.

La collecte ne se lance pas automatiquement a l'ouverture de la vue ni au changement d'onglet.
L'utilisateur doit lancer explicitement une collecte depuis l'action de l'onglet courant.

## Onglet Scrappers

L'onglet `Scrappers` parcourt chaque scraper active pour les nouveautes. Pour chaque scraper, le
mode rapide part de la premiere page et s'arrete des que la premiere card incluse de la page est deja
connue. Il ne saute pas vers un ancien checkpoint : il sert a recuperer les sorties recentes sans
crawler loin.

Le bouton `Continuer` reprend uniquement depuis le curseur garde en memoire par le dernier scan
rapide. Ce curseur pointe la page suivante apres l'arret rapide, mais il n'est pas ecrit sur disque
et ne reutilise pas le checkpoint persistant. La reprise garde la meme regle d'arret que le scan
rapide.

Quand un checkpoint existe pour le scraper, il est reserve au scan profond. Le checkpoint contient
le scraper, le module (`homepage` ou `search`), la requete, les langues incluses, la page, les URLs
de pagination et l'identite d'une card d'ancrage. Le runtime verifie cette card d'ancrage avant de
continuer autour du checkpoint.

Les checkpoints sont separes par selection de langues. `Toutes les langues`, `ja`, `en` et `ja+en`
ont donc chacun un point de reprise different.

L'onglet propose `Scan rapide` et `Scan profond` dans l'en-tete des resultats. Le scan profond
utilise le checkpoint quand il existe et peut continuer au-dela du budget rapide pour retrouver
d'anciennes cards jamais vues. Si aucun checkpoint exact n'existe pour la requete et les langues
incluses, il continue la pagination normale au lieu de s'arreter a la premiere page deja connue ou
ignoree par langue. Le parametre `scraperLatestDeepPageLimit` limite le nombre de pages consultees
en scan profond quand il est superieur a 0 ; la valeur 0 signifie aucune limite de pages.

Quand des cards apparaissent, un bouton `Continuer` devient disponible sous les resultats. Apres un
scan rapide, il ajoute une nouvelle passe rapide depuis le curseur dynamique du scan precedent.

Les checkpoints sont aussi mis a jour depuis le navigateur scraper classique quand l'utilisateur
avance dans les pages `Homepage` ou `Recherche`. Un long scroll manuel peut donc servir de nouveau
point de reprise pour `Nouveautes`, sans calcul fragile base uniquement sur un numero de page.

L'onglet peut aussi recevoir une liste de langues incluses via le parametre
`scraperLatestIncludedLanguageCodes`. Cette liste est exclusive : quand elle contient au moins une
langue, une card dont la langue n'est pas dans la liste est ignoree avant le comptage des
nouveautes. Le runtime continue donc a charger des pages jusqu'a atteindre la limite avec des
resultats dans les langues incluses, ou jusqu'a la fin de pagination. Si la liste est vide, toutes
les langues sont acceptees.

Le filtre `Scrappers inclus` utilise le parametre `scraperLatestIncludedScraperIds`. Il ne propose
que les scrapers actives par `latest.enabled`. Si la liste est vide, tous les scrapers actifs sont
inclus. Si elle contient des IDs, seuls ces scrapers sont lances par l'onglet `Scrappers`.

Chaque scraper choisit son module de collecte :

- `Homepage` charge le module `Homepage`
- `Recherche` charge le module `Recherche` avec `homeSearch.query` comme requete par defaut

Le parametre global `scraperLatestResultLimit` a un minimum de 1 et pas de limite haute. Si une
valeur tres grande est configuree, le runtime suit ce choix et peut donc charger beaucoup de pages.
Le parametre global `scraperLatestDeepPageLimit` a un minimum de 0. Avec 0, le scan profond continue
jusqu'a trouver assez de nouveautes ou jusqu'a la fin de pagination.

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
