# Mode Nouveautes

Date : 2026-05-25

Le mode `Nouveautes` affiche des resultats fusionnes qui sont encore consideres comme nouveaux par
l'historique de vue des cards. La vue ouvre d'abord l'onglet `Sources`, puis propose l'onglet
`Auteurs`. Une card reste dans la vue tant qu'elle garde son liseret vert dans la liste courante.
Au rechargement, les cards deja vues disparaissent.

La collecte ne se lance pas automatiquement a l'ouverture de la vue ni au changement d'onglet.
L'utilisateur doit lancer explicitement une collecte depuis l'action de l'onglet courant.

## Onglet Sources

L'onglet `Sources` parcourt les scrapers inclus et les tags favoris inclus. Pour chaque source, le
mode rapide part de la premiere page. Sur cette premiere page, tant qu'au moins une card incluse est
encore non vue, les nouveautes de la page sont affichees et le scan peut continuer. A partir des
pages suivantes, le scan rapide affiche les nouveautes trouvees sur la page puis s'arrete quand la
liste atteint plus de cards deja vues d'affilee que le seuil configure. Il ne saute pas vers un
ancien checkpoint : il sert a recuperer les sorties recentes sans crawler loin.

Le bouton `Continuer` reprend uniquement depuis le curseur garde en memoire par le dernier scan
rapide. Ce curseur pointe la page suivante apres l'arret rapide, mais il n'est pas ecrit sur disque
et ne reutilise pas le checkpoint persistant. La reprise garde la meme regle d'arret que le scan
rapide.

Quand un checkpoint existe pour la source, il est reserve au scan profond. Le checkpoint contient
le scraper, le module (`homepage`, `search` ou `tag`), la requete ou l'URL du tag, les langues
incluses, la page, les URLs de pagination et l'identite d'une card d'ancrage. Le runtime verifie
cette card d'ancrage avant de continuer autour du checkpoint.

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
inclus. La valeur `__no_scrapers__` correspond a l'option `Aucun` et exclut tous les scrapers.
Si la liste contient des IDs, seuls ces scrapers sont lances par l'onglet `Sources`.

Le filtre `Tags favoris inclus` utilise le parametre `scraperLatestIncludedTagFavoriteIds`. Contrairement
aux scrapers, la liste vide signifie qu'aucun tag favori n'est inclus par defaut. L'option `Tous`
enregistre une valeur speciale qui inclut tous les tags favoris actuels et futurs. Si la liste contient
des IDs de tags favoris, seules les sources de ces tags favoris sont lancees. Chaque source tag utilise
le module `tag`, participe au scan rapide, au scan profond, au bouton `Continuer` et aux checkpoints
persistants des nouveautes.

Si les scrapers sont sur `Aucun` et qu'aucun tag favori lancable n'est inclus, les actions de scan
sont bloquees jusqu'a ce qu'au moins une source soit selectionnee.

Chaque scraper choisit son module de collecte :

- `Homepage` charge le module `Homepage`
- `Recherche` charge le module `Recherche` avec `homeSearch.query` comme requete par defaut

Le parametre global `scraperLatestResultLimit` a un minimum de 1 et pas de limite haute. Il s'applique
par source incluse. Si une valeur tres grande est configuree, le runtime suit ce choix et peut donc
charger beaucoup de pages.
Le parametre global `scraperLatestQuickConsecutiveSeenStopThreshold` a un minimum de 0. Il indique
combien de cards deja vues d'affilee sont tolerees avant que le scan rapide s'arrete. Le parametre
global `scraperLatestDeepPageLimit` a un minimum de 0. Avec 0, le scan profond continue
jusqu'a trouver assez de nouveautes ou jusqu'a la fin de pagination.

La selection propose aussi `Inconnue`. Elle garde les cards sans langue detectee quand une
restriction de langue est activee. Sans cette option, les cards sans langue detectee sont ignorees
comme les autres cards hors liste. Pour tout accepter, il faut laisser la liste de langues incluses
vide.

La vue affiche un avertissement si l'historique de vue des cards n'est pas configure en illimite
sur la limite globale, la conservation des cards vues et la conservation des cards lues. Dans ce
cas, des cards deja vues peuvent redevenir des nouveautes apres nettoyage automatique.

## Onglet Auteurs

L'onglet `Auteurs` regroupe les sources des auteurs favoris inclus. Il charge les pages auteur avec
le meme runtime que les favoris auteur, puis fusionne les resultats comme la recherche multi-sources.

Le filtre `Auteurs favoris inclus` utilise le parametre
`scraperLatestIncludedAuthorFavoriteIds`. Si la liste est vide, tous les auteurs favoris sont
inclus par defaut. La valeur `__no_author_favorites__` correspond a l'option `Aucun`. Si la liste
contient des IDs d'auteurs favoris, seuls ces auteurs favoris sont lances.

Si les auteurs favoris sont sur `Aucun` ou qu'aucune source auteur lancable n'est disponible, les
actions de chargement sont bloquees jusqu'a ce qu'au moins une source soit selectionnee.

Le nombre de pages chargees par source reprend le parametre global
`scraperAuthorFavoritePageCount`. Les resultats deja connus dans l'historique de vue ne sont pas
affiches.

## Reglages par scraper

Dans les reglages globaux d'un scraper :

- `latest.enabled` active le scraper dans le filtre `Scrappers inclus` de l'onglet `Sources`
- `latest.module` vaut `homepage` ou `search`

Le choix du module est propose uniquement si le module correspondant est configure sur le scraper.
Si `search` est choisi, l'activation automatique `homeSearch.enabled` ne change rien au mode
`Nouveautes` : seule la requete `homeSearch.query` est reutilisee.
