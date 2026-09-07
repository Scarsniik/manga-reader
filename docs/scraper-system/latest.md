# Mode Nouveautes

Date : 2026-08-03

Le mode `Nouveautes` affiche des resultats fusionnes qui sont encore consideres comme nouveaux par
l'historique de vue des cards. La vue ouvre d'abord l'onglet `Sources`, puis propose l'onglet
`Auteurs`. Une card reste dans la vue tant qu'elle garde son liseret vert dans la liste courante.
Au rechargement, les cards deja vues disparaissent.

Le filtre de langue d'affichage est applique avant le calcul de l'etat nouveau. Une card filtree sur
`Anglais` reste donc visible uniquement si au moins une de ses sources anglaises est nouvelle. Une
source nouvelle dans une autre langue ne suffit pas. Un split manuel est lui aussi applique avant ce
calcul afin que chaque card separee respecte individuellement son propre etat de vue.

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

Le bouton `Progression des scans profonds`, dans l'en-tete de la vue, ouvre une modale de gestion
des checkpoints. Elle separe les tags favoris et les scrapers dans deux onglets. Chaque element est
depliable, puis organise en sous-sections elles aussi depliables : une sous-section par source d'un
tag favori, ou par couple module/requete d'un scraper. Les variantes de langues affichent la derniere
page traitee, la prochaine page de reprise, la date de mise a jour, les URLs connues, les blocages
temporaires et, pour les checkpoints recents, si la fin du catalogue a ete atteinte.

Un reset peut viser tout un tag favori, tout un scraper ou une seule de leurs sous-sections. Il
supprime tous les checkpoints de langues de la cible apres confirmation. Il ne supprime ni
l'historique des cards vues ni les favoris. Le prochain scan profond concerne repart donc de la
zone recente puis reparcourt l'ancien catalogue depuis le debut, en recreant progressivement ses
checkpoints. Le reset d'un scraper ne supprime pas les checkpoints des tags parcourus avec ce meme
scraper.

Les checkpoints sont separes par selection de langues. `Toutes les langues`, `ja`, `en` et `ja+en`
ont donc chacun un point de reprise different.

L'onglet propose trois modes dans un panneau de collecte dedie : `Scan rapide`, `Scanner sans quota`
et `Scan profond`.

`Scanner sans quota` reprend les regles du scan rapide mais retire le quota de resultats par source.
Il continue donc la pagination tant que des nouveautes sont trouvees et s'arrete en retrouvant la
zone de cards deja vues. Un garde-fou limite ce mode par source afin qu'un nouveau
scraper, sans historique permettant de reconnaitre la zone deja vue, ne parcoure pas accidentellement
la totalite d'un catalogue. Sa valeur globale est configuree par
`scraperLatestContinuousPageSafetyLimit` (100 pages par defaut, minimum 1) et peut etre remplacee
temporairement dans les parametres de session. Ce mode est egalement disponible quand la collecte
en arriere-plan est activee. Le retrait du quota de resultats ne desactive pas la limite de refus
par langue : un scraper qui ne retourne aucun resultat dans une langue incluse est toujours arrete
au seuil `scraperLatestLanguageRejectLimit`, y compris pendant une collecte en arriere-plan.

Le scan profond commence toujours par la zone recente, avec la meme detection de zone deja vue que le
scan rapide. Tant que cette premiere phase trouve assez de nouveautes pour remplir le quota, le
checkpoint n'est pas consulte. Si la zone deja vue est atteinte avant que le quota soit rempli, le scan
reprend alors depuis le checkpoint compatible pour rechercher d'anciennes cards jamais vues. Si aucun
checkpoint exact n'existe pour la requete et les langues incluses, il continue la pagination normale au
lieu de s'arreter a la premiere page deja connue ou ignoree par langue. Le checkpoint version 2 memorise
la prochaine page non traitee meme lorsqu'aucune card de la page precedente n'a ete acceptee. Les anciens
checkpoints ancres sur une card restent lus : leur page est rejouee une fois pour ne rien sauter. Le
parametre `scraperLatestDeepPageLimit` limite le nombre total de pages consultees par source et par
lancement, phase recente comprise. Sa valeur par defaut est 50 et son minimum est 1.

Sous les trois modes de scan, une barre `Reglages et reprise` regroupe `Parametres session` et le
controle partage `Scraper et ajouter`. Son champ numerique accepte au minimum une page et remplace
l'ancien couple `Passes` / `Continuer`. La barre est placee avant le resume et la grille pour pouvoir
ajuster ou relancer la collecte avant de parcourir les cards. Le controle est actif uniquement si le
quota concerne a ete atteint et qu'au moins une source garde une suite possible. Une collecte arretee
avant son quota, par exemple faute de nouveautes, ne peut pas etre reprise. Apres un scan rapide,
chaque page demandee ajoute une nouvelle reprise rapide depuis le curseur dynamique du scan precedent,
sans vider les resultats deja affiches.

Un second bouton `Continuer` est affiche sous les resultats quand des cards sont visibles. Il reprend
le meme curseur rapide, mais remplace la liste courante par les resultats de la nouvelle reprise.

Le panneau `Detail des sources` affiche l'etat de chaque source avec un indicateur a droite : bleu
pour une source en cours, vert pour une source terminee avec suite disponible, jaune pour une source
terminee sans suite, rouge pour une source en erreur.

Les checkpoints sont aussi mis a jour depuis le navigateur scraper classique quand l'utilisateur
avance dans les pages `Homepage` ou `Recherche`. Un long scroll manuel peut donc servir de nouveau
point de reprise pour `Nouveautes`, sans calcul fragile base uniquement sur un numero de page.

L'onglet peut aussi recevoir une liste de langues incluses via le parametre
`scraperLatestIncludedLanguageCodes`. Cette liste est exclusive : quand elle contient au moins une
langue, une card dont la langue n'est pas dans la liste est ignoree avant le comptage des
nouveautes. Le runtime continue donc a charger des pages jusqu'a atteindre la limite avec des
resultats dans les langues incluses, ou jusqu'a la fin de pagination. Si la liste est vide, toutes
les langues sont acceptees.

Dans les filtres d'inclusion, le clic gauche inclut une valeur et le clic droit l'exclut. Une valeur
exclue apparait en rouge et retire les sources correspondantes du scan.

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

Les quotas ont un minimum de 1 et pas de limite haute. Le parametre
`scraperLatestResultLimitMode` choisit leur mode de calcul :

- `total`, valeur par defaut, applique `scraperLatestScraperResultLimit` au total des scrapers inclus
  et `scraperLatestTagResultLimit` separement a chaque tag favori, toutes ses sources confondues
- `perSource` conserve l'ancien comportement et applique le quota correspondant a chaque source

En mode `total`, le runtime repartit chaque tour en lots optimistes equilibres dans chaque groupe de
quota : un groupe pour les scrapers et un groupe distinct pour chaque tag favori. Le lot de chaque
source est recalcule apres chaque tour a partir de ses resultats reellement conserves. Avec un objectif
de 20, deux sources commencent donc avec un objectif de 10 chacune ; si elles conservent ensuite 6 et
9 cards, le tour suivant demande respectivement 4 et 1 cards. Une source arrivee en fin de pagination
est retiree et son deficit est redistribue aux sources encore disponibles. Une source qui ne produit
aucun resultat avant la limite de refus par langue ou le plafond de pages est egalement retiree du
quota : cette indisponibilite est memorisee 24 heures pour la meme source, le meme tag et les memes
langues. Une relance avec un plafond de pages ou de refus de langue plus eleve ignore le blocage
precedent et reprend le parcours ; desactiver la limite de refus de langue l'ignore egalement. Un rejet
ordinaire, une erreur ou une source qui a deja produit un resultat ne suffit pas a
modifier les quotas ; sinon, seule une fin de pagination
confirmee libere la part manquante d'une source.

Chaque source conserve son curseur de pagination et les nouveautes restantes de la page deja chargee.
Les pages de liste dont le lot a besoin sont prechargees avant le traitement des details. Une page
supplementaire est aussi anticipee des que les candidates encore en tampon ne peuvent plus remplir le
lot courant. Le cache ne garde qu'une page pertinente par source et les requetes prechargees utilisent
le meme plafond global que le reste du scraping. Une continuation ajoute un nouveau quota a chaque
groupe, au lieu d'ajouter un quota pour chaque source.

La collecte normale et la collecte en arriere-plan appellent le meme moteur `runScraperLatestSearch`.
Le hook React de la vue normale ne contient plus de seconde implementation du scraping. Les cards
legeres restantes sont conservees en tampon et les pages de detail ne sont
chargees que jusqu'au remplissage du quota courant, y compris lorsque des candidates sont rejetees
par la langue, l'historique ou la blacklist.

Les URLs candidates des miniatures sont extraites sans requete de validation pendant la lecture des
pages de liste ou des fiches detail. La premiere URL est utilisee pour la card et les suivantes ne sont
essayees par l'image affichee qu'en cas d'erreur de chargement. Une candidate rejetee avant affichage
ne declenche donc aucune requete de miniature.

Le mode `Scanner sans quota` ignore ce choix, puisqu'il continue jusqu'a la zone deja vue ou jusqu'a
son garde-fou.

`scraperLatestResultLimit` reste conserve comme valeur historique de compatibilite. Si une valeur tres
grande est configuree, le runtime suit ce choix et peut donc charger beaucoup de pages.
L'en-tete des resultats propose aussi des parametres de session pour remplacer temporairement le
mode de calcul, les quotas des scrappers et des tags favoris, le nombre de scrapings simultanes, la limite du
scan profond, le garde-fou du scan sans quota, le seuil de cards vues d'affilee en scan rapide et la
limite de refus par langue. Ces
valeurs ne sont pas sauvegardees dans les settings globaux et le resume commence par un message
`Override de session actif` tant qu'elles sont utilisees.
Le parametre global `scraperLatestConcurrency` a un minimum de 1 et pas de limite haute. Il plafonne
les requetes de scraping simultanees, y compris les pages de liste prechargees et les pages de detail,
et limite aussi les sources executees en parallele dans les onglets `Sources` et `Auteurs` du mode
`Nouveautes`. La valeur par defaut est 2.
Le parametre global `scraperLatestQuickConsecutiveSeenStopThreshold` a un minimum de 0. Il indique
combien de cards deja vues d'affilee sont tolerees avant que le scan rapide s'arrete. Le parametre
global `scraperLatestDeepPageLimit` a un minimum de 1 et vaut 50 par defaut.

## Diagnostic de performances

L'onglet `Developpeur` des parametres permet d'activer les rapports de performance des nouveautes.
Le reglage est desactive par defaut et s'applique au moteur commun, donc aussi bien au premier plan
qu'a l'arriere-plan. Lorsqu'il est active, chaque recherche produit un profil JSONL dans
`data/scraper-latest-diagnostics` sous le dossier utilisateur de l'application. Le profil separe le
temps passe dans la file du limiteur global du temps HTTP reel. Il trace aussi les lots par source,
les tours de quota, l'attente du planificateur, les pages prechargees puis reutilisees ou abandonnees,
et le nombre de fiches detail chargees par rapport aux resultats gardes.

La commande `npm run diagnostics:scraper-latest` analyse le profil le plus recent et ecrit un fichier
`*.summary.json` a cote du JSONL. Elle signale les attentes de file anormales, les requetes lentes,
les barrieres entre sources, les rejets couteux et un faible taux d'utilisation du prechargement.
Un profil precis peut etre analyse avec
`npm run diagnostics:scraper-latest -- --file <chemin-du-profil.jsonl>`.

La selection propose aussi `Inconnue`. Elle garde les cards sans langue detectee quand une
restriction de langue est activee. Sans cette option, les cards sans langue detectee sont ignorees
comme les autres cards hors liste. Pour tout accepter, il faut laisser la liste de langues incluses
vide.

La vue affiche un avertissement si l'historique de vue des cards n'est pas configure en illimite
sur la limite globale, la conservation des cards vues et la conservation des cards lues. Dans ce
cas, des cards deja vues peuvent redevenir des nouveautes apres nettoyage automatique.

## Indicateur des recherches en arriere-plan

Le bouton `Recherches` de l'en-tete conserve le compteur des recherches actives. Il affiche aussi
un badge vert distinct pour les recherches terminees qui n'ont pas encore ete consultees. Ce badge
disparait pour une recherche apres l'ouverture de ses resultats.

## Onglet Auteurs

L'onglet `Auteurs` regroupe les sources des auteurs favoris inclus. Il charge les pages auteur avec
le meme runtime que les favoris auteur, puis fusionne les resultats comme la recherche multi-sources.

Le filtre `Auteurs favoris inclus` utilise le parametre
`scraperLatestIncludedAuthorFavoriteIds`. Si la liste est vide, tous les auteurs favoris sont
inclus par defaut. La valeur `__no_author_favorites__` correspond a l'option `Aucun`. Si la liste
contient des IDs d'auteurs favoris, seuls ces auteurs favoris sont lances.

Le filtre `Langues incluses` de cet onglet utilise le parametre independant
`scraperLatestAuthorIncludedLanguageCodes`. Les sources hors selection sont ignorees des leur
chargement, avant la romanisation, le dedoublonnage et la fusion des cards. Une liste vide accepte
toutes les langues. Le clic gauche inclut une langue et le clic droit l'exclut.

Si les auteurs favoris sont sur `Aucun` ou qu'aucune source auteur lancable n'est disponible, les
actions de chargement sont bloquees jusqu'a ce qu'au moins une source soit selectionnee.

Le nombre de pages chargees par source reprend le parametre global
`scraperAuthorFavoritePageCount`. Les resultats deja connus dans l'historique de vue ne sont pas
affiches, mais ils n'arretent pas le parcours : le chargement continue jusqu'a la limite de pages
ou jusqu'a la fin reelle de la pagination. Le quota de resultats et le seuil de cards deja vues du
scan rapide ne s'appliquent pas aux auteurs. Le nombre de sources auteur chargees en parallele
reprend `scraperLatestConcurrency`.

Chaque collecte terminee fusionne les cards scrapees dans le fichier de cache de l'auteur favori
concerne, y compris les cards deja connues qui ne sont pas affichees comme nouveautes. Comme cette
collecte peut etre limitee en pages, elle complete le cache existant au lieu de le remplacer. Les
sources et les cards ayant la meme cible canonique sont dedoublonnees avant la sauvegarde.

Le reglage `Utiliser le cache pour les nouveautes auteurs` permet de reutiliser ces fichiers avant
de lancer un scraping. L'anciennete maximale acceptee est configuree en heures avec
`Anciennete maximale du cache des nouveautes auteurs` (24 heures par defaut).
La validation est faite separement pour chaque auteur :

- le cache doit provenir d'un chargement complet
- sa date `cachedAt` doit respecter l'anciennete maximale
- le favori ne doit pas avoir ete modifie apres cette date
- la version du favori enregistree dans le cache doit encore correspondre a la version actuelle

Les auteurs dont le cache est valide sont charges depuis leur fichier, tandis que les autres sont
rescrapes normalement pendant la meme recherche. Une simple lecture du cache ne modifie pas sa date.
Cette politique est identique pour les recherches lancees au premier plan et en arriere-plan.

## Reglages par scraper

Dans les reglages globaux d'un scraper :

- `latest.enabled` active le scraper dans le filtre `Scrappers inclus` de l'onglet `Sources`
- `latest.module` vaut `homepage` ou `search`

Le choix du module est propose uniquement si le module correspondant est configure sur le scraper.
Si `search` est choisi, l'activation automatique `homeSearch.enabled` ne change rien au mode
`Nouveautes` : seule la requete `homeSearch.query` est reutilisee.
